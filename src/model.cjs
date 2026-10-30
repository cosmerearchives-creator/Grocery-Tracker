const { randomUUID } = require('node:crypto');
const STORES = [
  { id: 'meijer', name: 'Meijer', home: 'https://www.meijer.com/', hosts: ['meijer.com'] },
  { id: 'aldi', name: 'ALDI', home: 'https://www.aldi.us/', hosts: ['aldi.us'] },
  { id: 'gfs', name: 'Gordon Food Service', home: 'https://gfsstore.com/', hosts: ['gfsstore.com', 'gfs.com'] }
];
const KNOWN_STORES = [...STORES, { id: 'walmart', name: 'Walmart', hosts: ['walmart.com'] }];
const optionKey = value => JSON.stringify([value.product, value.url || '', value.packs]);
function validStoreUrl(id, value) {
  const store = KNOWN_STORES.find(s => s.id === id);
  try { const u = new URL(value); return !!store && u.protocol === 'https:' && !u.username && !u.password && store.hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; }
}
function searchUrl(id, query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw Error('Enter an item name to search.');
  const destinations = { meijer: ['https://www.meijer.com/shopping/search.html', 'text'], aldi: ['https://www.aldi.us/store/aldi/s', 'k'], gfs: ['https://gfsstore.com/', 'ps'] };
  const config = destinations[id]; if (!config) throw Error('Unknown store.');
  const url = new URL(config[0]); url.searchParams.set(config[1], query.trim()); return url.href;
}
function starterCart() {
  return { schema: 3, items: [
    ['Kraft American Singles', 'Kraft', 'Compare package sizes', 'exact'], ['Red Bull Original', 'Red Bull', '16 fl oz can', 'exact'],
    ['Vitamin D whole milk', '', '1 gallon', 'equivalent'], ['Sharp cheddar shredded cheese', '', 'Choose bag size', 'equivalent']
  ].map(([name, brand, size, match], i) => ({ id: 'starter-' + i, originId: 'starter-' + i, store: 'meijer', name, brand, size, match, quantity: 0, offers: {}, priceOptions: [], available: true })) };
}
function syncPrimary(item) {
  const main = item.priceOptions.find(o => !o.isAlternative);
  item.offers = main ? { [item.store]: { ...main } } : {};
  if (main) item.quantity = main.quantity;
}
function migrateCart(value) {
  if (value?.schema === 3) return validateCart(value);
  if (![1, 2].includes(value?.schema) || !Array.isArray(value.items)) throw Error('Invalid cart file.');
  const old = JSON.parse(JSON.stringify(value));
  if (old.schema === 1) {
    const items = [];
    for (const item of old.items) {
      const stores = Object.keys(item.offers || {});
      for (const [index, store] of (stores.length ? stores : ['meijer']).entries()) items.push({ ...item, id: index ? `${item.id}-${store}` : item.id, originId: item.id, store, offers: item.offers?.[store] ? { [store]: { ...item.offers[store], needsReview: false } } : {}, priceOptions: [] });
    }
    old.items = items;
  }
  for (const item of old.items) {
    const main = item.offers?.[item.store];
    const options = item.priceOptions || [];
    if (main && !options.some(o => optionKey(o) === optionKey(main))) options.push({ ...main });
    item.priceOptions = options.map(o => ({ ...o, ...(main && optionKey(o) === optionKey(main) ? main : {}), quantity: main && optionKey(o) === optionKey(main) ? item.quantity : 0, isAlternative: !main || optionKey(o) !== optionKey(main) }));
    item.available = true; syncPrimary(item);
  }
  old.schema = 3; return validateCart(old);
}
function validateOffer(store, offer) {
  if (!offer || !Number.isInteger(offer.cents) || offer.cents <= 0 || offer.cents > 10000000 || !Number.isInteger(offer.packs) || offer.packs < 1 || offer.packs > 999 || typeof offer.product !== 'string' || !offer.product.trim() || offer.product.length > 600 || typeof offer.checked !== 'string' || !['manual', 'web-estimate', 'shelf'].includes(offer.source) || (offer.needsReview !== undefined && typeof offer.needsReview !== 'boolean')) throw Error('Invalid price.');
  if (offer.url && !validStoreUrl(store, offer.url)) throw Error('Invalid store product link.');
}
function validateSearchDetails(item) {
  const validCode = code => typeof code === 'string' && /^(?:\d{8}|\d{12,14})$/.test(code);
  if (item.upc && !validCode(item.upc)) throw Error('Use an 8, 12, 13 or 14 digit barcode, including leading zeros.');
  if (item.alternatives !== undefined) {
    if (!Array.isArray(item.alternatives) || item.alternatives.length > 20) throw Error('Use up to 20 alternatives per item.');
    for (const a of item.alternatives) if (!a || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200 || (a.upc && !validCode(a.upc))) throw Error('Each alternative needs a name and an optional 8, 12, 13 or 14 digit barcode.');
  }
}
function validateCart(cart) {
  if (!cart || cart.schema !== 3 || !Array.isArray(cart.items) || cart.items.length > 2000) throw Error('Invalid cart file.');
  const seen = new Set();
  for (const item of cart.items) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id) || typeof item.originId !== 'string' || !KNOWN_STORES.some(s => s.id === item.store) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || !Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 999 || !['exact', 'equivalent'].includes(item.match) || typeof item.available !== 'boolean') throw Error('Invalid cart item.');
    seen.add(item.id); validateSearchDetails(item);
    for (const key of ['brand', 'size']) if (typeof item[key] !== 'string' || item[key].length > 200) throw Error('Invalid product details.');
    if (!Array.isArray(item.priceOptions) || item.priceOptions.length > 50) throw Error('Use up to 50 saved options per store item.');
    const keys = new Set(); let mains = 0;
    for (const quote of item.priceOptions) {
      validateOffer(item.store, quote);
      if (!Number.isInteger(quote.quantity) || quote.quantity < 0 || quote.quantity > 999 || typeof quote.isAlternative !== 'boolean' || keys.has(optionKey(quote))) throw Error('Invalid product selection.');
      keys.add(optionKey(quote)); if (!quote.isAlternative) mains++;
    }
    if (mains > 1 || !item.offers || typeof item.offers !== 'object' || Array.isArray(item.offers)) throw Error('Invalid main product.');
    for (const [store, offer] of Object.entries(item.offers)) { if (store !== item.store) throw Error('Invalid price store.'); validateOffer(store, offer); }
    const primary = item.priceOptions.find(o => !o.isAlternative);
    if (primary && JSON.stringify(primary) !== JSON.stringify(item.offers[item.store])) throw Error('Main product is inconsistent.');
    if (!primary && Object.keys(item.offers).length) throw Error('Missing main product selection.');
  }
  return cart;
}
function searchChoices(item) {
  const choices = [];
  for (const [index, product] of [{ name: item.name, upc: item.upc }, ...(item.alternatives || [])].entries()) {
    choices.push({ id: `name-${index}`, query: product.name, label: index ? `Alternative: ${product.name}` : product.name });
    if (product.upc) choices.push({ id: `upc-${index}`, query: product.upc, label: `UPC: ${product.upc} · ${product.name}` });
  }
  return choices;
}
function rememberOffer(item, offer, asAlternative = false) {
  const options = item.priceOptions;
  const existing = options.find(o => optionKey(o) === optionKey(offer));
  if (existing) {
    if (asAlternative && !existing.isAlternative) return;
    Object.assign(existing, offer);
    if (!asAlternative && existing.isAlternative) {
      const previous = options.find(o => !o.isAlternative);
      if (previous) { previous.isAlternative = true; previous.quantity = 0; }
      existing.isAlternative = false; existing.quantity = Math.max(1, existing.quantity);
    }
    if (!asAlternative) existing.quantity = Math.max(1, existing.quantity);
    syncPrimary(item); return;
  }
  const previousMain = options.find(o => !o.isAlternative);
  const quantity = asAlternative ? 0 : Math.max(1, previousMain?.quantity || item.quantity || 0);
  if (!asAlternative && previousMain) { previousMain.isAlternative = true; previousMain.quantity = 0; }
  options.push({ ...offer, quantity, isAlternative: asAlternative });
  syncPrimary(item);
}
function ensureStoreItem(cart, source, store) {
  if (!STORES.some(s => s.id === store)) throw Error('Choose an active store.');
  let target = source.store === store ? source : cart.items.find(i => i.store === store && i.originId === source.originId);
  if (!target) { target = { ...source, id: randomUUID(), store, quantity: 0, offers: {}, priceOptions: [], available: true }; cart.items.push(target); }
  return target;
}
function summarize(cart, store) {
  let cents = 0, matched = 0, reviews = 0, count = 0, unavailable = 0;
  for (const item of cart.items.filter(i => i.store === store)) {
    if (!item.available) { unavailable++; continue; }
    const selected = item.priceOptions.filter(o => o.quantity > 0);
    reviews += item.priceOptions.filter(o => o.needsReview).length;
    for (const quote of selected) { cents += quote.cents * quote.packs * quote.quantity; count++; matched++; }
    if (!item.offers[store] && item.quantity > 0) count++;
  }
  return { cents, matched, reviews, count, unavailable, missing: count - matched, complete: count > 0 && count === matched && unavailable === 0 };
}
function money(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }
function checklist(cart, store) {
  const s = STORES.find(s => s.id === store); if (!s) throw Error('Choose a store.');
  const total = summarize(cart, store), lines = [];
  for (const item of cart.items.filter(i => i.store === store)) {
    if (!item.available) { lines.push(`NOT AVAILABLE AT THIS STORE: ${item.name}`); continue; }
    for (const quote of item.priceOptions.filter(o => o.quantity > 0)) lines.push(`☐ ${quote.quantity} × ${quote.product} | ${item.name} | ${quote.packs} package(s) per quantity | ${money(quote.cents * quote.packs * quote.quantity)} (${quote.source})${quote.refreshError ? ' — PRICE NOT REFRESHED' : ''}${quote.needsReview ? ' — NEEDS REVIEW' : ''}`);
    if (!item.offers[store] && item.quantity > 0) lines.push(`☐ ${item.quantity} × ${item.name}${item.size ? ' — ' + item.size : ''} | PRICE MISSING`);
  }
  return [`GROCERY TRACKER — ${s.name}`, 'Marion, Ohio', '', ...lines, '', `${total.complete ? 'Estimated subtotal' : 'Known subtotal (incomplete)'}: ${money(total.cents)}`, `${total.missing} selection(s) without a price. ${total.unavailable} item(s) not available at this store.`, 'Quantity-zero options are saved only and excluded. Taxes and conditional coupons excluded.'].join('\n');
}
function applyChange(cart, change) {
  const item = cart.items.find(i => i.id === change.id);
  if (change.type === 'add') {
    const id = randomUUID(); if (!STORES.some(s => s.id === change.store)) throw Error('Choose an active store.');
    cart.items.push({ id, originId: id, store: change.store, name: String(change.name || '').trim(), brand: '', size: String(change.size || '').trim(), upc: change.upc || '', alternatives: change.alternatives || [], match: change.match || 'equivalent', quantity: 0, offers: {}, priceOptions: [], available: true });
  } else {
    if (!item) throw Error('This item is no longer in your cart.');
    if (change.type === 'remove') cart.items = cart.items.filter(i => i.id !== item.id);
    else if (change.type === 'quantity') {
      const target = item.priceOptions.find(o => !o.isAlternative) || item;
      target.quantity = change.delta !== undefined ? target.quantity + change.delta : change.quantity; syncPrimary(item);
    } else if (change.type === 'option-quantity') {
      const option = item.priceOptions[change.index]; if (!option) throw Error('Choose a saved product option.');
      if (!item.available) throw Error('Clear Not available before selecting quantities.');
      option.quantity = change.delta !== undefined ? option.quantity + change.delta : change.quantity; syncPrimary(item);
    } else if (change.type === 'availability') ensureStoreItem(cart, item, change.store || item.store).available = change.available;
    else if (change.type === 'details') { item.size = change.size; item.match = change.match; item.offers = {}; item.priceOptions = []; item.quantity = 0; }
    else if (change.type === 'search-details') { item.upc = change.upc || ''; item.alternatives = change.alternatives || []; }
    else if (change.type === 'ensure-store') ensureStoreItem(cart, item, change.store);
    else if (change.type === 'offer') {
      const target = ensureStoreItem(cart, item, change.store || item.store); target.available = true;
      if (change.index !== undefined) {
        const option = target.priceOptions[change.index]; if (!option) throw Error('This price is no longer saved.');
        Object.assign(option, change.offer, { needsReview: false }); syncPrimary(target);
      } else rememberOffer(target, { ...change.offer, needsReview: false }, !!change.asAlternative);
    } else if (change.type === 'remove-offer') {
      const index = change.index ?? item.priceOptions.findIndex(o => !o.isAlternative);
      if (index < 0 || index >= item.priceOptions.length) throw Error('This price is no longer saved.');
      item.priceOptions.splice(index, 1); item.quantity = 0; syncPrimary(item);
    } else if (change.type === 'review') {
      const option = change.index !== undefined ? item.priceOptions[change.index] : item.priceOptions.find(o => !o.isAlternative);
      if (option) option.needsReview = false; syncPrimary(item);
    } else throw Error('Unknown cart change.');
  }
  return validateCart(cart);
}
function applyDetected(cart, itemId, store, result, asAlternative = false) {
  const source = cart.items.find(i => i.id === itemId); if (!source) throw Error('That item was removed from your cart.');
  if (!STORES.some(s => s.id === store) || !validStoreUrl(store, result.url) || result.candidates.length !== 1) throw Error('No single store price was detected.');
  const product = result.candidates[0]; if (/OutOfStock|Discontinued|SoldOut/i.test(product.availability)) throw Error('This product is unavailable.');
  const target = ensureStoreItem(cart, source, store);
  if (!asAlternative) target.available = true;
  rememberOffer(target, { cents: product.cents, packs: 1, product: product.product, source: 'web-estimate', url: result.url, checked: new Date().toISOString(), needsReview: true }, asAlternative);
  validateCart(cart); return target.id;
}
function applyPriceRefresh(cart, itemId, previous, result, error, checked = new Date().toISOString()) {
  const item = cart.items.find(i => i.id === itemId);
  const option = item?.priceOptions.find(o => optionKey(o) === optionKey(previous));
  if (!option) return 'skipped';
  if (option.cents !== previous.cents || option.checked !== previous.checked || option.source !== previous.source) return 'skipped';
  option.lastRefreshAttempt = checked;
  if (error || result?.candidates?.length !== 1) {
    option.refreshError = String(error || result?.reason || 'No readable price was found.').slice(0, 300);
    option.needsReview = true; syncPrimary(item); validateCart(cart); return 'failed';
  }
  if (!validStoreUrl(item.store, result.url)) throw Error('Invalid refreshed store link.');
  const detected = result.candidates[0];
  validateOffer(item.store, { ...option, cents: detected.cents });
  const identity = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (detected.product && identity(option.product) !== identity(detected.product)) {
    option.refreshDetectedProduct = String(detected.product).slice(0, 600);
    option.refreshError = 'This link now describes a different product or version. Review the page before changing its saved price.';
    option.needsReview = true; syncPrimary(item); validateCart(cart); return 'failed';
  }
  if (/OutOfStock|Discontinued|SoldOut/i.test(detected.availability)) {
    option.refreshError = 'This product is currently marked unavailable on the store page.';
    option.needsReview = true; syncPrimary(item); validateCart(cart); return 'failed';
  }
  const changed = option.cents !== detected.cents;
  option.cents = detected.cents; option.checked = checked; option.refreshDetectedProduct = String(detected.product || '').slice(0, 600);
  delete option.refreshError;
  if (changed || (detected.product && option.product.toLowerCase() !== detected.product.toLowerCase())) option.needsReview = true;
  syncPrimary(item); validateCart(cart); return changed ? 'changed' : 'unchanged';
}
module.exports = { STORES, validStoreUrl, searchUrl, starterCart, migrateCart, validateCart, summarize, money, checklist, applyChange, applyDetected, searchChoices, applyPriceRefresh };
