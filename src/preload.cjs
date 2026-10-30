const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('grocery', {
  load: () => ipcRenderer.invoke('load'),
  change: change => ipcRenderer.invoke('change', change),
  onCartChanged: callback => ipcRenderer.on('cart-changed', (_event, cart) => callback(cart)),
  stores: () => ipcRenderer.invoke('stores'),
  openStore: store => ipcRenderer.invoke('open-store', store),
  searchStores: (query, itemId, choiceId) => ipcRenderer.invoke('search-stores', query, itemId, choiceId),
  searchStore: (store, itemId, choiceId) => ipcRenderer.invoke('search-store', store, itemId, choiceId),
  setCaptureTarget: itemId => ipcRenderer.invoke('capture-target', itemId),
  capture: (store, url) => ipcRenderer.invoke('capture', store, url),
  export: (store, kind) => ipcRenderer.invoke('export', store, kind),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdate: callback => ipcRenderer.on('update-status', (_event, data) => callback(data))
});
