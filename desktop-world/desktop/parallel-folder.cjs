'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class ParallelFolder {
  constructor({ thumbnail = async () => '', onState = () => {} } = {}) {
    this.thumbnail = thumbnail; this.onState = onState; this.folder = ''; this.watcher = null; this.timer = null; this.generation = 0; this.connectRevision = 0; this.cache = new Map();this.latest = { active: false, images: [] };
  }
  state() { return this.latest; }
  async connect(folder) {
    const request = ++this.connectRevision;
    const stat = await fsp.lstat(folder);
    if (request !== this.connectRevision) return this.latest;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('请选择本机的普通文件夹。');
    const real = await fsp.realpath(folder);
    if (request !== this.connectRevision) return this.latest;
    if (process.platform === 'win32' && !/^[a-z]:\\/i.test(real.replace(/^\\\\\?\\/, ''))) throw new Error('暂不关联网络共享文件夹。');
    this.disconnect(false);this.folder = real;const generation = this.generation;
    this.watcher = fs.watch(real, () => { clearTimeout(this.timer);this.timer = setTimeout(() => this.refresh(generation), 250); });
    this.watcher.on('error', () => { if (generation !== this.generation) return;this.disconnect();this.latest = { active: false, images: [], error: '关联文件夹已不可用，请重新选择。' };this.onState(this.latest); });
    await this.refresh(generation);return this.latest;
  }
  async refresh(generation = this.generation) {
    if (generation !== this.generation || !this.folder) return;
    const folder = this.folder;
    const revision = this.refreshRevision = (this.refreshRevision || 0) + 1;
    try {
      const entries = (await fsp.readdir(folder, { withFileTypes: true })).filter(e => e.isFile() && !e.isSymbolicLink());
      if (generation !== this.generation || revision !== this.refreshRevision) return;
      const names = new Set(entries.map(e => e.name.toLowerCase()));const images = [];
      for (const entry of entries.filter(e => /\.(png|jpe?g|webp|bmp)$/i.test(e.name)).slice(0, 160)) {
        if (images.length >= 8) break;
        const filename = path.join(folder, entry.name);
        // A user may move a photo between directory enumeration and decoding.
        const stat = await fsp.lstat(filename).catch(() => null);
        if (generation !== this.generation || revision !== this.refreshRevision) return;
        if (!stat) continue;
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) continue;
        const key = `${filename}:${stat.size}:${stat.mtimeMs}`;let thumbnail = this.cache.get(key);
        if (thumbnail === undefined) {
          thumbnail = await this.thumbnail(filename).catch(() => '');
          if (generation !== this.generation || revision !== this.refreshRevision) return;
          this.cache.set(key, thumbnail);
        }
        if (!thumbnail) continue;
        images.push({ id: crypto.createHash('sha256').update(entry.name).digest('hex').slice(0, 16), name: path.parse(entry.name).name.slice(0, 40), thumbnail });
      }
      if (generation !== this.generation || revision !== this.refreshRevision) return;
      if (this.cache.size > 32) this.cache.clear();
      this.latest = { active: true, folder: this.folder, sunPresent: names.has('太阳.txt') || names.has('sun.txt'), wind: names.has('风.txt') || names.has('wind.txt'), rain: names.has('雨.txt') || names.has('rain.txt'), images };
      this.onState(this.latest);
    } catch { if (generation === this.generation && revision === this.refreshRevision) { this.latest = { active: false, images: [], error: '暂时无法读取这个文件夹，请检查它是否仍在原处。' };this.onState(this.latest); } }
  }
  disconnect(notify = true) { ++this.connectRevision;++this.generation;clearTimeout(this.timer);this.watcher?.close();this.watcher = null;this.folder = '';this.cache.clear();this.latest = { active: false, images: [] };if (notify) this.onState(this.latest);return this.latest; }
}

async function createPlayFolder(parent) {
  // Create a dedicated sandbox; never seed or modify a pre-existing folder.
  let folder;
  for (let i = 0; i < 100; i++) {
    folder = path.join(parent, '息屿互动桌面' + (i ? '-' + i : ''));
    try { await fsp.mkdir(folder);break; } catch (error) { if (error.code !== 'EEXIST' || i === 99) throw error; }
  }
  await fsp.writeFile(path.join(folder, '太阳.txt'), '把这个文件移出此文件夹，花园会进入夜色；移回来，太阳重新出现。\r\n', { flag: 'wx' });
  await fsp.writeFile(path.join(folder, '玩法说明.txt'), '这是息屿专用的互动文件夹，不会整理或移动其他桌面文件。\r\n太阳.txt 在这里：白天；移出：夜晚。\r\n创建 风.txt：起风；移出：风停。创建 雨.txt：落雨；移出：雨停。\r\n放入 PNG、JPG、WebP 或 BMP 图片：成为带相片头像的访客。最多 8 位，每张不超过 10 MB。\r\n只在本机生成缩略图，不上传。不读取文本正文。删除或移出图片，只让访客离开。\r\n', { flag: 'wx' });
  return folder;
}
module.exports = { ParallelFolder, createPlayFolder };
