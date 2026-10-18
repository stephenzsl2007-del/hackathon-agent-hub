'use strict';
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function cleanJSON(value, maxBytes = 2 * 1024 * 1024) {
  const encoded = JSON.stringify(value);
  if (!encoded || Buffer.byteLength(encoded) > maxBytes) throw new Error('存档过大，暂时无法保存。');
  const result = JSON.parse(encoded);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('存档格式不正确。');
  const check = (node, depth = 0) => {
    if (depth > 24) throw new Error('存档层级过深。');
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node) && node.length > 20000) throw new Error('存档对象过多。');
    for (const key of Object.keys(node)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('存档包含无效字段。');
      check(node[key], depth + 1);
    }
  };
  check(result);
  return result;
}

class AtomicStore {
  constructor(filename, { delay = 500, maxBytes = 2 * 1024 * 1024 } = {}) {
    this.filename = filename; this.delay = delay; this.maxBytes = maxBytes;
    this.current = null; this.pending = null; this.waiters = []; this.timer = null; this.writing = null; this.loadError = null;
  }
  async load() {
    if (this.current) return { ok: true, ...this.current, recovered: this.recovered || false };
    const parse = async filename => {
      const text = await fs.readFile(filename, 'utf8');
      if (Buffer.byteLength(text) > this.maxBytes + 4096) throw new Error('存档超出大小限制。');
      const saved = JSON.parse(text);
      if (saved.schemaVersion !== 1 || !Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('存档版本暂不兼容。');
      cleanJSON(saved.state, this.maxBytes);
      return saved;
    };
    try { this.current = await parse(this.filename); }
    catch (error) {
      if (error.code === 'ENOENT') this.current = { schemaVersion: 1, revision: 0, savedAt: null, state: null };
      else {
        try {
          this.current = await parse(this.filename + '.bak');
          await fs.copyFile(this.filename, this.filename + `.corrupt-${Date.now()}`);
          this.recovered = true;
        } catch { this.loadError = '存档无法读取，已保留原文件。请先备份后重试。'; return { ok: false, error: this.loadError, revision: 0, state: null }; }
      }
    }
    return { ok: true, ...this.current, recovered: this.recovered || false };
  }
  async save(state, options = {}) {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    if (Number.isSafeInteger(options.baseRevision) && options.baseRevision !== this.current.revision) return { ok: false, error: '存档已更新，请重新同步。', revision: this.current.revision };
    try { this.pending = cleanJSON(state, this.maxBytes); }
    catch (error) { return { ok: false, error: error.message, revision: this.current.revision }; }
    const result = new Promise(resolve => this.waiters.push(resolve));
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.delay);
    return result;
  }
  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.writing) { await this.writing; return this.pending ? this.flush() : undefined; }
    if (!this.pending) return;
    const state = this.pending; this.pending = null;
    const waiters = this.waiters; this.waiters = [];
    const snapshot = { schemaVersion: 1, revision: (this.current?.revision || 0) + 1, savedAt: Date.now(), state };
    this.writing = (async () => {
      const temp = this.filename + `.tmp-${process.pid}`;
      try {
        await fs.mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
        const handle = await fs.open(temp, 'w', 0o600);
        try { await handle.writeFile(JSON.stringify(snapshot)); await handle.sync(); } finally { await handle.close(); }
        if (this.current?.revision && !this.recovered) await fs.copyFile(this.filename, this.filename + '.bak');
        await fs.rename(temp, this.filename);
        // Directory sync is best-effort; some filesystems do not expose it.
        try { const dir = await fs.open(path.dirname(this.filename), 'r'); try { await dir.sync(); } finally { await dir.close(); } } catch {}
        this.current = snapshot; this.recovered = false;
        waiters.forEach(resolve => resolve({ ok: true, revision: snapshot.revision, savedAt: snapshot.savedAt }));
      } catch {
        await fs.unlink(temp).catch(() => {});
        waiters.forEach(resolve => resolve({ ok: false, revision: this.current?.revision || 0, error: '保存失败。请检查磁盘空间与存档目录权限，当前小岛仍可继续使用。' }));
      }
    })();
    await this.writing; this.writing = null;
    if (this.pending && !this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.delay);
  }
}

