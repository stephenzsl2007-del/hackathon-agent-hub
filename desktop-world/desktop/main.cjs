'use strict';
const { app, BrowserWindow, Menu, ipcMain, globalShortcut, screen, session, Tray, nativeImage, shell, powerMonitor } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { createWorldServer } = require('../server.cjs');
const { AtomicStore, FileRecycle, QuitHandshake, WINDOW_LAYOUT_VERSION, validWindowBounds, fitWindowBounds, dragWindowBounds, defaultWindowBounds, migrateWindowLayout } = require('./native-services.cjs');
let win, world, tray, baseURL, windowStore, gardenStore, demoStore, recycler;
let mode = true, feeding = false, moving = false, islandDragging = false, partialIgnore = false, shuttingDown = false;
let windowSaveTimer, displayTimer, quitting;
const quitHandshake = new QuitHandshake({ timeout: 3000 });
let settings = { alwaysOnTop: true, mouseMode: 'interactive', bounds: null, layoutVersion: WINDOW_LAYOUT_VERSION };
const shortcutState = {};
let dragDebugEnabled = process.argv.includes('--xiyu-drag-debug'), dragDebugPath, dragDebugTimer;
const dragDebugEvents = [];
function traceDrag(event, data = {}) {
  if (!dragDebugEnabled || !dragDebugPath) return;
  dragDebugEvents.push({ at: Date.now(), event, ...data });
  if (dragDebugEvents.length > 500) dragDebugEvents.splice(0, dragDebugEvents.length - 500);
  clearTimeout(dragDebugTimer);
  dragDebugTimer = setTimeout(() => { fs.promises.writeFile(dragDebugPath, JSON.stringify(dragDebugEvents, null, 2), { mode: 0o600 }).catch(() => {}); }, 100);
}
function rendererDragTrace(payload) {
  if (!dragDebugEnabled || !payload || typeof payload !== 'object') return;
  const event = ['down','rejected','capture','move','up','cancel','blur','lostpointercapture','pointercancel','native-call','native-finish'].includes(payload.event) ? payload.event : 'unknown';
  const data = {};
  for (const key of ['screenX','screenY','clientX','clientY','pointerId','buttons','button','dx','dy']) if (Number.isFinite(payload[key])) data[key] = payload[key];
  for (const key of ['desktopMode','hasOpenDialog','moveMode','altKey','ctrlKey','metaKey','hit','weather','captured','active']) if (typeof payload[key] === 'boolean') data[key] = payload[key];
  const values = { phase:['pending','dragging','settling','idle'], tool:['explore','wind','rain','seed','food','tide'], target:['canvas','handle','other'], reason:['no-bridge','target','state','tool','miss','weather','no-tap','invalid-position','forwarded-move','uncaptured-hover','new-down','explicit','escape','hidden','lostpointercapture','pointercancel','blur','error'] };
  for (const [key, allowed] of Object.entries(values)) if (allowed.includes(payload[key])) data[key] = payload[key];
  traceDrag(`renderer:${event}`, data);
}
app.setName('息屿');
const single = app.requestSingleInstanceLock();
if (!single) app.quit();

function defaultBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return defaultWindowBounds(display.workArea);
}
function clampBounds(bounds) {
  if (!validWindowBounds(bounds)) return defaultBounds();
  const displays = screen.getAllDisplays();
  const intersects = displays.some(({ workArea: a }) => bounds.x + bounds.width > a.x + 60 && bounds.y + bounds.height > a.y + 60 && bounds.x < a.x + a.width - 60 && bounds.y < a.y + a.height - 60);
  const area = (intersects ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay()).workArea;
  return fitWindowBounds(bounds, area);
}
function desktopState() {
  return { desktopMode: mode, visible: Boolean(win?.isVisible()), alwaysOnTop: settings.alwaysOnTop, mouseMode: settings.mouseMode, feeding, moving, bounds: win?.getBounds() || settings.bounds, shortcuts: shortcutState };
}
function sendState() { if (win && !win.isDestroyed()) win.webContents.send('world:desktop-state', desktopState()); updateTray(); }
function command(type, details = {}) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('world:command', { type, ...details });
}
function persistWindow() {
  clearTimeout(windowSaveTimer);
  windowSaveTimer = setTimeout(() => {
    windowSaveTimer = null;
    if (mode && win && !win.isDestroyed()) settings.bounds = win.getBounds();
    windowStore?.save(settings).then(result => { if (!result.ok) command('notice', { message: result.error }); });
  }, 500);
}
function applyMouseMode() {
  if (!win || win.isDestroyed()) return;
  const ignore = mode && !feeding && !moving && !islandDragging && (settings.mouseMode === 'passthrough' || partialIgnore);
  win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  return Boolean(ignore);
}
function applyTopmost() { if (win && !win.isDestroyed()) win.setAlwaysOnTop(Boolean(settings.alwaysOnTop || feeding || moving), 'floating'); }
function setFeedingMode(enabled) {
  feeding = Boolean(enabled); partialIgnore = false; moving = false;
  applyTopmost();
  if (feeding) win.showInactive();
  applyMouseMode(); sendState(); command('feed', { active: feeding });
  return desktopState();
}
function setDesktopMode(_enabled) {
  if (!win || win.isDestroyed()) return false;
  // Legacy API remains for the renderer, but the native product always stays transparent.
  mode = true;
  applyTopmost();
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyMouseMode();
  win.webContents.send('world:mode', true);
  sendState();
  return true;
}
function setVisible(enabled) {
  if (enabled) win.showInactive(); else { finishMove(); win.hide(); commandHidden(); }
  sendState(); return desktopState();
}
function commandHidden() { win.webContents.send('world:command', { type: 'visibility', visible: false }); }
function setMouseMode(value) {
  if (!['interactive', 'passthrough'].includes(value)) return desktopState();
  finishMove();
  settings.mouseMode = value; partialIgnore = false; feeding = false; moving = false;
  applyTopmost(); applyMouseMode(); persistWindow(); sendState(); return desktopState();
}
function setAlwaysOnTop(enabled) { settings.alwaysOnTop = Boolean(enabled); applyTopmost(); persistWindow(); sendState(); return desktopState(); }
function resetBounds() { settings.bounds = defaultBounds(); win.setBounds(settings.bounds); persistWindow(); sendState(); return desktopState(); }
function resizeGarden(factor) {
  if (!Number.isFinite(factor) || factor < .5 || factor > 2) return desktopState();
  const b = win.getBounds();
  const width = Math.round(b.width * factor), height = Math.round(b.height * factor);
  win.setBounds(clampBounds({ width, height, x: b.x + b.width - width, y: b.y + b.height - height }));
  persistWindow(); sendState(); return desktopState();
}
function moveGarden(delta) {
  const dx = Number(delta?.dx), dy = Number(delta?.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1000 || Math.abs(dy) > 1000) return desktopState();
  const b = win.getBounds(), requested = { ...b, x: b.x + dx, y: b.y + dy };
  if (delta.dragging === true) {
    islandDragging = true; applyMouseMode();
    win.setBounds(dragWindowBounds(requested, screen.getAllDisplays().map(display => display.workArea)));
  } else win.setBounds(clampBounds(requested));
  traceDrag('native:move', { dx, dy, dragging: delta.dragging === true, before: b, after: win.getBounds() });
  persistWindow(); sendState(); return desktopState();
}
function finishMove() {
  if (!islandDragging || !win || win.isDestroyed()) return desktopState();
  islandDragging = false;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setMinimumSize(Math.min(560, area.width), Math.min(360, area.height));
  win.setBounds(fitWindowBounds(win.getBounds(), area));
  traceDrag('native:finish', { after: win.getBounds() });
  applyMouseMode(); persistWindow(); sendState(); return desktopState();
}
function setMoving(enabled) { moving = Boolean(enabled); feeding = false; partialIgnore = false; applyTopmost(); if (moving) win.showInactive(); applyMouseMode(); sendState(); command('move', { active: moving }); }
function recover() {
  finishMove();
  settings.mouseMode = 'interactive'; feeding = false; moving = false; partialIgnore = false;
  if (!win.isVisible()) win.showInactive();
  win.setBounds(clampBounds(win.getBounds())); applyTopmost(); applyMouseMode(); persistWindow(); sendState(); command('tools');
}
function menuTemplate() {
  return [
    { label: '息屿 · 桌面花园', enabled: false },
    { label: win?.isVisible() ? '隐藏花园' : '显示花园', click: () => setVisible(!win.isVisible()) },
    { label: '保持置顶', type: 'checkbox', checked: settings.alwaysOnTop, click: item => setAlwaysOnTop(item.checked) },
    { type: 'separator' },
    { label: '交互模式（透明空白穿透）', type: 'radio', checked: settings.mouseMode === 'interactive', click: () => setMouseMode('interactive') },
    { label: '完全鼠标穿透', type: 'radio', checked: settings.mouseMode === 'passthrough', click: () => setMouseMode('passthrough') },
    { label: feeding ? '结束文件投喂模式' : '进入文件投喂模式', accelerator: 'CommandOrControl+Alt+Shift+F', click: () => setFeedingMode(!feeding) },
    { label: '找回花园与工具', accelerator: 'CommandOrControl+Alt+Shift+G', click: recover },
    { type: 'separator' },
    { label: '花园工具', click: () => { recover(); command('tools'); } },
    { label: '切换白天／夜色', click: () => { setVisible(true); command('night'); } },
    { label: '开启／关闭环境音', click: () => { setVisible(true); command('sound'); } },
    { label: '开启／关闭麦克风送风', click: () => { setVisible(true); command('mic'); } },
    { label: '演示植物五阶段成长', click: () => { setVisible(true); command('demo'); } },
    { label: '专注陪伴', click: () => { recover(); command('focus'); } },
    { label: '邀请手机加入', click: () => { recover(); command('share'); } },
    { label: '操作说明', click: () => { recover(); command('guide'); } },
    { label: '设置与存档', click: () => { recover(); command('settings'); } },
    { type: 'separator' },
    { label: moving ? '完成移动' : '移动花园（拖动模式）', click: () => setMoving(!moving) },
    { label: '调整位置与大小', submenu: [
      { label: '放大 10%', click: () => resizeGarden(1.1) }, { label: '缩小 10%', click: () => resizeGarden(1 / 1.1) },
      { label: '向左移动', click: () => moveGarden({ dx: -50, dy: 0 }) }, { label: '向右移动', click: () => moveGarden({ dx: 50, dy: 0 }) },
      { label: '向上移动', click: () => moveGarden({ dx: 0, dy: -50 }) }, { label: '向下移动', click: () => moveGarden({ dx: 0, dy: 50 }) },
      { label: '恢复默认位置', click: resetBounds },
    ] },
    { label: '打开系统废纸篓', click: () => openTrash() },
    { type: 'separator' },
    { label: '完全退出息屿', role: 'quit' },
  ];
}
function updateTray() { if (tray && !tray.isDestroyed()) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate())); }
function createTray() {
  const size = 18, bytes = Buffer.alloc(size * size * 4);
  const blocks = [[8,7,2,10],[3,3,6,5],[9,1,6,6],[5,7,4,2],[11,6,3,2],[4,15,10,2]];
  for (const [x,y,w,h] of blocks) for (let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) bytes[(yy*size+xx)*4+3]=255;
  const icon = nativeImage.createFromBitmap(bytes, { width: size, height: size, scaleFactor: 1 }); icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('息屿 · 花园与工具'); updateTray();
}
async function openTrash() {
  const target = process.platform === 'darwin' ? path.join(os.homedir(), '.Trash') : process.platform === 'win32' ? 'shell:RecycleBinFolder' : path.join(os.homedir(), '.local/share/Trash/files');
  const error = await shell.openPath(target);
  return error ? { ok: false, error: '暂时无法打开系统废纸篓，请从系统桌面打开。' } : { ok: true };
}
function validateSender(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !event.senderFrame.url.startsWith(baseURL + '/')) throw new Error('Unsupported IPC source');
}
function handle(channel, callback) { ipcMain.handle(channel, (event, ...args) => { validateSender(event); return callback(...args); }); }
function installIPC() {
  handle('world:get-desktop-mode', () => mode);
  handle('world:get-desktop-state', desktopState);
  handle('world:set-desktop-mode', setDesktopMode);
  handle('world:set-ignore-mouse', enabled => { partialIgnore = Boolean(enabled); return applyMouseMode(); });
  handle('world:set-mouse-mode', setMouseMode);
  handle('world:set-feeding-mode', setFeedingMode);
  handle('world:set-visible', setVisible);
  handle('world:set-always-on-top', setAlwaysOnTop);
  handle('world:reset-bounds', resetBounds);
  handle('world:resize', resizeGarden);
  handle('world:move', moveGarden);
  handle('world:finish-move', finishMove);
  handle('world:drag-debug', rendererDragTrace);
  handle('world:context-menu', () => { Menu.buildFromTemplate(menuTemplate()).popup({ window: win }); return true; });
  handle('world:prepare-files', paths => recycler.prepare(paths));
  handle('world:confirm-trash', batchId => recycler.confirm(batchId));
  handle('world:cancel-trash', batchId => recycler.cancel(batchId));
  handle('world:open-trash', openTrash);
  handle('world:load-state', options => (options?.slot === 'demo' ? demoStore : gardenStore).load());
  handle('world:save-state', (snapshot, options) => (options?.slot === 'demo' ? demoStore : gardenStore).save(snapshot, options || {}));
  handle('world:ack-quit', requestId => quitHandshake.acknowledge(requestId));
  handle('world:close', () => app.quit());
}
async function createWindow() {
  const bounds = clampBounds(settings.bounds || defaultBounds());
  const workArea = screen.getDisplayMatching(bounds).workArea;
  win = new BrowserWindow({
    ...bounds, minWidth: Math.min(560, workArea.width), minHeight: Math.min(360, workArea.height), title: '息屿', frame: false, transparent: true,
    backgroundColor: '#00000000', show: false, hasShadow: false, resizable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: true, additionalArguments: dragDebugEnabled ? ['--xiyu-drag-debug'] : [] },
  });
  win.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', finishMove);
  win.webContents.on('will-navigate', (event, target) => { if (!target.startsWith(baseURL + '/')) event.preventDefault(); });
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      feeding = false; moving = false; partialIgnore = false; applyTopmost(); applyMouseMode(); sendState();
      command('dismiss');
    }
  });
  win.on('move', persistWindow); win.on('resize', persistWindow);
  win.on('blur', () => { traceDrag('native:blur'); finishMove(); });
  win.on('show', () => { command('visibility', { visible: true }); sendState(); });
  win.on('hide', () => { commandHidden(); sendState(); });
  win.once('ready-to-show', () => { win.showInactive(); applyMouseMode(); });
  await win.loadURL(`${baseURL}/?native=1`);
  win.webContents.send('world:mode', mode); sendState();
  if (feeding) command('feed', { active: true });
}

