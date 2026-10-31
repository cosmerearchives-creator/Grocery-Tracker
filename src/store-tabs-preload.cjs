const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storeTabs', {
  addNew: () => ipcRenderer.invoke('store-tab-add-new'),
  state: () => ipcRenderer.invoke('store-tabs-state'),
  select: id => ipcRenderer.invoke('store-tab-select', id),
  navigate: action => ipcRenderer.invoke('store-tab-navigate', action),
  setTarget: itemId => ipcRenderer.invoke('store-tab-target', itemId),
  useProduct: (mode = 'main') => ipcRenderer.invoke('store-tab-use-product', mode),
  onState: callback => ipcRenderer.on('store-tabs-state', (_event, state) => callback(state))
});
