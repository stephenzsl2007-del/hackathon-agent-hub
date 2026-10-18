const STORAGE_KEY = 'xiyu-companion-v1';
const HOUR = 60 * 60 * 1000;
const DAY = HOUR * 24;
const clamp = (value, min, max, fallback = min) => Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;

function fileKind(name, type) {
  const extension = name.split('.').pop().toLowerCase();
  if (type.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|heic|bmp|avif)$/.test(extension)) return 'image';
  if (type.startsWith('audio/') || /^(mp3|wav|m4a|aac|ogg|flac)$/.test(extension)) return 'audio';
  if (type.startsWith('video/') || /^(mp4|mov|webm|mkv|avi)$/.test(extension)) return 'video';
  if (/^(pdf|txt|md|docx?|pptx?|xlsx?|csv|rtf|pages|key|numbers)$/.test(extension)) return 'document';
  return 'file';
}

function restoreData(saved, now) {
  const timestamp = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, now) : fallback;
  const data = {
    firstSeen: timestamp(saved?.firstSeen, now),
    lastFed: saved?.lastFed ? timestamp(saved.lastFed, 0) : 0,
    updatedAt: timestamp(saved?.updatedAt, now),
    satiety: saved && typeof saved.satiety === 'number' ? clamp(saved.satiety, 0, 100, 65) : 65,
    fedCount: saved && typeof saved.fedCount === 'number' ? Math.floor(clamp(saved.fedCount, 0, 1000000)) : 0,
    nourishment: saved && typeof saved.nourishment === 'number' ? clamp(saved.nourishment, 0, 12) : 0,
  };
  data.updatedAt = Math.max(data.firstSeen, data.updatedAt);
  return data;
}

/** A local companion. Desktop callers own persistence with persist: false. */
export class Companion {
  constructor({ onChange = () => {}, onFeed = () => {}, persist = true } = {}) {
    this.onChange = onChange;
    this.onFeed = onFeed;
    this._persist = Boolean(persist);
    this._destroyed = false;
    this._recentDrops = new Map();
    const now = Date.now();
    let saved;
    try {
      saved = this._persist ? JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null') : null;
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = null;
    } catch { saved = null; }
    this._data = restoreData(saved, now);
    this._refresh(false);
    this._visibility = () => { if (!globalThis.document?.hidden) this._refresh(true); };
    globalThis.document?.addEventListener('visibilitychange', this._visibility);
    this._timer = setInterval(() => this._refresh(true), 60000);
    this._timer.unref?.();
    this.onChange(this._snapshot());
  }

