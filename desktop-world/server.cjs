'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PUBLIC = path.join(__dirname, 'public');
const ACTIONS = new Set(['wind', 'rain', 'seed', 'food', 'tide', 'fireflies']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
function networks(interfaces = os.networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, values]) => (values || [])
    .filter(a => (a.family === 'IPv4' || a.family === 4) && !a.internal)
    .map(a => ({ name, address: a.address })))
    .sort((a, b) => score(a) - score(b));
}
function score(network) {
  return (/virtual|vethernet|wsl|docker|vpn|tailscale|vmware|vbox|loopback|tun|tap|clash|mihomo|^meta$/i.test(network.name) ? 10 : 0)
    + (/^198\.(18|19)\./.test(network.address) ? 10 : 0)
    + (network.address.startsWith('169.254.') ? 20 : 0);
}
function isLocal(req) { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress); }
function json(res, status, data) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readJSON(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('请发送 JSON 消息'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size <= 2048) chunks.push(chunk); }
  if (size > 2048) throw Object.assign(new Error('消息太长'), { status: 413 });
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('消息格式不正确'), { status: 400 }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('消息必须是一个对象'), { status: 400 });
  return data;
}

function createWorldServer(options = {}) {
  const token = options.token || crypto.randomBytes(18).toString('hex');
  const roomCode = crypto.randomBytes(2).toString('hex').toUpperCase();
  const clients = new Set(), limits = new Map(), pending = new Map();
  let eventId = 0, actualPort = options.port ?? Number(process.env.PORT || 4177);
  const hostOnline = () => [...clients].some(c => c.host);
  const audience = () => [...clients].filter(c => c.phone).length;
  const networkList = () => networks(options.networkInterfaces?.() || os.networkInterfaces());
  const phoneURL = address => `http://${address || networkList()[0]?.address || 'localhost'}:${actualPort}/phone.html?room=${token}`;
  const info = () => ({ name: '息屿', roomCode, port: actualPort, networks: networkList(), addresses: networkList().map(n => n.address), phoneUrl: phoneURL(), localUrl: `http://localhost:${actualPort}`, audience: audience(), hostOnline: hostOnline() });
  const send = (client, event, data, id) => {
    if (client.res.destroyed || client.res.writableLength > 512 * 1024) { client.res.destroy(); return; }
    client.res.write(`${id ? 'id: ' + id + '\n' : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const presence = () => { for (const client of clients) send(client, 'audience', { count: audience(), hostOnline: hostOnline() }); };
  function waitForHost(client, event) {
    return new Promise(resolve => {
      const finish = result => { const request = pending.get(event.id); if (!request) return; clearTimeout(request.timer); pending.delete(event.id); resolve(result); };
      const timer = setTimeout(() => finish({ ok: false, error: '未收到小岛确认，请先在电脑查看结果，再决定是否重试。' }), options.ackTimeout || 2500);
      pending.set(event.id, { client, finish, timer });
      send(client, 'action', event, event.id);
    });
  }
  async function handleRequest(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    let url;
    try { url = new URL(req.url, `http://localhost:${actualPort}`); } catch { return json(res, 400, { error: 'Invalid URL' }); }
    const authorized = isLocal(req) || url.searchParams.get('room') === token;
    if (url.pathname === '/api/info' && req.method === 'GET') {
      if (!authorized) return json(res, 403, { error: '请扫描桌面上的二维码加入' });
      return json(res, 200, info());
    }
    if (url.pathname === '/api/qr' && req.method === 'GET') {
      if (!isLocal(req)) return json(res, 403, { error: 'Host only' });
      const address = url.searchParams.get('address') || undefined;
      if (address && !networkList().some(n => n.address === address)) return json(res, 400, { error: '网络地址已变化，请刷新邀请' });
      try {
        const svg = await require('qrcode').toString(phoneURL(address), { type: 'svg', width: 228, margin: 2, color: { dark: '#334438', light: '#fff9e8' } });
        res.writeHead(200, { 'Content-Type': TYPES['.svg'], 'Cache-Control': 'no-store' }); return res.end(svg);
      } catch { return json(res, 503, { error: '二维码暂不可用，请复制邀请地址' }); }
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      if (!authorized || (url.searchParams.get('host') === '1' && !isLocal(req))) return json(res, 403, { error: '房间码不正确' });
      if (clients.size >= 64) return json(res, 503, { error: '小岛有点拥挤，请稍后再来' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      const host = url.searchParams.get('host') === '1';
      const client = { id: crypto.randomUUID(), res, host, phone: !host && url.searchParams.get('phone') === '1' };
      clients.add(client);
      send(client, 'ready', { roomCode, audience: audience(), hostOnline: hostOnline(), ...(host ? { hostId: client.id } : {}) });
      presence();
      req.on('close', () => {
        clients.delete(client);
        for (const request of pending.values()) if (request.client === client) request.finish({ ok: false, error: '电脑暂时断开，未收到操作确认。请先查看小岛。' });
        presence();
      });
      return;
    }
    if (url.pathname === '/api/ack' && req.method === 'POST') {
      if (!isLocal(req)) return json(res, 403, { error: 'Host only' });
      const data = await readJSON(req), request = pending.get(data.id);
      if (!request || request.client.id !== data.hostId) return json(res, 404, { error: '操作已结束' });
      request.finish({ ok: data.ok === true, error: data.ok === true ? undefined : String(data.error || '小岛暂时无法执行这个动作').slice(0, 200) });
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      const data = await readJSON(req);
      if (data.room !== token && !isLocal(req)) return json(res, 403, { error: '请重新扫描二维码' });
      if (!ACTIONS.has(data.action) || (data.value !== undefined && !Number.isFinite(data.value))) return json(res, 400, { error: '互动参数不正确' });
      const now = Date.now(), address = req.socket.remoteAddress;
      const history = (limits.get(address) || []).filter(t => now - t < 1000);
      if (history.length >= 8 || pending.size >= 32) return json(res, 429, { error: '慢一点，小岛正在回应你' });
      history.push(now); limits.set(address, history);
      const host = [...clients].find(c => c.host);
      if (!host) return json(res, 503, { error: '电脑上的花园尚未连接，请先打开花园。' });
      const event = { action: data.action, value: Number.isFinite(data.value) ? Math.max(0, Math.min(1, data.value)) : 0.7, id: ++eventId, source: 'phone', time: now };
      const result = await waitForHost(host, event);
      return json(res, result.ok ? 200 : 503, { ...result, id: event.id, audience: audience() });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    let file;
    try {
      const decoded = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname === '/phone' ? '/phone.html' : url.pathname);
      file = path.resolve(PUBLIC, '.' + decoded);
      if (!file.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Forbidden' });
      if (!(await fs.promises.stat(file)).isFile()) throw new Error('Not a file');
    } catch { return json(res, 404, { error: 'Not found' }); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res);
  }
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(error => {
      if (res.headersSent) res.destroy();
      else json(res, error.status || 500, { error: error.status ? error.message : '小岛暂时忙碌，请稍后重试' });
    });
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) { if (client.res.writableLength > 512 * 1024) client.res.destroy(); else client.res.write(': heartbeat\n\n'); }
    const cutoff = Date.now() - 1000;
    for (const [key, history] of limits) if (!history.some(t => t > cutoff)) limits.delete(key);
  }, 15000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));
  return {
    server, info,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(actualPort, options.host || '0.0.0.0', () => {
        actualPort = server.address().port; server.removeListener('error', reject); resolve(info());
      });
    }),
    close: () => {
      for (const request of pending.values()) request.finish({ ok: false, error: '小岛正在关闭' });
      for (const client of clients) client.res.end();
      return new Promise(resolve => server.close(resolve));
    },
  };
}
if (require.main === module) {
  const world = createWorldServer();
  world.listen().then(info => console.log(`息屿已开启\n电脑打开 ${info.localUrl}\n手机与电脑连接同一 Wi-Fi，在电脑中点击「一起造风」扫码。\n按 Ctrl+C 关闭。`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
  process.on('SIGINT', () => world.close().then(() => process.exit(0)));
  process.on('SIGTERM', () => world.close().then(() => process.exit(0)));
}
module.exports = { createWorldServer, networks };
