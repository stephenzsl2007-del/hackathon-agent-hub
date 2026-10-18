const MINUTE = 60000;
const MAX_SECONDS = 180 * 60;
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const bounded = (value, min, max) => Math.min(max, Math.max(min, value));

/** Opt-in timer; keyboard feedback is application-local and stores no key data. */
export class FocusSession {
  constructor({ onChange = () => {}, onReward = () => {}, onRain = () => {} } = {}) {
    this.onChange = onChange;
    this.onReward = onReward;
    this.onRain = onRain;
    this._destroyed = false;
    this._rewardedIds = new Set();
    this._activityAt = [];
    this._lastRainAt = -Infinity;
    this._data = this._empty();
    this._timer = setInterval(() => {
      if (this._data.status === 'running') { this._sync(); this._emit(); }
    }, 1000);
    this._timer.unref?.();
    this._visibility = () => {
      if (!globalThis.document?.hidden && this._data.status === 'running') { this._sync(); this._emit(); }
    };
    globalThis.document?.addEventListener('visibilitychange', this._visibility);
    this._emit();
  }

  _empty() {
    return { status: 'idle', id: null, totalSeconds: 25 * 60, elapsedMs: 0,
      startedAt: 0, updatedAt: 0, finishedAt: 0, rewarded: false };
  }

  _snapshot() {
    return {
      status: this._data.status,
      id: this._data.id,
      totalSeconds: this._data.totalSeconds,
      remainingSeconds: Math.max(0, Math.ceil(this._data.totalSeconds - this._data.elapsedMs / 1000)),
      progress: bounded(this._data.elapsedMs / (this._data.totalSeconds * 1000), 0, 1),
    };
  }

  _emit() { this.onChange(this._snapshot()); }

  _sync() {
    if (this._destroyed || this._data.status !== 'running') return;
    const now = Date.now();
    const elapsed = Math.max(0, now - this._data.updatedAt);
    this._data.elapsedMs = Math.min(this._data.totalSeconds * 1000, this._data.elapsedMs + elapsed);
    this._data.updatedAt = now;
    if (this._data.elapsedMs >= this._data.totalSeconds * 1000) this._complete();
  }

  _complete() {
    if (this._data.status === 'completed' || !this._data.id) return;
    this._data.status = 'completed';
    this._data.finishedAt = Date.now();
    this._data.elapsedMs = this._data.totalSeconds * 1000;
    this._activityAt = [];
    const alreadyRewarded = this._data.rewarded || this._rewardedIds.has(this._data.id);
    this._data.rewarded = true;
    this._rewardedIds.add(this._data.id);
    // The owner commits this ID, the water balance, and this snapshot together.
    if (!alreadyRewarded) this.onReward({ id: this._data.id, sessionId: this._data.id, resource: 'water', amount: 3 });
    // A snapshot or keyboard event can finish a throttled timer before its next
    // interval tick. Notify here so the UI cannot stay stuck on "running".
    this._emit();
  }

  start(minutes = 25) {
    if (this._destroyed) return this._snapshot();
    if (['running', 'paused'].includes(this._data.status)) return this.getState();
    const requested = typeof minutes === 'object' && minutes ? minutes.minutes : minutes;
    const duration = bounded(finite(requested, 25), 1, 180);
    const now = Date.now();
    const id = globalThis.crypto?.randomUUID?.() || `focus-${now}-${Math.random().toString(36).slice(2, 12)}`;
    this._data = { status: 'running', id, totalSeconds: Math.round(duration * 60), elapsedMs: 0,
      startedAt: now, updatedAt: now, finishedAt: 0, rewarded: false };
    this._activityAt = [];
    this._lastRainAt = -Infinity;
    this._emit();
    return this._snapshot();
  }

  pause() {
    this._sync();
    if (this._data.status === 'running') this._data.status = 'paused';
    this._activityAt = [];
    this._emit();
    return this._snapshot();
  }

  resume() {
    if (!this._destroyed && this._data.status === 'paused') {
      this._data.status = 'running';
      this._data.updatedAt = Date.now();
      this._emit();
    }
    return this._snapshot();
  }

  cancel() {
    if (this._destroyed) return this._snapshot();
    this._sync();
    if (['running', 'paused'].includes(this._data.status)) this._data.status = 'cancelled';
    this._activityAt = [];
    this._emit();
    return this._snapshot();
  }

  finish() {
    this._sync();
    const ok = this._data.status === 'completed';
    this._emit();
    return { ok, message: ok ? '这段专注完成了，获得 3 份浇花水。' : '专注时间还未结束；提前结束不会获得浇花水。', state: this._snapshot() };
  }

  /** Invoke from this app's keydown only; do not pass the key or text. */
  recordActivity() {
    this._sync();
    if (this._destroyed || this._data.status !== 'running') return false;
    const now = Date.now();
    this._activityAt = this._activityAt.filter(at => at <= now && now - at < 2000).slice(-19);
    this._activityAt.push(now);
    if (now < this._lastRainAt) this._lastRainAt = -Infinity;
    if (now - this._lastRainAt < 600) return false;
    this._lastRainAt = now;
    this.onRain({ source: 'app-keyboard', sessionId: this._data.id, intensity: Math.min(0.65, 0.2 + this._activityAt.length * 0.035), durationMs: 650 });
    return true;
  }

  getState() {
    this._sync();
    return this._snapshot();
  }

  serialize() {
    this._sync();
    return { version: 1, ...this._data, savedAt: Date.now(), rewardedIds: [...this._rewardedIds].slice(-500) };
  }

  restore(snapshot) {
    if (this._destroyed || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    const allowed = ['idle', 'running', 'paused', 'completed', 'cancelled'];
    if (!allowed.includes(snapshot.status)) return false;
    const now = Date.now();
    const totalSeconds = Math.round(bounded(finite(snapshot.totalSeconds, 1500), 60, MAX_SECONDS));
    const id = typeof snapshot.id === 'string' && snapshot.id.length > 0 ? snapshot.id.slice(0, 160) : null;
    for (const pastId of Array.isArray(snapshot.rewardedIds) ? snapshot.rewardedIds.slice(-500) : []) {
      if (typeof pastId === 'string' && pastId.length > 0 && pastId.length <= 160) this._rewardedIds.add(pastId);
    }
    const rewarded = Boolean(snapshot.rewarded) || Boolean(id && this._rewardedIds.has(id));
    let status = id ? snapshot.status : 'idle';
    // Closing the app pauses the timer. Reopening never grants offline rewards.
    if (status === 'running') status = 'paused';
    if (rewarded && status !== 'idle') status = 'completed';
    const completed = status === 'completed';
    if (completed && id) this._rewardedIds.add(id);
    this._data = {
      status, id, totalSeconds,
      elapsedMs: completed ? totalSeconds * 1000 : bounded(finite(snapshot.elapsedMs), 0, totalSeconds * 1000 - 1),
      startedAt: bounded(finite(snapshot.startedAt, now), 0, now),
      updatedAt: now,
      finishedAt: completed ? bounded(finite(snapshot.finishedAt, now), 0, now) : 0,
      rewarded: completed || rewarded,
    };
    this._activityAt = [];
    this._lastRainAt = -Infinity;
    this._emit();
    return true;
  }

  destroy() {
    if (this._destroyed) return;
    this._sync();
    if (this._data.status === 'running') this._data.status = 'paused';
    this._destroyed = true;
    clearInterval(this._timer);
    this._activityAt = [];
    globalThis.document?.removeEventListener('visibilitychange', this._visibility);
  }
}
