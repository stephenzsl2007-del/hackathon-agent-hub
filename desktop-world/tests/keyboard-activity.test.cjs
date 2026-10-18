'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { KeyboardActivity } = require('../desktop/keyboard-activity.cjs');

function fixture(options = {}) {
  const children = [], states = [];let pulses = 0;
  const monitor = new KeyboardActivity({ platform: 'win32', resolveHelper: async () => 'helper.exe',
    onActivity: () => pulses++, onState: state => states.push(state),
    launch: () => {
      const child = new EventEmitter();child.stdin = new PassThrough();child.stdout = new PassThrough();child.exitCode = null;
      child.kill = () => { child.exitCode = 0;child.emit('exit', 0); };
      child.stdin.on('finish', () => child.kill());
      children.push(child);
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child;
    }, ...options,
  });
  return { monitor, children, states, pulses: () => pulses };
}

test('keyboard activity is opt-in and forwards presence only, not key payloads', async t => {
  const f = fixture();t.after(() => f.monitor.dispose());
  assert.equal(f.monitor.state().enabled, false);assert.equal(f.children.length, 0);
  assert.equal((await f.monitor.setEnabled(true)).enabled, true);
  const child = f.children[0];child.stdout.write('{"type":"activity","key":"must not forward"}\n');
  child.stdout.write('{"type":"acti');child.stdout.write('vity"}\n');
  assert.equal(f.pulses(), 1);
  await f.monitor.setEnabled(false);child.stdout.write('{"type":"activity"}\n');
  assert.equal(f.pulses(), 1);assert.equal(child.stdin.writableEnded, true);
});

test('lock / sleep suspends collection and resumes only an enabled session', async t => {
  const f = fixture();t.after(() => f.monitor.dispose());
  await f.monitor.setEnabled(true);f.monitor.suspend();
  assert.equal(f.monitor.state().enabled, true);assert.equal(f.monitor.state().suspended, true);
  f.children[0].stdout.write('{"type":"activity"}\n');assert.equal(f.pulses(), 0);
  await f.monitor.resume();assert.equal(f.children.length, 2);
  await f.monitor.setEnabled(false);f.monitor.suspend();await f.monitor.resume();
  assert.equal(f.children.length, 2);assert.equal(f.monitor.state().enabled, false);
});

test('turning off during asynchronous preparation cannot leave a helper running', async () => {
  let release;const f = fixture({ resolveHelper: () => new Promise(resolve => release = resolve) });
  const starting = f.monitor.setEnabled(true);await f.monitor.setEnabled(false);
  release('helper.exe');await starting;
  assert.equal(f.children.length, 0);assert.equal(f.monitor.state().enabled, false);
});

test('preparation failure and unexpected helper exit reset the visible state', async t => {
  const bad = fixture({ resolveHelper: async () => { throw new Error('compiler unavailable'); } });
  assert.equal((await bad.monitor.setEnabled(true)).enabled, false);
  assert.match(bad.states.at(-1).error, /无法准备/);
  const f = fixture();t.after(() => f.monitor.dispose());await f.monitor.setEnabled(true);
  f.children[0].kill();assert.equal(f.monitor.state().enabled, false);assert.match(f.states.at(-1).error, /已停止/);
});

test('unsupported platforms never start the Windows helper', async () => {
  const f = fixture({ platform: 'darwin' });
  assert.equal((await f.monitor.setEnabled(true)).supported, false);assert.equal(f.children.length, 0);
});
