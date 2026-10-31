const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storeTabs', {
  previewNew: () => ipcRenderer.invoke('store-tab-preview-new'),
  reviewNew: token => ipcRenderer.invoke('store-tab-review-new', token),
  addNew: options => ipcRenderer.invoke('store-tab-add-new', options),
  state: () => ipcRenderer.invoke('store-tabs-state'),
  select: id => ipcRenderer.invoke('store-tab-select', id),
  navigate: action => ipcRenderer.invoke('store-tab-navigate', action),
  setTarget: itemId => ipcRenderer.invoke('store-tab-target', itemId),
  useProduct: (mode = 'main') => ipcRenderer.invoke('store-tab-use-product', mode),
  onState: callback => ipcRenderer.on('store-tabs-state', (_event, state) => callback(state))
});
