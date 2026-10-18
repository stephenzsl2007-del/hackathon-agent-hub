'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PUBLIC = path.join(__dirname, 'public');
const ACTIONS = new Set(['wind', 'rain', 'seed', 'food', 'tide', 'fireflies']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };

function addresses() {
  return Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}
function isLocal(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

function createWorldServer(options = {}) {
  const token = options.token || crypto.randomBytes(18).toString('hex');
  const roomCode = crypto.randomBytes(2).toString('hex').toUpperCase();
  const clients = new Set();
  const limits = new Map();
  let eventId = 0;
  let actualPort = options.port ?? Number(process.env.PORT || 4177);
  const info = () => ({
    name: '息屿', roomCode, port: actualPort,
    addresses: addresses(),
    phoneUrl: `http://${addresses()[0] || 'localhost'}:${actualPort}/phone.html?room=${token}`,
    localUrl: `http://localhost:${actualPort}`,
    token,
    audience: [...clients].filter(c => c.phone).length,
  });
  const emit = (event, data) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.res.write(message);
  };
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
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
      try {
        const QRCode = require('qrcode');
        const svg = await QRCode.toString(info().phoneUrl, { type: 'svg', width: 228, margin: 2, color: { dark: '#334438', light: '#fff9e8' } });
        res.writeHead(200, { 'Content-Type': TYPES['.svg'], 'Cache-Control': 'no-store' });
        return res.end(svg);
      } catch { return json(res, 503, { error: '二维码组件未安装，请使用同屏显示的地址' }); }
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      if (!authorized) return json(res, 403, { error: '房间码不正确' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      const client = { res, phone: url.searchParams.get('phone') === '1' };
      clients.add(client);
      res.write(`event: ready\ndata: ${JSON.stringify({ roomCode, audience: info().audience })}\n\n`);
      emit('audience', { count: info().audience });
      req.on('close', () => { clients.delete(client); emit('audience', { count: info().audience }); });
      return;
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) return json(res, 413, { error: '消息太长' });
      }
      let data;
      try { data = JSON.parse(body); } catch { return json(res, 400, { error: '消息格式不正确' }); }
      if (data.room !== token && !isLocal(req)) return json(res, 403, { error: '请重新扫描二维码' });
      if (!ACTIONS.has(data.action)) return json(res, 400, { error: '未知互动' });
      const now = Date.now();
      const address = req.socket.remoteAddress;
      const history = (limits.get(address) || []).filter(t => now - t < 1000);
      if (history.length >= 8) return json(res, 429, { error: '慢一点，小岛正在回应你' });
      history.push(now); limits.set(address, history);
      const event = { action: data.action, value: Number.isFinite(data.value) ? Math.max(0, Math.min(1, data.value)) : 0.7, id: ++eventId, source: 'phone', time: now };
      emit('action', event);
      return json(res, 200, { ok: true, id: event.id, audience: info().audience });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    let file;
    try {
      const decoded = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname === '/phone' ? '/phone.html' : url.pathname);
      file = path.resolve(PUBLIC, '.' + decoded);
      if (!file.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Forbidden' });
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) throw new Error('Not a file');
    } catch { return json(res, 404, { error: 'Not found' }); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  const heartbeat = setInterval(() => {
    for (const c of clients) c.res.write(': heartbeat\n\n');
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
        actualPort = server.address().port;
        server.removeListener('error', reject);
        resolve(info());
      });
    }),
    close: () => { for (const c of clients) c.res.end(); return new Promise(resolve => server.close(resolve)); },
  };
}

if (require.main === module) {
  const world = createWorldServer();
  world.listen().then(info => {
    console.log(`息屿已开启\n电脑打开 ${info.localUrl}\n手机与电脑连接同一 Wi-Fi 后，在电脑中点击「一起造风」扫描二维码。\n按 Ctrl+C 关闭。`);
  }).catch(error => {
    console.error(error.code === 'EADDRINUSE' ? '端口 4177 已被使用。已有小岛可能正在运行，打开 http://localhost:4177 即可。' : error.message);
    process.exitCode = 1;
  });
  process.on('SIGINT', () => world.close().then(() => process.exit(0)));
  process.on('SIGTERM', () => world.close().then(() => process.exit(0)));
}
module.exports = { createWorldServer };