if (single) app.whenReady().then(async () => {
  try {
    const userData = app.getPath('userData');
    dragDebugEnabled ||= fs.existsSync(path.join(userData, 'drag-debug.enabled'));
    dragDebugPath = path.join(userData, 'drag-debug.json');
    traceDrag('native:start');
    windowStore = new AtomicStore(path.join(userData, 'window-state.json'), { delay: 0, maxBytes: 10000 });
    gardenStore = new AtomicStore(path.join(userData, 'garden-state.json'));
    demoStore = new AtomicStore(path.join(userData, 'demo-state.json'));
    const loaded = await windowStore.load();
    if (loaded.ok && loaded.state) {
      const display = validWindowBounds(loaded.state.bounds) ? screen.getDisplayMatching(loaded.state.bounds) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const migration = migrateWindowLayout(loaded.state, display.workArea);
      settings = { ...settings, ...migration.settings, alwaysOnTop: loaded.state.alwaysOnTop !== false, mouseMode: loaded.state.mouseMode === 'passthrough' ? 'passthrough' : 'interactive' };
      if (migration.changed) {
        const saved = await windowStore.save(settings);
        if (!saved.ok) console.error(saved.error);
      }
    }
    recycler = new FileRecycle({ trashItem: filename => shell.trashItem(filename), protectedPaths: [app.getAppPath(), userData, path.dirname(process.execPath)] });
    world = createWorldServer({ port: 4178 });
    let info;
    try { info = await world.listen(); }
    catch (error) { if (error.code !== 'EADDRINUSE') throw error; world = createWorldServer({ port: 0 }); info = await world.listen(); }
    baseURL = info.localUrl;
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const audioOnly = !details.mediaTypes || details.mediaTypes.every(type => type === 'audio');
      callback(permission === 'media' && audioOnly && webContents.getURL().startsWith(baseURL + '/'));
    });
    installIPC();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '息屿', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '找回花园', accelerator: 'CommandOrControl+Alt+Shift+G', click: recover }, { role: 'quit', label: '完全退出息屿' }] },
      { label: '花园', submenu: [{ label: '进入文件投喂模式', accelerator: 'CommandOrControl+Alt+Shift+F', click: () => setFeedingMode(true) }, { label: '花园工具', click: () => command('tools') }] },
      { label: '编辑', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    ]));
    shortcutState.recover = globalShortcut.register('CommandOrControl+Alt+Shift+G', recover);
    shortcutState.feed = globalShortcut.register('CommandOrControl+Alt+Shift+F', () => setFeedingMode(!feeding));
    await createWindow(); createTray();
    const repairDisplay = () => { clearTimeout(displayTimer); displayTimer = setTimeout(() => { if (win && !win.isDestroyed()) { const bounds = clampBounds(win.getBounds()); const area = screen.getDisplayMatching(bounds).workArea; win.setMinimumSize(Math.min(560, area.width), Math.min(360, area.height)); win.setBounds(bounds); persistWindow(); sendState(); } }, 300); };
    screen.on('display-removed', repairDisplay); screen.on('display-added', repairDisplay); screen.on('display-metrics-changed', repairDisplay);
    powerMonitor.on('suspend', () => { command('suspend'); gardenStore.flush(); demoStore.flush(); });
    powerMonitor.on('lock-screen', () => command('suspend'));
    powerMonitor.on('resume', () => command('resume'));
    powerMonitor.on('unlock-screen', () => command('resume'));
  } catch (error) { console.error(error); app.quit(); }
});
app.on('second-instance', () => { if (win) recover(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (shuttingDown) return;
  event.preventDefault();
  if (quitting) return;
  quitting = (async () => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      await quitHandshake.request(message => win.webContents.send('world:command', message));
    }
    clearTimeout(windowSaveTimer);
    if (win && !win.isDestroyed()) settings.bounds = win.getBounds();
    const windowSave = windowStore?.save(settings) || Promise.resolve();
    windowStore?.flush();
    await Promise.allSettled([windowSave, gardenStore?.flush(), demoStore?.flush()]);
  })().finally(() => { shuttingDown = true; app.quit(); });
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); tray?.destroy(); if (world) world.close(); });
