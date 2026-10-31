const { STORES, validStoreUrl, applyChange, applyDetected, validateCart } = require('./model.cjs');
const { normalizeGtin } = require('./barcode.cjs');
function sourceStore(url) {
  if (typeof url !== 'string' || url.length > 4000) throw Error('Use a product link of up to 4,000 characters.');
  const store = STORES.find(s => validStoreUrl(s.id, url));
  if (!store || !/\/(?:product|products|p)\//.test(new URL(url).pathname)) throw Error('Use a product link from Meijer, ALDI or Gordon Food Service.');
  return store.id;
}
function fallbackName(url, store) {
  const pieces = new URL(url).pathname.split('/').filter(Boolean);
  const slug = pieces.slice().reverse().find(p => !/^(?:\d+|product|products|p)$/i.test(p));
  return slug ? decodeURIComponent(slug).replace(/[-_]+/g, ' ').slice(0, 200) : `Product from ${STORES.find(s => s.id === store).name}`;
}
function createImported(cart, store, url, result, category = '') {
  const before = cart.items.length, details = result?.details || {};
  const name = details.name || result?.candidates?.[0]?.product || fallbackName(url, store);
  const upc = normalizeGtin(details.upc) ? details.upc.replace(/[\s-]/g, '') : '';
  applyChange(cart, { type: 'add-all', name: name.slice(0, 200), size: details.size || '', upc, category });
  const rows = cart.items.slice(before), source = rows.find(i => i.store === store);
  for (const item of rows) {
    item.quantity = 1;
    if (details.retailerUpc) item.retailerUpc = String(details.retailerUpc).slice(0, 30);
    if (details.upcNote) item.barcodeNote = String(details.upcNote).slice(0, 250);
    item.importNote = upc ? 'Waiting for an exact UPC match.' : 'No verified UPC found. Add this store’s product details manually.';
  }
  source.pendingUrl = url;
  source.importNote = result?.reason || 'Product details need to be filled in.';
  if (result?.candidates?.length) {
    try { applyDetected(cart, source.id, store, result); source.importNote = ''; }
    catch (error) { source.importNote = String(error.message).slice(0, 400); }
  }
  if (!source.priceOptions.length) source.importNote = 'Needs details: ' + source.importNote;
  validateCart(cart);
  return { id: source.id, originId: source.originId, upc, name: source.name };
}
function applyImportedMatch(cart, originId, store, result) {
  const item = cart.items.find(i => i.originId === originId && i.store === store);
  if (!item || item.priceOptions.length || item.quantity !== 1 || !item.available) return false;
  const wanted = normalizeGtin(item.upc);
  if (!wanted || normalizeGtin(result?.details?.upc) !== wanted || !validStoreUrl(store, result.url)) throw Error('The product page did not confirm the same UPC.');
  applyDetected(cart, item.id, store, result);
  item.pendingUrl = result.url; item.importNote = '';
  validateCart(cart); return true;
}
module.exports = { sourceStore, createImported, applyImportedMatch };
