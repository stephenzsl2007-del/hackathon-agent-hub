'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorldServer, networks } = require('../server.cjs');

async function fixture(t, options = {}) {
  const world = createWorldServer({ port: 0, host: '127.0.0.1', ...options });
  await world.listen();
  const base = 'http://127.0.0.1:' + world.info().port, streams = [];
  t.after(async () => { streams.forEach(s => s.close()); world.server.closeIdleConnections(); await world.close(); });
  const post = (route, data) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  async function events(query = 'host=1') {
    const controller = new AbortController(), queue = [], waiting = [];
    const response = await fetch(base + '/api/events?' + query, { signal: controller.signal });
    assert.equal(response.status, 200);
    const stream = { close: () => controller.abort(), next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiting.push(resolve)) };
    streams.push(stream);
    (async () => {
      const decoder = new TextDecoder(); let buffer = '';
      try {
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const raw = block.split('\n').find(line => line.startsWith('data: '));
            if (!raw) continue;
            const event = { event: block.match(/event: (.*)/)?.[1], id: block.match(/id: (.*)/)?.[1], data: JSON.parse(raw.slice(6)) };
            if (waiting.length) waiting.shift()(event); else queue.push(event);
          }
        }
      } catch (error) { if (error.name !== 'AbortError') throw error; }
    })();
    stream.until = async name => { let event; do { event = await stream.next(); } while (event.event !== name); return event; };
    return stream;
  }
  return { world, base, post, events };
}

test('malformed and non-object JSON cannot crash the server', { timeout: 5000 }, async t => {
  const { base } = await fixture(t);
  for (const body of ['null', '[]', 'true', '"seed"', '{bad', '{"action":"wind","value":"loud"}']) {
    const response = await fetch(base + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400, body); await response.json();
    assert.equal((await fetch(base + '/api/info')).status, 200);
  }
  const large = await fetch(base + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'wind', padding: 'a'.repeat(3000) }) });
  assert.equal(large.status, 413);
});

test('phone action succeeds only after the desktop acknowledges execution', { timeout: 5000 }, async t => {
  const { post, events } = await fixture(t);
  const offline = await post('/api/action', { action: 'seed' });
  assert.equal(offline.status, 503);assert.match((await offline.json()).error,/尚未连接/);
  const host = await events(), ready = (await host.until('ready')).data;
  const sending = post('/api/action', { action: 'seed' });
  const action = await host.until('action');
  assert.equal(Number(action.id), action.data.id);
  assert.equal((await post('/api/ack', { id: action.data.id, hostId: 'wrong', ok: true })).status, 404);
  assert.equal((await post('/api/ack', { id: action.data.id, hostId: ready.hostId, ok: true })).status, 200);
  const result = await sending;assert.equal(result.status, 200);assert.equal((await result.json()).ok, true);
  const denied = post('/api/action', { action: 'rain' });
  const next = await host.until('action');
  await post('/api/ack', { id: next.data.id, hostId: ready.hostId, ok: false, error: '演示中' });
  const deniedResult = await denied;assert.equal(deniedResult.status, 503);assert.equal((await deniedResult.json()).error, '演示中');
});

test('missing desktop acknowledgement produces a bounded, honest error', { timeout: 5000 }, async t => {
  const { post, events } = await fixture(t, { ackTimeout: 70 });
  const host = await events();await host.until('ready');
  const response = await post('/api/action', { action: 'seed' });
  assert.equal(response.status, 503);assert.match((await response.json()).error,/未收到小岛确认/);
});

test('Wi-Fi is preferred over virtual adapters and QR rejects unknown addresses', { timeout: 5000 }, async t => {
  const interfaces = { Meta: [{ family: 'IPv4', address: '198.18.0.1' }], vEthernet: [{ family: 'IPv4', address: '172.28.96.1' }], 'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.66' }] };
  assert.equal(networks(interfaces)[0].address, '192.168.1.66');
  const { world, base } = await fixture(t, { networkInterfaces: () => interfaces });
  assert.match(world.info().phoneUrl, /192\.168\.1\.66/);
  const response = await fetch(base + '/api/qr?address=10.0.0.99');
  assert.equal(response.status, 400);
  const selected = await fetch(base + '/api/qr?address=172.28.96.1');
  assert.equal(selected.status, 200);assert.match(await selected.text(), /<svg/);
});
