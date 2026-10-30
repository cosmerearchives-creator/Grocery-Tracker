const { app, BrowserWindow, WebContentsView, ipcMain, dialog, clipboard, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { STORES, validStoreUrl, searchUrl, starterCart, validateCart, checklist } = require('./model.cjs');
const { extractScript } = require('./lookup.cjs');
let main, cart, readyUpdate = false, updateBusy = false;
let writeQueue = Promise.resolve();
const storeViews = new Map();
let storeShell, activeStore = 'meijer';
const tabErrors = new Map();
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (main && !main.isDestroyed()) { if (main.isMinimized()) main.restore(); main.focus(); } });
const cartPath = () => path.join(app.getPath('userData'), 'cart.json');
const sendStatus = (text, ready = false) => { if (main && !main.isDestroyed()) main.webContents.send('update-status', { text, ready }); };
function trusted(event) { if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) throw Error('Untrusted request.'); }
function handle(name, callback) { ipcMain.handle(name, (event, ...args) => { trusted(event); return callback(...args); }); }
async function persist(value) {
  const snapshot = JSON.parse(JSON.stringify(validateCart(value)));
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(cartPath() + '.tmp', JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await fs.rename(cartPath() + '.tmp', cartPath());
    cart = snapshot;
  });
  await writeQueue;
  return true;
}
function tabState() {
  return { active: activeStore, stores: STORES.map(s => {
    const wc = storeViews.get(s.id)?.webContents;
    return { id: s.id, name: s.name, url: wc && !wc.isDestroyed() ? wc.getURL() : '', loading: wc && !wc.isDestroyed() ? wc.isLoading() : false, canGoBack: wc && !wc.isDestroyed() ? wc.navigationHistory.canGoBack() : false, error: tabErrors.get(s.id) || '' };
  }) };
}
function updateTabs() { if (storeShell && !storeShell.isDestroyed()) storeShell.webContents.send('store-tabs-state', tabState()); }
function layoutTabs() {
  if (!storeShell || storeShell.isDestroyed()) return;
  const [width, height] = storeShell.getContentSize();
  for (const [id, view] of storeViews) { view.setBounds({ x: 0, y: 88, width, height: Math.max(1, height - 88) }); view.setVisible(id === activeStore); }
}
function ensureStoreShell() {
  if (storeShell && !storeShell.isDestroyed()) return;
  storeShell = new BrowserWindow({ width: 1200, height: 860, minWidth: 850, minHeight: 600, title: 'Grocery Tracker — Stores', webPreferences: { preload: path.join(__dirname, 'store-tabs-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  storeShell.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  storeShell.webContents.on('will-navigate', e => e.preventDefault());
  storeShell.on('resize', layoutTabs);
  storeShell.on('closed', () => {
    for (const view of storeViews.values()) if (!view.webContents.isDestroyed()) view.webContents.close();
    storeViews.clear(); tabErrors.clear(); storeShell = null;
  });
  storeShell.loadFile(path.join(__dirname, 'store-tabs.html')).catch(() => {});
}
function storeView(id, focus = true) {
  const store = STORES.find(s => s.id === id); if (!store) throw Error('Unknown store.');
  ensureStoreShell();
  let view = storeViews.get(id);
  if (!view || view.webContents.isDestroyed()) {
    view = new WebContentsView({ webPreferences: { partition: `persist:store-${id}`, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
    storeViews.set(id, view); storeShell.contentView.addChildView(view);
    const wc = view.webContents;
    // Remote content has no preload or access to either local app API.
    wc.setWindowOpenHandler(({ url }) => {
      if (validStoreUrl(id, url)) wc.loadURL(url).catch(() => {});
      else { tabErrors.set(id, 'This external page cannot open inside this store tab.'); updateTabs(); }
      return { action: 'deny' };
    });
    for (const name of ['will-navigate', 'will-redirect']) wc.on(name, (event, url) => { if (!validStoreUrl(id, url)) { event.preventDefault(); tabErrors.set(id, 'The store tried to open an unsupported external page.'); updateTabs(); } });
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    wc.session.setPermissionCheckHandler(() => false);
    wc.on('did-start-loading', () => { tabErrors.delete(id); updateTabs(); });
    for (const event of ['did-stop-loading', 'did-navigate', 'did-navigate-in-page']) wc.on(event, updateTabs);
    wc.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { tabErrors.set(id, 'Page could not load. Try Reload or check your connection.'); updateTabs(); } });
  }
  if (focus) { activeStore = id; storeShell.show(); storeShell.focus(); }
  layoutTabs(); updateTabs(); return view;
}
function trustedTabs(event) {
  if (!storeShell || event.sender !== storeShell.webContents || event.senderFrame !== storeShell.webContents.mainFrame) throw Error('Untrusted store-tab request.');
}
ipcMain.handle('store-tabs-state', event => { trustedTabs(event); return tabState(); });
ipcMain.handle('store-tab-select', (event, id) => {
  trustedTabs(event); const view = storeView(id);
  if (!view.webContents.getURL()) view.webContents.loadURL(STORES.find(s => s.id === id).home).catch(() => {});
  return true;
});
ipcMain.handle('store-tab-navigate', (event, action) => {
  trustedTabs(event); const wc = storeViews.get(activeStore)?.webContents; if (!wc || wc.isDestroyed()) return false;
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else if (action === 'reload') wc.reload();
  return true;
});
ipcMain.handle('store-tab-copy-url', event => {
  trustedTabs(event); const url = storeViews.get(activeStore)?.webContents.getURL();
  if (!validStoreUrl(activeStore, url)) throw Error('No store product link is open.');
  clipboard.writeText(url); return true;
});
async function searchStores(query) {
  // Validate every destination before creating views, then start all four
  // navigations without waiting for the other stores to finish.
  const destinations = STORES.map(store => ({ ...store, url: searchUrl(store.id, query) }));
  for (const store of destinations) {
    const wc = storeView(store.id, false).webContents;
    wc.loadURL(store.url).catch(() => {});
  }
  activeStore = 'meijer'; layoutTabs(); updateTabs(); storeShell.show(); storeShell.focus();
  return true;
}
async function capture(id, url) {
  if (!validStoreUrl(id, url)) throw Error('Use an HTTPS product link on this store’s own website.');
  const wc = storeView(id).webContents;
  // Keep a signed-in, already-open product page intact rather than reloading
  // its selection/location. New links still open their default version.
  if (wc.getURL() !== url) await wc.loadURL(url);
  let result;
  const deadline = Date.now() + 12000;
  do {
    if (wc.isDestroyed() || !validStoreUrl(id, wc.getURL())) throw Error('Store page is unavailable.');
    result = await wc.executeJavaScript(extractScript, false);
    if (!result || !validStoreUrl(id, result.url)) throw Error('Could not read this product page.');
    if (result.candidates.length || /marked unavailable/.test(result.reason)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  return result;
}
async function checkUpdate() {
  if (!app.isPackaged) { sendStatus('Updates are available in the installed Windows app.'); return; }
  if (updateBusy || readyUpdate) { sendStatus(readyUpdate ? 'Update downloaded — ready to restart.' : 'Checking or downloading an update…', readyUpdate); return; }
  updateBusy = true; sendStatus('Checking for updates…');
  try { await autoUpdater.checkForUpdates(); } catch { updateBusy = false; sendStatus('Could not check for updates. Your cart is still available; try again later.'); }
}
app.whenReady().then(async () => {
  let loadError = false;
  try { cart = validateCart(JSON.parse(await fs.readFile(cartPath(), 'utf8'))); }
  catch (error) {
    cart = starterCart();
    if (error.code !== 'ENOENT') { loadError = true; await fs.copyFile(cartPath(), cartPath() + '.backup-' + Date.now()).catch(() => {}); }
  }
  main = new BrowserWindow({ width: 1360, height: 930, minWidth: 980, minHeight: 700, backgroundColor: '#f4f5ef', title: 'Grocery Tracker', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  main.on('closed', () => { if (storeShell && !storeShell.isDestroyed()) storeShell.close(); });
  Menu.setApplicationMenu(null);
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  handle('load', () => ({ cart, version: app.getVersion(), loadError }));
  handle('stores', () => STORES.map(({ id, name }) => ({ id, name })));
  handle('save', persist);
  handle('open-store', id => { const wc = storeView(id).webContents; if (!wc.getURL()) wc.loadURL(STORES.find(s => s.id === id).home).catch(() => {}); return true; });
  handle('search-stores', searchStores);
  handle('capture', capture);
  handle('export', async (id, kind) => {
    await writeQueue;
    const text = checklist(cart, id);
    if (kind === 'copy') { clipboard.writeText(text); return 'Shopping checklist copied. Paste it into Google Docs or Keep.'; }
    if (kind !== 'file') throw Error('Unknown export format.');
    const result = await dialog.showSaveDialog(main, { defaultPath: `Grocery-Tracker-${id}.txt`, filters: [{ name: 'Shopping checklist', extensions: ['txt'] }] });
    if (!result.canceled) { await fs.writeFile(result.filePath, text, 'utf8'); return 'Shopping checklist saved.'; }
    return 'Export canceled.';
  });
  handle('check-update', checkUpdate);
  handle('install-update', async () => { await writeQueue; if (readyUpdate) { autoUpdater.quitAndInstall(false, true); return true; } return false; });
  autoUpdater.autoDownload = true;
  // Explicit restart avoids interrupting a store session or losing edits.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', () => sendStatus('Update found — downloading in the background…'));
  autoUpdater.on('update-not-available', () => { updateBusy = false; sendStatus('You have the latest version.'); });
  autoUpdater.on('download-progress', p => sendStatus(`Downloading update… ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', () => { readyUpdate = true; updateBusy = false; sendStatus('Update downloaded — save and restart when ready.', true); });
  autoUpdater.on('error', () => { updateBusy = false; sendStatus('Update unavailable. You can keep using the app and try again later.'); });
  await main.loadFile(path.join(__dirname, 'index.html'));
  if (app.isPackaged) { setTimeout(checkUpdate, 3000); setInterval(checkUpdate, 4 * 60 * 60 * 1000).unref(); }
});
app.on('window-all-closed', () => app.quit());
