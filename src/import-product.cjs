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
function suggestEntry(url, store, result) {
  const details = result?.details || {};
  const productName = details.name || result?.candidates?.[0]?.product || fallbackName(url, store);
  return { productName, name: generalName(productName, details.brand), requiredAmount: details.size || (/\bgallon\b/i.test(productName) ? '1 gallon' : '') };
}
function createImported(cart, store, url, result, category = '', options = {}) {
  const details = result?.details || {}, suggested = suggestEntry(url, store, result);
  const name = options.name === undefined ? suggested.name : String(options.name).trim();
  const upc = /^\d{8,14}$/.test(details.upc || '') ? details.upc : '';
  const verifiedGtin = normalizeGtin(details.verifiedGtin || details.upc) ? (details.verifiedGtin || details.upc).replace(/[\s-]/g, '') : '';
  applyChange(cart, { type: 'add', store, name, size: details.size || '', upc, category });
  const source = cart.items.at(-1);
  source.requiredAmount = String(options.requiredAmount ?? suggested.requiredAmount).trim();
  source.originalProductName = suggested.productName; source.listEntryNamed = true;
  if (verifiedGtin) source.verifiedGtin = verifiedGtin;
  if (details.retailerUpc) source.retailerUpc = String(details.retailerUpc).slice(0, 30);
  if (details.upcNote) source.barcodeNote = String(details.upcNote).slice(0, 250);
  source.pendingUrl = url;
  source.lookupNotes = Object.fromEntries(STORES.filter(s => s.id !== store).map(s => [s.id, verifiedGtin ? 'Waiting for an exact UPC match.' : 'No verified barcode found. Choose a product for this need.']));
  source.importNote = result?.reason || 'Product details need to be filled in.';
  if (result?.candidates?.length) {
    try { applyDetected(cart, source.id, store, result); for (const [index] of source.priceOptions.entries()) applyChange(cart, { type: 'option-quantity', id: source.id, index, quantity: 0 }); source.importNote = ''; }
    catch (error) { source.importNote = String(error.message).slice(0, 400); }
  }
  validateCart(cart);
  return { id: source.id, originId: source.originId, upc, verifiedGtin, name: source.name };
}
function applyImportedMatch(cart, originId, store, result) {
  const source = cart.items.find(i => i.originId === originId);
  if (!source) return false;
  const item = cart.items.find(i => i.originId === originId && i.store === store);
  if (item && (item.priceOptions.length || item.quantity !== 0 || !item.available)) return false;
  const wanted = normalizeGtin(source.verifiedGtin || source.upc);
  if (!wanted || normalizeGtin(result?.details?.verifiedGtin || result?.details?.upc) !== wanted || !validStoreUrl(store, result.url)) throw Error('The product page did not confirm the same UPC.');
  const id = applyDetected(cart, source.id, store, result), target = cart.items.find(i => i.id === id);
  for (const [index] of target.priceOptions.entries()) applyChange(cart, { type: 'option-quantity', id, index, quantity: 0 });
  target.pendingUrl = result.url; target.importNote = '';
  validateCart(cart); return true;
}
const { generalName } = require('./list-entry.cjs');
module.exports = { sourceStore, createImported, applyImportedMatch, suggestEntry };
