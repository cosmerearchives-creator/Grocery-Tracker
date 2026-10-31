const { app, BrowserWindow, WebContentsView, ipcMain, dialog, clipboard, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { STORES, validStoreUrl, searchUrl, starterCart, migrateCart, validateCart, checklist, applyChange, applyDetected, searchChoices, applyPriceRefresh, applyThumbnailRefresh } = require('./model.cjs');
const { extractScript } = require('./lookup.cjs');
const { cartView } = require('./cart-view.cjs');
let main, cart, readyUpdate = false, updateBusy = false;
let writeQueue = Promise.resolve();
const storeViews = new Map();
const closedStores = new Set();
let storeShell, activeStore = 'meijer';
let captureTarget = null;
const tabErrors = new Map();
const refreshWindows = new Map();
let refreshCanceled = false;
let refreshState = { running: false, text: 'Refresh checks saved product links across all store carts.' };
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (main && !main.isDestroyed()) { if (main.isMinimized()) main.restore(); main.focus(); } });
const cartPath = () => path.join(app.getPath('userData'), 'cart.json');
const sendStatus = (text, ready = false) => { if (main && !main.isDestroyed()) main.webContents.send('update-status', { text, ready }); };
function trusted(event) { if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) throw Error('Untrusted request.'); }
function handle(name, callback) { ipcMain.handle(name, (event, ...args) => { trusted(event); return callback(...args); }); }
async function persist(value) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const snapshot = typeof value === 'function' ? JSON.parse(JSON.stringify(cart)) : JSON.parse(JSON.stringify(value));
    if (typeof value === 'function') value(snapshot);
    validateCart(snapshot);
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(cartPath() + '.tmp', JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await fs.rename(cartPath() + '.tmp', cartPath());
    cart = snapshot;
    if (captureTarget && !cart.items.some(i => i.id === captureTarget)) captureTarget = null;
    updateTabs();
    if (main && !main.isDestroyed()) main.webContents.send('cart-changed', cart);
  });
  await writeQueue;
  return true;
}
function tabState() {
  return { active: activeStore, target: captureTarget, items: cart?.items.filter(i => STORES.some(s => s.id === i.store)).map(i => ({ id: i.id, name: `${i.name} · ${STORES.find(s => s.id === i.store).name}` })) || [], stores: STORES.filter(s => !closedStores.has(s.id)).map(s => {
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
  closedStores.clear();
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
  closedStores.delete(id);
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
function setCaptureTarget(id) {
  if (id === null || id === '') { captureTarget = null; updateTabs(); return true; }
  if (!cart.items.some(i => i.id === id)) throw Error('Choose an item from your cart.');
  captureTarget = id; updateTabs(); return true;
}
ipcMain.handle('store-tab-target', (event, id) => { trustedTabs(event); return setCaptureTarget(id); });
function closeStoreTab(id, originalView) {
  if (!storeShell || storeShell.isDestroyed() || storeViews.get(id) !== originalView) return;
  storeViews.delete(id); closedStores.add(id); tabErrors.delete(id);
  storeShell.contentView.removeChildView(originalView);
  if (!originalView.webContents.isDestroyed()) originalView.webContents.close();
  if (activeStore === id) activeStore = STORES.find(s => !closedStores.has(s.id))?.id || null;
  if (activeStore && !storeViews.has(activeStore)) {
    const next = storeView(activeStore, false).webContents;
    next.loadURL(STORES.find(s => s.id === activeStore).home).catch(() => {});
  }
  layoutTabs(); updateTabs();
}
ipcMain.handle('store-tab-use-product', async (event, mode = 'main') => {
  trustedTabs(event);
  if (!['main', 'alternative'].includes(mode)) throw Error('Choose Use this price or Save as alternative.');
  const itemId = captureTarget, store = activeStore;
  if (!cart.items.some(i => i.id === itemId)) throw Error('Choose a cart item beside Use this price first.');
  const originalView = storeViews.get(store);
  const url = originalView?.webContents.getURL();
  if (!validStoreUrl(store, url)) throw Error('Open a store product page first.');
  const result = await capture(store, url);
  if (!result.candidates.length) throw Error(result.reason || 'No price was detected on this page.');
  const product = result.candidates[0];
  if (!originalView || originalView.webContents.isDestroyed() || originalView.webContents.getURL() !== result.url) throw Error('The product page changed. Try again on the intended product.');
  const asAlternative = mode === 'alternative';
  await persist(snapshot => applyDetected(snapshot, itemId, store, result, asAlternative));
  if (!asAlternative) closeStoreTab(store, originalView);
  return { cents: product.cents, product: product.product, asAlternative };
});
function selectedQuery(itemId, choiceId) {
  const item = cart.items.find(i => i.id === itemId);
  if (!item) throw Error('Choose a cart item.');
  const choice = searchChoices(item).find(c => c.id === choiceId);
  if (!choice) throw Error('Choose a product name or UPC to search.');
  return choice.query;
}
async function searchStores(query, itemId, choiceId) {
  if (choiceId) query = selectedQuery(itemId, choiceId);
  // Validate every destination before creating views, then start all active
  // navigations without waiting for the other stores to finish.
  const destinations = STORES.map(store => ({ ...store, url: searchUrl(store.id, query) }));
  if (itemId) setCaptureTarget(itemId);
  closedStores.clear();
  for (const store of destinations) {
    const wc = storeView(store.id, false).webContents;
    wc.loadURL(store.url).catch(() => {});
  }
  activeStore = 'meijer'; layoutTabs(); updateTabs(); storeShell.show(); storeShell.focus();
  return true;
}
function searchStore(store, itemId, choiceId) {
  if (!STORES.some(s => s.id === store)) throw Error('Choose an active store.');
  const url = searchUrl(store, selectedQuery(itemId, choiceId)); setCaptureTarget(itemId);
  storeView(store).webContents.loadURL(url).catch(() => {}); return true;
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
    if (result.candidates.length || result.accessBlocked || /marked unavailable/.test(result.reason)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  return result;
}
function sendRefresh() { if (main && !main.isDestroyed()) main.webContents.send('price-refresh-status', refreshState); }
function refreshWindow(store) {
  if (refreshWindows.has(store)) return refreshWindows.get(store);
  const window = new BrowserWindow({ show: false, width: 1200, height: 860, webPreferences: { partition: `persist:store-${store}`, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-redirect']) window.webContents.on(event, (e, url) => { if (!validStoreUrl(store, url)) e.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  refreshWindows.set(store, window); return window;
}
async function readRefreshProduct(store, url, mode = 'prices') {
  const wc = refreshWindow(store).webContents;
  let timer;
  try {
    await Promise.race([wc.loadURL(url, { extraHeaders: 'Cache-Control: no-cache\nPragma: no-cache' }), new Promise((_, reject) => { timer = setTimeout(() => { if (!wc.isDestroyed()) wc.stop(); reject(Error('Product page took too long to load.')); }, 45000); })]);
  } finally { clearTimeout(timer); }
  const deadline = Date.now() + 12000;
  let result;
  do {
    if (refreshCanceled) throw Error('Canceled');
    if (wc.isDestroyed() || !validStoreUrl(store, wc.getURL())) throw Error('Product page is unavailable.');
    result = await wc.executeJavaScript(extractScript, false);
    if (!result || !validStoreUrl(store, result.url)) throw Error('Product page is unavailable.');
    if ((mode === 'thumbnails' ? result.thumbnail : result.candidates.length) || result.accessBlocked || /marked unavailable/.test(result.reason)) return result;
    await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  return result;
}
function cancelPriceRefresh() {
  refreshCanceled = true;
  for (const window of refreshWindows.values()) if (!window.isDestroyed()) window.webContents.stop();
}
async function runPriceRefresh(mode = 'prices') {
  const jobs = cart.items.filter(i => STORES.some(s => s.id === i.store)).flatMap(item => item.priceOptions.length ? item.priceOptions.map(option => ({ itemId: item.id, store: item.store, option: { ...option } })) : [{ itemId: item.id, store: item.store, option: null }]);
  const cache = new Map(), blockedStores = new Set(); refreshCanceled = false;
  refreshState = { running: true, mode, done: 0, total: jobs.length, changed: 0, failed: 0, skipped: 0, unchanged: 0, text: `Starting ${mode === 'thumbnails' ? 'thumbnail' : 'price'} refresh…` }; sendRefresh();
  try {
    if (mode === 'thumbnails' && main && !main.isDestroyed()) await main.webContents.session.clearCache();
    for (const job of jobs) {
      if (refreshCanceled) break;
      if (!job.option?.url) { refreshState.skipped++; refreshState.done++; sendRefresh(); continue; }
      refreshState.text = `Checking ${refreshState.done + 1} of ${jobs.length}: ${job.option.product}`; sendRefresh();
      const key = `${job.store}:${job.option.url}`;
      if (blockedStores.has(job.store)) cache.set(key, { error: 'This store blocked access during refresh. Open its tab to sign in or try again later.' });
      if (!cache.has(key)) {
        try {
          const result = await readRefreshProduct(job.store, job.option.url, mode);
          if (result.accessBlocked) { blockedStores.add(job.store); cache.set(key, { error: result.reason }); }
          else cache.set(key, { result });
        }
        catch { if (refreshCanceled) break; cache.set(key, { error: 'Could not load or read this product page. Try again or sign in to the store.' }); }
      }
      if (refreshCanceled) break;
      const response = cache.get(key); let outcome;
      await persist(snapshot => { outcome = (mode === 'thumbnails' ? applyThumbnailRefresh : applyPriceRefresh)(snapshot, job.itemId, job.option, response.result, response.error); });
      refreshState[outcome]++; refreshState.done++; sendRefresh();
    }
  } catch { refreshState.failed++; refreshState.text = 'Refresh stopped because changes could not be saved. Existing saved data is retained.'; }
  finally {
    for (const window of refreshWindows.values()) if (!window.isDestroyed()) window.destroy();
    refreshWindows.clear(); refreshState.running = false;
    if (!refreshState.text.startsWith('Refresh stopped')) refreshState.text = `${refreshCanceled ? 'Canceled' : 'Finished'}: ${refreshState.done}/${refreshState.total} processed · ${refreshState.changed} ${mode === 'thumbnails' ? 'thumbnails' : 'prices'} updated · ${refreshState.unchanged} unchanged · ${refreshState.failed} could not be checked · ${refreshState.skipped} skipped (no link, edited or removed).`;
    sendRefresh();
  }
}
async function checkUpdate() {
  if (!app.isPackaged) { sendStatus('Updates are available in the installed Windows app.'); return; }
  if (updateBusy || readyUpdate) { sendStatus(readyUpdate ? 'Update downloaded — ready to restart.' : 'Checking or downloading an update…', readyUpdate); return; }
  updateBusy = true; sendStatus('Checking for updates…');
  try { await autoUpdater.checkForUpdates(); } catch { updateBusy = false; sendStatus('Could not check for updates. Your cart is still available; try again later.'); }
}
app.whenReady().then(async () => {
  let loadError = false;
  try {
    const raw = JSON.parse(await fs.readFile(cartPath(), 'utf8'));
    cart = migrateCart(raw);
    if (raw.schema !== cart.schema) { await fs.copyFile(cartPath(), cartPath() + '.before-store-carts-' + Date.now()); await persist(cart); }
  }
  catch (error) {
    cart = starterCart();
    if (error.code !== 'ENOENT') { loadError = true; await fs.copyFile(cartPath(), cartPath() + '.backup-' + Date.now()).catch(() => {}); }
  }
  main = new BrowserWindow({ width: 1360, height: 930, minWidth: 980, minHeight: 700, backgroundColor: '#f4f5ef', title: 'Grocery Tracker', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  main.on('closed', () => { cancelPriceRefresh(); for (const window of refreshWindows.values()) if (!window.isDestroyed()) window.destroy(); if (storeShell && !storeShell.isDestroyed()) storeShell.close(); });
  Menu.setApplicationMenu(null);
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  handle('load', () => ({ cart, version: app.getVersion(), loadError, refreshState }));
  handle('refresh-thumbnails', () => { if (refreshState.running) return false; runPriceRefresh('thumbnails').catch(() => {}); return true; });
  handle('empty-carts', async () => {
    if (refreshState.running) throw Error('Wait for the refresh to finish or cancel it before emptying carts.');
    const result = await dialog.showMessageBox(main, { type: 'warning', buttons: ['Keep carts', 'Empty all carts'], defaultId: 0, cancelId: 0, title: 'Empty all carts?', message: 'Remove every item from all three store carts?', detail: 'Saved products, alternatives, quantities, prices and thumbnails will be removed. This cannot be undone.' });
    if (result.response !== 1) return false;
    await persist(snapshot => applyChange(snapshot, { type: 'empty-carts' })); return true;
  });
  handle('refresh-prices', () => { if (refreshState.running) return false; runPriceRefresh().catch(() => {}); return true; });
  handle('cancel-price-refresh', () => { cancelPriceRefresh(); return true; });
  handle('stores', () => STORES.map(({ id, name }) => ({ id, name })));
  handle('cart-view', (selectedStore, comparisons) => {
    if (selectedStore !== 'all' && !STORES.some(s => s.id === selectedStore)) throw Error('Choose a store cart or All carts.');
    return cartView(cart, STORES.map(s => s.id), selectedStore, comparisons);
  });
  handle('change', change => persist(snapshot => applyChange(snapshot, change)));
  handle('open-store', id => { const wc = storeView(id).webContents; if (!wc.getURL()) wc.loadURL(STORES.find(s => s.id === id).home).catch(() => {}); return true; });
  handle('search-stores', searchStores);
  handle('search-store', searchStore);
  handle('capture-target', setCaptureTarget);
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
