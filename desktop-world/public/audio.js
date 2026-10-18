/** Local, opt-in audio. Microphone samples never leave this page. */
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const AudioContextClass = () => globalThis.AudioContext || globalThis.webkitAudioContext;

export class MicrophoneWind {
  constructor({ onLevel = () => {}, onState = () => {} } = {}) {
    this.onLevel = onLevel;
    this.onState = onState;
    this._active = false;
    this._generation = 0;
    this._pending = null;
    this._frame = 0;
    this._level = 0;
    this._stream = null;
    this._context = null;
    this._source = null;
    this._analyser = null;
    this._teardown = () => this.stop();
    globalThis.addEventListener?.('pagehide', this._teardown);
    globalThis.addEventListener?.('beforeunload', this._teardown);
  }

  get active() { return this._active; }

  async start() {
    if (this._active) return true;
    if (this._pending) return this._pending;
    const generation = ++this._generation;
    this.onState({ state: 'starting', message: '请允许使用麦克风，轻轻吹一口气就能送来风。' });
    this._pending = this._begin(generation);
    try { return await this._pending; }
    finally { if (generation === this._generation) this._pending = null; }
  }

  async _begin(generation) {
    try {
      if (!globalThis.isSecureContext) {
        throw Object.assign(new Error('insecure'), { name: 'InsecureContextError' });
      }
      if (!globalThis.navigator?.mediaDevices?.getUserMedia || !AudioContextClass()) {
        throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
      }

      // Create/resume in the initiating click, before the permission prompt resolves.
      const context = new (AudioContextClass())();
      this._context = context;
      const resume = context.resume().catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (generation !== this._generation) {
        stream.getTracks().forEach(track => track.stop());
        if (context.state !== 'closed') context.close().catch(() => {});
        return false;
      }
      this._stream = stream;
      await resume;
      if (generation !== this._generation) return false;
      if (context.state === 'suspended') await context.resume();
      if (generation !== this._generation) return false;

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser); // Deliberately not connected to speakers.
      this._source = source;
      this._analyser = analyser;
      this._active = true;
      this._level = 0;
      const samples = new Float32Array(analyser.fftSize);
      const baselineSamples = [];
      let startedAt = performance.now();
      let lastAt = startedAt;
      let calibrated = false;
      let floor = 0.004;
      let sustained = 0;
      this.onState({ state: 'calibrating', message: '先安静一秒，正在听这里的环境声…' });

      stream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (generation !== this._generation) return;
          this.stop();
          this.onState({ state: 'error', message: '麦克风已断开，可以重新开启；也可以按住空格送风。' });
        }, { once: true });
      });

      const sample = (now) => {
        if (generation !== this._generation || !this._active) return;
        const dt = Math.min(0.1, Math.max(0.001, (now - lastAt) / 1000));
        lastAt = now;
        analyser.getFloatTimeDomainData(samples);
        let mean = 0;
        let squared = 0;
        for (const value of samples) { mean += value; squared += value * value; }
        mean /= samples.length;
        const rms = Math.sqrt(Math.max(0, squared / samples.length - mean * mean));

        if (!calibrated) {
          baselineSamples.push(rms);
          if (now - startedAt >= 1100) {
            baselineSamples.sort((a, b) => a - b);
            // A low percentile and a cap keep a cough/blow during setup from
            // making the garden permanently insensitive.
            floor = clamp(baselineSamples[Math.floor(baselineSamples.length * 0.25)] || 0.004, 0.001, 0.018);
            calibrated = true;
            this.onState({ state: 'active', message: '轻轻吹气，让草木摇起来。环境声音也可能带来风。' });
          }
          this.onLevel(0);
        } else {
          const threshold = Math.max(0.009, floor * 2.2 + 0.003);
          if (rms > threshold) sustained = Math.min(0.3, sustained + dt);
          else sustained = Math.max(0, sustained - dt * 2);
          const target = Math.pow(clamp((rms - threshold) / 0.13), 0.62) * clamp(sustained / 0.12);
          const response = target > this._level ? 0.13 : 0.48;
          this._level += (target - this._level) * (1 - Math.exp(-dt / response));
          if (this._level < 0.003) this._level = 0;
          // Only learn a quieter floor. Sustained speech never becomes the baseline.
          if (rms < floor && this._level < 0.02) floor += (rms - floor) * dt * 0.08;
          this.onLevel(clamp(this._level));
        }
        this._frame = requestAnimationFrame(sample);
      };
      this._frame = requestAnimationFrame(sample);
      return true;
    } catch (error) {
      if (generation !== this._generation) return false;
      this._release();
      const messages = {
        NotAllowedError: '麦克风权限未开启。可在浏览器地址栏允许访问，或按住空格送风。',
        PermissionDeniedError: '麦克风权限未开启。可在浏览器地址栏允许访问，或按住空格送风。',
        NotFoundError: '没有找到麦克风。可以接入麦克风，或按住空格送风。',
        DevicesNotFoundError: '没有找到麦克风。可以接入麦克风，或按住空格送风。',
        NotReadableError: '暂时无法使用麦克风，可能被其他应用占用。按住空格也能送风。',
        AbortError: '麦克风连接中断，请再试一次。按住空格也能送风。',
        InsecureContextError: '麦克风需要 HTTPS 或本机 localhost。当前可以使用触控送风。',
        NotSupportedError: '这个浏览器暂不支持麦克风互动，可以使用触控或空格送风。',
      };
      this.onLevel(0);
      this.onState({ state: 'error', message: messages[error?.name] || '麦克风暂时无法开启，请重试；也可以按住空格送风。' });
      return false;
    }
  }

  _release() {
    this._active = false;
    cancelAnimationFrame(this._frame);
    this._frame = 0;
    this._source?.disconnect();
    this._analyser?.disconnect();
    this._stream?.getTracks().forEach(track => track.stop());
    if (this._context && this._context.state !== 'closed') this._context.close().catch(() => {});
    this._stream = this._context = this._source = this._analyser = null;
    this._level = 0;
  }

  stop() {
    ++this._generation;
    this._pending = null;
    this._release();
    this.onLevel(0);
    this.onState({ state: 'stopped', message: '麦克风已关闭。' });
  }
}

