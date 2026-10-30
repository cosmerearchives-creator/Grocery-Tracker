const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { STORES, validStoreUrl, starterCart, validateCart, checklist } = require('./model.cjs');
let main, cart, readyUpdate = false, updateBusy = false;
let writeQueue = Promise.resolve();
const windows = new Map();
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
function storeWindow(id) {
  const store = STORES.find(s => s.id === id); if (!store) throw Error('Unknown store.');
  if (windows.has(id) && !windows.get(id).isDestroyed()) { const w = windows.get(id); w.show(); w.focus(); return w; }
  const w = new BrowserWindow({ width: 1140, height: 820, title: `${store.name} — Select Marion, Ohio`, webPreferences: { partition: `persist:store-${id}`, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  // Store content has no preload and no access to the local app API.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (validStoreUrl(id, url)) w.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (event, url) => { if (!validStoreUrl(id, url)) event.preventDefault(); });
  w.webContents.on('will-redirect', (event, url) => { if (!validStoreUrl(id, url)) event.preventDefault(); });
  w.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  w.webContents.session.setPermissionCheckHandler(() => false);
  w.on('closed', () => windows.delete(id)); windows.set(id, w);
  w.loadURL(store.home).catch(() => {});
  return w;
}
// Reads product metadata only, never forms, passwords, cookies, or page storage.
const extractScript = `(() => {
  const products = [];
  const visit = (v, depth = 0) => {
    if (!v || typeof v !== 'object' || depth > 12 || products.length > 30) return;
    if (Array.isArray(v)) { v.slice(0, 100).forEach(x => visit(x, depth + 1)); return; }
    if ([].concat(v['@type'] || []).includes('Product')) products.push(v);
    for (const [key, val] of Object.entries(v)) if (key !== 'offers') visit(val, depth + 1);
  };
  for (const s of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 30)) {
    if (s.textContent.length > 2000000) continue;
    try { visit(JSON.parse(s.textContent)); } catch {}
  }
  const results = [];
  for (const p of products) for (const o of [].concat(p.offers || [])) {
    if (!o || !['USD', 'usd'].includes(o.priceCurrency)) continue;
    const price = Number(o.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000) continue;
    results.push({ product: String(p.name || document.title).slice(0, 300), cents: Math.round(price * 100), availability: String(o.availability || '').slice(0, 120) });
  }
  return { url: location.href, candidates: results.slice(0, 12) };
})()`;
async function capture(id, url) {
  if (!validStoreUrl(id, url)) throw Error('Use an HTTPS product link on this store’s own website.');
  const w = storeWindow(id);
  await w.loadURL(url);
  // Give dynamic storefronts time to populate product metadata.
  await new Promise(resolve => setTimeout(resolve, 1800));
  if (w.isDestroyed() || !validStoreUrl(id, w.webContents.getURL())) throw Error('Store page is unavailable.');
  const result = await w.webContents.executeJavaScript(extractScript, false);
  if (!result || !validStoreUrl(id, result.url)) throw Error('Could not read this product page.');
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
  Menu.setApplicationMenu(null);
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  handle('load', () => ({ cart, version: app.getVersion(), loadError }));
  handle('stores', () => STORES.map(({ id, name }) => ({ id, name })));
  handle('save', persist);
  handle('open-store', id => { storeWindow(id); return true; });
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
