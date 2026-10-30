const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storeTabs', {
  state: () => ipcRenderer.invoke('store-tabs-state'),
  select: id => ipcRenderer.invoke('store-tab-select', id),
  navigate: action => ipcRenderer.invoke('store-tab-navigate', action),
  copyUrl: () => ipcRenderer.invoke('store-tab-copy-url'),
  onState: callback => ipcRenderer.on('store-tabs-state', (_event, state) => callback(state))
});