  _save() {
    if (!this._persist) return;
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...this._data })); }
    catch { /* Private browsing or full storage: the current visit still works. */ }
  }

  _refresh(notify) {
    if (this._destroyed) return;
    const now = Date.now();
    // Clock changes must never create negative hunger or a future birthday.
    this._data.firstSeen = Math.min(this._data.firstSeen, now);
    this._data.lastFed = Math.min(this._data.lastFed, now);
    const elapsed = Math.max(0, now - this._data.updatedAt);
    this._data.satiety = Math.max(0, this._data.satiety - elapsed / HOUR * 2);
    this._data.updatedAt = now;
    this._save();
    if (notify) this.onChange(this._snapshot());
  }

  _snapshot() {
    const ageDays = Math.max(0, (Date.now() - this._data.firstSeen) / DAY);
    // Both time and care matter: twelve full meals cannot skip seven real days.
    const growth = Math.min(1, ageDays / 7, this._data.nourishment / 12);
    const stage = ageDays >= 7 && growth >= 1 ? '成年'
      : ageDays >= 3 && growth >= 3 / 7 ? '成长期' : '幼崽';
    return {
      name: '团团',
      satiety: Math.round(this._data.satiety * 10) / 10,
      growth: Math.round(growth * 10000) / 10000,
      ageDays,
      stage,
      fedCount: this._data.fedCount,
      firstSeen: this._data.firstSeen,
      lastFed: this._data.lastFed,
    };
  }

  getState() {
    this._refresh(false);
    return this._snapshot();
  }

  serialize() {
    this._refresh(false);
    return { version: 1, ...this._data };
  }

  restore(snapshot) {
    if (this._destroyed || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    this._data = restoreData(snapshot, Date.now());
    this._recentDrops.clear();
    this._refresh(true);
    return true;
  }

  /** Only call after a confirmed native recycle, or while consuming earned feed. */
  awardMeal(count = 1, source = 'compost') {
    if (this._destroyed) return { ok: false, message: '团团暂时在休息。', kind: 'unavailable' };
    const meals = Math.floor(clamp(count, 0, 10));
    if (!meals) return { ok: false, message: '饲料篮还没有新的点心。', kind: 'empty' };
    this._refresh(false);
    if (this._data.satiety >= 99.5) return { ok: false, message: '团团已经吃饱啦，饲料可以留着下次再用。', kind: 'full' };
    const added = Math.min(meals * 18, 100 - this._data.satiety);
    const consumed = Math.ceil(added / 18);
    this._data.satiety += added;
    this._data.nourishment = Math.min(12, this._data.nourishment + added / 18);
    this._data.fedCount += consumed;
    this._data.lastFed = Date.now();
    this._save();
    const message = `团团吃到了饲料，饱食度 +${Math.round(added)}。`;
    this.onChange(this._snapshot());
    this.onFeed({ fileName: '', kind: 'compost', source: String(source).slice(0, 40), message, state: this._snapshot(), consumed });
    return { ok: true, message, kind: 'compost', consumed };
  }

  /** Browser-only metadata play. This never recycles a file or grants desktop feed. */
  feedFile(file) {
    if (this._destroyed) return { ok: false, message: '团团暂时在休息，重新打开小岛再来看看吧。', kind: 'unavailable' };
    if (!file || typeof file.name !== 'string' || !file.name.trim()
      || (file.size !== undefined && (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0))) {
      return { ok: false, message: '拖一个文件过来，就能给团团一份像素点心。', kind: 'invalid' };
    }
    this._refresh(false);
    const now = Date.now();
    const fileName = file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180).trim();
    if (!fileName) return { ok: false, message: '请拖入一个有名字的文件。', kind: 'invalid' };
    const size = file.size || 0;
    const key = `${fileName}\u0000${size}`;
    const lastDrop = this._recentDrops.get(key);
    for (const [recentKey, at] of this._recentDrops) {
      if (now - at >= 3000 || now < at) this._recentDrops.delete(recentKey);
    }
    if (lastDrop !== undefined && now >= lastDrop && now - lastDrop < 3000) {
      return { ok: false, message: '团团还在嚼这一口，等一下再喂吧。', kind: 'cooldown' };
    }
    if (this._data.satiety >= 99.5) {
      return { ok: false, message: '团团已经吃饱啦，陪它玩一会儿吧。', kind: 'full' };
    }
    const added = Math.min(18, 100 - this._data.satiety);
    this._data.satiety += added;
    this._data.nourishment = Math.min(12, this._data.nourishment + added / 18);
    this._data.fedCount += 1;
    this._data.lastFed = now;
    this._recentDrops.set(key, now);
    this._save();
    const kind = fileKind(fileName, typeof file.type === 'string' ? file.type : '');
    const treats = { image: '彩色饼干', audio: '音符软糖', video: '光影布丁', document: '纸片蛋糕', file: '像素点心' };
    const message = `团团吃到了${treats[kind]}，饱食度 +${Math.round(added)}。原文件还在原处。`;
    this.onChange(this._snapshot());
    this.onFeed({ fileName, kind, message, state: this._snapshot() });
    return { ok: true, message, kind };
  }

  destroy() {
    if (this._destroyed) return;
    this._refresh(false);
    this._destroyed = true;
    clearInterval(this._timer);
    globalThis.document?.removeEventListener('visibilitychange', this._visibility);
    this._recentDrops.clear();
  }
}
