const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('grocery', {
  load: () => ipcRenderer.invoke('load'),
  save: cart => ipcRenderer.invoke('save', cart),
  stores: () => ipcRenderer.invoke('stores'),
  openStore: store => ipcRenderer.invoke('open-store', store),
  searchStores: query => ipcRenderer.invoke('search-stores', query),
  capture: (store, url) => ipcRenderer.invoke('capture', store, url),
  export: (store, kind) => ipcRenderer.invoke('export', store, kind),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdate: callback => ipcRenderer.on('update-status', (_event, data) => callback(data))
});
