'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const builds = new Map();

async function buildKeyboardHelper(destination) {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'build-keyboard.ps1'), '-Source', path.join(__dirname, 'keyboard-activity.cs'), '-Destination', destination], { windowsHide: true, timeout: 20000, maxBuffer: 16384 });
  return destination;
}

async function helperPath(profile) {
  const bundled = path.join(__dirname, 'keyboard-activity.exe');
  if (fs.existsSync(bundled)) return bundled;
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'keyboard-activity.cs'))).digest('hex').slice(0, 16);
  const compiled = path.join(profile, 'native', 'keyboard-activity-' + digest + '.exe');
  if (!fs.existsSync(compiled)) {
    if (!builds.has(compiled)) builds.set(compiled, buildKeyboardHelper(compiled).finally(() => builds.delete(compiled)));
    await builds.get(compiled);
  }
  return compiled;
}

class KeyboardActivity {
  constructor({ profile, platform = process.platform, launch = spawn, resolveHelper = () => helperPath(profile), onActivity = () => {}, onState = () => {} } = {}) {
    Object.assign(this, { platform, launch, resolveHelper, onActivity, onState });
    this.supported = platform === 'win32'; this.enabled = false; this.starting = false; this.suspended = false;
    this.child = null; this.generation = 0; this.error = ''; this.pending = null;
  }
  state() { return { supported: this.supported, enabled: this.enabled, starting: this.starting, suspended: this.suspended, error: this.error }; }
  notify() { this.onState(this.state()); return this.state(); }
  async setEnabled(value) {
    if (!value) { this.enabled = false; this.error = ''; this.stop(); return this.notify(); }
    if (!this.supported) return this.state();
    this.enabled = true;
    if (this.suspended || this.child || this.starting) return this.state();
    const generation = ++this.generation;
    this.starting = true; this.error = ''; this.notify();
    let child;
    try {
      const executable = await this.resolveHelper();
      if (generation !== this.generation || !this.enabled || this.suspended) return this.state();
      child = this.launch(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      this.child = child;
      // Keep protocol bounded, and accept only the activity-presence message.
      let buffer = '', ready = false;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('键盘雨启动超时，请关闭后重试。')), 4000);
        const settle = error => { clearTimeout(timer); this.pending = null; error ? reject(error) : resolve(); };
        this.pending = () => settle();
        child.stdin.on('error', () => {});
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', text => {
          if (generation !== this.generation) return;
          buffer += text;
          if (buffer.length > 4096) {
            if (ready) { this.enabled = false; this.error = '键盘雨助手响应异常。'; this.stop(); this.notify(); }
            else settle(new Error('键盘雨助手响应异常。'));
            return;
          }
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
            if (line === '{"type":"ready"}') { ready = true; this.starting = false; this.notify(); settle(); }
            else if (line === '{"type":"activity"}' && ready && this.enabled && !this.suspended) this.onActivity();
            else if (line === '{"type":"error"}') settle(new Error('系统暂时无法开启键盘雨。'));
          }
        });
        child.once('error', () => settle(new Error('键盘雨助手无法启动，请重试。')));
        child.once('exit', () => {
          if (generation !== this.generation) return;
          this.child = null;
          if (!ready) settle(new Error('键盘雨助手未能就绪。'));
          if (this.enabled) { this.enabled = false; this.starting = false; this.error = '键盘雨已停止，可以重新开启。'; this.notify(); }
        });
      });
    } catch (error) {
      if (generation === this.generation) { this.enabled = false; this.error = error.message.startsWith('键盘雨') || error.message.startsWith('系统') ? error.message : '暂时无法准备键盘雨，请重试或使用应用内键盘雨。'; this.stop(); this.notify(); }
    } finally {
      if (generation === this.generation) { this.starting = false; this.notify(); }
    }
    return this.state();
  }
  stop() {
    ++this.generation; this.starting = false; this.pending?.(); this.pending = null;
    const child = this.child; this.child = null;
    if (child) {
      child.stdin.end();
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 1200); timer.unref();
      child.once('exit', () => clearTimeout(timer));
    }
  }
  suspend() { this.suspended = true; this.stop(); this.notify(); }
  resume() { this.suspended = false; if (this.enabled) return this.setEnabled(true); return this.notify(); }
  dispose() { this.enabled = false; this.stop(); }
}
module.exports = { KeyboardActivity, buildKeyboardHelper };