export class GardenAudio {
  constructor() {
    this._context = null;
    this._master = null;
    this._windGain = null;
    this._windFilter = null;
    this._noise = null;
    this._notes = new Set();
    this._enabled = false;
    this._night = false;
    this._wind = 0;
    this._timer = 0;
    this._generation = 0;
    this._disposed = false;
    this._lastChime = 0;
    this._teardown = () => this.dispose();
    globalThis.addEventListener?.('pagehide', this._teardown);
    globalThis.addEventListener?.('beforeunload', this._teardown);
  }

  get enabled() { return this._enabled; }

  _create() {
    const AudioContext = AudioContextClass();
    if (!AudioContext) return false;
    const context = new AudioContext();
    this._context = context;
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this._master = master;

    // Low-pass noise makes a quiet breeze; the 4-second loop has no assets.
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < channel.length; i++) {
      previous = previous * 0.82 + (Math.random() * 2 - 1) * 0.18;
      channel[i] = previous;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 630;
    filter.Q.value = 0.4;
    const wind = context.createGain();
    wind.gain.value = 0.04;
    source.connect(filter).connect(wind).connect(master);
    source.start();
    this._noise = source;
    this._windGain = wind;
    this._windFilter = filter;
    this.setWind(this._wind);
    return true;
  }

