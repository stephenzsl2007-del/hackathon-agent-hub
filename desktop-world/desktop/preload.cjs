'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
function listen(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('desktopWorld', {
  getDesktopMode: () => ipcRenderer.invoke('world:get-desktop-mode'),
  getDesktopState: () => ipcRenderer.invoke('world:get-desktop-state'),
  setDesktopMode: enabled => ipcRenderer.invoke('world:set-desktop-mode', Boolean(enabled)),
  setIgnoreMouse: enabled => ipcRenderer.invoke('world:set-ignore-mouse', Boolean(enabled)),
  setMouseMode: mode => ipcRenderer.invoke('world:set-mouse-mode', mode),
  setFeedingMode: enabled => ipcRenderer.invoke('world:set-feeding-mode', Boolean(enabled)),
  setVisible: enabled => ipcRenderer.invoke('world:set-visible', Boolean(enabled)),
  setAlwaysOnTop: enabled => ipcRenderer.invoke('world:set-always-on-top', Boolean(enabled)),
  resetBounds: () => ipcRenderer.invoke('world:reset-bounds'),
  resizeGarden: factor => ipcRenderer.invoke('world:resize', factor),
  moveGarden: delta => ipcRenderer.invoke('world:move', delta),
  showContextMenu: () => ipcRenderer.invoke('world:context-menu'),
  prepareFiles: files => {
    if (!Array.isArray(files) || files.length > 30) return Promise.resolve({ ok: false, error: '一次最多选择 30 个文件。', items: [] });
    const paths = files.map(file => { try { return webUtils.getPathForFile(file); } catch { return ''; } });
    return ipcRenderer.invoke('world:prepare-files', paths);
  },
  confirmTrash: batchId => ipcRenderer.invoke('world:confirm-trash', batchId),
  cancelTrash: batchId => ipcRenderer.invoke('world:cancel-trash', batchId),
  openTrash: () => ipcRenderer.invoke('world:open-trash'),
  loadState: options => ipcRenderer.invoke('world:load-state', options),
  saveState: (snapshot, options) => ipcRenderer.invoke('world:save-state', snapshot, options),
  ackQuit: requestId => ipcRenderer.invoke('world:ack-quit', requestId),
  close: () => ipcRenderer.invoke('world:close'),
  onModeChange: callback => listen('world:mode', callback),
  onDesktopState: callback => listen('world:desktop-state', callback),
  onCommand: callback => listen('world:command', callback),
});