const describeError = error => ({ ENOENT: '文件已经移动或不存在', EACCES: '没有权限处理这个文件', EPERM: '系统未允许回收这个文件', EBUSY: '文件正被占用，请稍后再试' }[error?.code] || error?.message || '系统回收失败，请稍后重试');
class FileRecycle {
  constructor({ trashItem, protectedPaths = [], now = Date.now, platform = process.platform, env = process.env, home = os.homedir() }) {
    this.trashItem = trashItem; this.now = now; this.batches = new Map(); this.activePaths = new Set();
    this.pathAPI = platform === 'win32' ? path.win32 : path;
    this.windows = platform === 'win32';
    const defaults = this.windows
      ? [env.SystemRoot || env.WINDIR || 'C:\\Windows', env.ProgramFiles || 'C:\\Program Files', env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', env.ProgramData || 'C:\\ProgramData', env.APPDATA, env.LOCALAPPDATA, this.pathAPI.join(home, 'AppData')]
      : ['/System', '/Library', '/Applications', '/bin', '/sbin', '/usr', '/etc', '/private/etc', '/private/var', path.join(home, 'Library'), path.join(home, '.Trash')];
    this.protectedPaths = [...defaults, ...protectedPaths].filter(Boolean).map(p => this._key(p));
  }
  _key(filename) {
    let resolved = this.pathAPI.resolve(filename);
    if (this.windows) {
      // realpath can return extended-length Windows paths. Compare their normal
      // drive / UNC forms so the namespace prefix cannot bypass protection.
      if (resolved.slice(0, 8).toUpperCase() === '\\\\?\\UNC\\') resolved = '\\\\' + resolved.slice(8);
      else if (resolved.startsWith('\\\\?\\')) resolved = resolved.slice(4);
    }
    return this.windows ? resolved.toLowerCase() : resolved;
  }
  _protected(filename) {
    const key = this._key(filename);
    // Local files only: a UNC/admin share can alias a protected local folder.
    return (this.windows && !/^[a-z]:\\/.test(key))
      || this.protectedPaths.some(base => key === base || key.startsWith(base.endsWith(this.pathAPI.sep) ? base : base + this.pathAPI.sep))
      || (this.windows && /(?:^|\\)\$recycle\.bin(?:\\|$)/i.test(key));
  }
  _prune() { for (const [key, batch] of this.batches) if (!batch.processing && this.now() > batch.expiresAt) this.batches.delete(key); }
  async prepare(paths) {
    this._prune();
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 30) return { ok: false, error: '一次请选择 1—30 个普通文件。', items: [] };
    const unique = new Set(); const items = [];
    for (const raw of paths) {
      const item = { id: crypto.randomUUID(), name: typeof raw === 'string' ? path.basename(raw).slice(0, 250) : '未知文件', status: 'rejected' };
      try {
        if (typeof raw !== 'string' || !path.isAbsolute(raw) || raw.includes('\0')) throw new Error('只接受本次拖入的真实文件');
        const selected = path.resolve(raw);
        if (unique.has(this._key(selected))) throw new Error('本批已包含这个文件');
        unique.add(this._key(selected));
        const stat = await fs.lstat(selected);
        if (stat.isSymbolicLink()) throw new Error('暂不回收符号链接，请选择原始文件');
        if (!stat.isFile()) throw new Error('暂不回收文件夹或应用，请选择普通文件');
        const real = await fs.realpath(selected);
        if (this._protected(real)) throw new Error('这个文件位于受保护目录，不能通过花园回收');
        await fs.access(real, constants.W_OK);
        await fs.access(path.dirname(real), constants.W_OK);
        item.path = real; item.size = stat.size; item.modifiedAt = stat.mtimeMs; item.status = 'ready';
        item.fingerprint = { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs };
      } catch (error) { item.error = describeError(error); }
      items.push(item);
    }
    const batchId = crypto.randomUUID(); const expiresAt = this.now() + 5 * 60 * 1000;
    this.batches.set(batchId, { items, expiresAt, result: null, promise: null, processing: false, cancelled: false });
    return { ok: true, batchId, expiresAt, items: items.map(({ fingerprint, ...item }) => item) };
  }
  cancel(batchId) {
    const batch = this.batches.get(batchId);
    if (!batch || batch.promise || batch.result) return { ok: false };
    batch.cancelled = true;
    return { ok: true };
  }
  async confirm(batchId) {
    const batch = typeof batchId === 'string' && this.batches.get(batchId);
    if (!batch || batch.cancelled || this.now() > batch.expiresAt) return { ok: false, batchId, items: [], rewards: 0, error: '这批文件已取消或超时，请重新拖入。' };
    if (batch.result) return { ...batch.result, rewards: 0, duplicate: true };
    if (batch.promise) return { ...await batch.promise, rewards: 0, duplicate: true };
    batch.processing = true;
    batch.promise = (async () => {
      const results = [];
      for (const item of batch.items) {
        const result = { id: item.id, name: item.name, status: 'failed' };
        if (item.status !== 'ready') { result.error = item.error; results.push(result); continue; }
        const key = this._key(item.path);
        if (this.activePaths.has(key)) { result.error = '这个文件正在被另一批处理'; results.push(result); continue; }
        this.activePaths.add(key);
        try {
          const stat = await fs.lstat(item.path);
          const old = item.fingerprint;
          if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== old.dev || stat.ino !== old.ino || stat.size !== old.size || stat.mtimeMs !== old.mtimeMs || await fs.realpath(item.path) !== item.path) throw new Error('文件在确认前发生变化，请重新拖入确认');
          if (this._protected(await fs.realpath(item.path))) throw new Error('这个文件位于受保护目录，不能通过花园回收');
          await this.trashItem(item.path);
          result.status = 'success';
        } catch (error) { result.error = describeError(error); }
        finally { this.activePaths.delete(key); }
        results.push(result);
      }
      const rewards = results.filter(item => item.status === 'success').length;
      batch.result = { ok: true, batchId, items: results, rewards, duplicate: false };
      return batch.result;
    })().finally(() => { batch.processing = false; });
    return batch.promise;
  }
}
class QuitHandshake {
  constructor({ timeout = 3000 } = {}) { this.timeout = timeout; this.pending = null; }
  request(send) {
    if (this.pending) return this.pending.promise;
    const requestId = crypto.randomUUID();
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const finish = (acknowledged, saved = false) => {
      if (!this.pending || this.pending.requestId !== requestId) return;
      clearTimeout(this.pending.timer);
      this.pending = null;
      resolve({ acknowledged, saved, requestId });
    };
    this.pending = { requestId, promise, finish, timer: setTimeout(() => finish(false), this.timeout) };
    try { send({ type: 'prepare-quit', requestId }); } catch { finish(false); }
    return promise;
  }
  acknowledge(requestId, saved = true) {
    if (!this.pending || typeof requestId !== 'string' || requestId !== this.pending.requestId) return { ok: false };
    this.pending.finish(true, saved === true);
    return { ok: true };
  }
}
module.exports = { AtomicStore, FileRecycle, QuitHandshake, cleanJSON };