  async toggle() {
    if (this._disposed) return false;
    const generation = ++this._generation;
    this._enabled = !this._enabled;
    clearTimeout(this._timer);
    try {
      if (this._enabled) {
        if (!this._context && !this._create()) { this._enabled = false; return false; }
        await this._context.resume();
        if (generation !== this._generation || this._disposed) return this._enabled;
        this._master.gain.setTargetAtTime(0.24, this._context.currentTime, 0.3);
        this._schedule();
        this.chime('hello');
      } else if (this._context) {
        this._master.gain.setTargetAtTime(0, this._context.currentTime, 0.08);
        const context = this._context;
        this._timer = setTimeout(() => {
          if (!this._enabled && !this._disposed && context.state !== 'closed') context.suspend().catch(() => {});
        }, 450);
      }
    } catch {
      this._enabled = false;
      if (this._master && this._context?.state !== 'closed') this._master.gain.value = 0;
    }
    return this._enabled;
  }

  setNight(value) {
    this._night = Boolean(value);
    this.setWind(this._wind);
  }

  setWind(value) {
    this._wind = clamp(value);
    if (!this._context || this._context.state === 'closed') return;
    const now = this._context.currentTime;
    this._windGain.gain.setTargetAtTime((this._night ? 0.025 : 0.04) + this._wind * 0.13, now, 0.45);
    this._windFilter.frequency.setTargetAtTime(500 + this._wind * 1200, now, 0.45);
  }

  _tone(frequency, delay = 0, duration = 1.2, gain = 0.045, type = 'sine', endFrequency = frequency) {
    const context = this._context;
    if (!this._enabled || !context || context.state !== 'running') return;
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.65);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + Math.min(0.045, duration * 0.15));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(this._master);
    this._notes.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this._notes.delete(oscillator);
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.04);
  }

  chime(kind = 'seed') {
    if (!this._enabled || !this._context) return;
    // Pointer movement may trigger many events; keep the soundscape unhurried.
    const now = this._context.currentTime;
    if (now - this._lastChime < 0.14 && this._lastChime !== 0) return;
    this._lastChime = now;
    const notes = {
      seed: [523.25, 659.25], plant: [523.25, 659.25], bloom: [659.25, 783.99, 1046.5],
      rain: [587.33, 440], water: [587.33, 440], feed: [392, 523.25],
      tide: [261.63, 392], night: [440, 659.25], day: [523.25, 783.99],
      hello: [523.25, 659.25, 783.99], wind: [659.25, 880],
    }[kind] || [523.25, 659.25];
    notes.forEach((frequency, index) => this._tone(frequency, index * 0.12, 1.15, 0.045));
  }

  _schedule() {
    clearTimeout(this._timer);
    if (!this._enabled || this._disposed) return;
    this._timer = setTimeout(() => {
      if (!this._enabled || this._disposed) return;
      if (this._night) {
        const frequencies = [261.63, 329.63, 392, 523.25, 659.25];
        const note = frequencies[Math.floor(Math.random() * frequencies.length)];
        this._tone(note, 0, 2.8, 0.024);
        this._tone(note * 2, 0.3, 2.4, 0.009);
      } else if (Math.random() < 0.55) {
        const note = 1500 + Math.random() * 900;
        this._tone(note, 0, 0.12, 0.016, 'sine', note * 1.25);
        this._tone(note * 1.1, 0.18, 0.13, 0.012, 'sine', note * 0.9);
      } else {
        const frequencies = [523.25, 659.25, 783.99, 880];
        this._tone(frequencies[Math.floor(Math.random() * frequencies.length)], 0, 2.1, 0.02);
      }
      this._schedule();
    }, 5000 + Math.random() * 7000);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._enabled = false;
    ++this._generation;
    clearTimeout(this._timer);
    for (const oscillator of this._notes) {
      try { oscillator.stop(); } catch { /* A scheduled note may already have ended. */ }
      oscillator.disconnect();
    }
    this._notes.clear();
    this._noise?.stop();
    this._noise?.disconnect();
    this._windFilter?.disconnect();
    this._windGain?.disconnect();
    this._master?.disconnect();
    if (this._context && this._context.state !== 'closed') this._context.close().catch(() => {});
    this._context = this._master = this._noise = this._windFilter = this._windGain = null;
    globalThis.removeEventListener?.('pagehide', this._teardown);
    globalThis.removeEventListener?.('beforeunload', this._teardown);
  }
}
