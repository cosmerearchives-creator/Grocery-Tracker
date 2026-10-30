const STORES = [
  { id: 'meijer', name: 'Meijer', home: 'https://www.meijer.com/', hosts: ['meijer.com'] },
  { id: 'aldi', name: 'ALDI', home: 'https://www.aldi.us/', hosts: ['aldi.us'] },
  { id: 'gfs', name: 'Gordon Food Service', home: 'https://gfsstore.com/', hosts: ['gfsstore.com', 'gfs.com'] }
];
// Inactive data remains readable for upgrades; it is excluded from active UI,
// searches and exports. Never discard a user's previously saved Walmart rows.
const KNOWN_STORES = [...STORES, { id: 'walmart', name: 'Walmart', hosts: ['walmart.com'] }];
function validStoreUrl(id, value) {
  const store = KNOWN_STORES.find(s => s.id === id);
  try { const u = new URL(value); return !!store && u.protocol === 'https:' && !u.username && !u.password && store.hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; }
}
function searchUrl(id, query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw Error('Enter an item name to search.');
  const destinations = {
    meijer: ['https://www.meijer.com/shopping/search.html', 'text'],
    aldi: ['https://www.aldi.us/store/aldi/search', 'search_term'],
    gfs: ['https://gfsstore.com/', 'ps']
  };
  const config = destinations[id]; if (!config) throw Error('Unknown store.');
  const url = new URL(config[0]); url.searchParams.set(config[1], query.trim()); return url.href;
}
function starterCart() {
  return { schema: 2, items: [
    ['Kraft American Singles', 'Kraft', 'Compare package sizes', 'exact'],
    ['Red Bull Original', 'Red Bull', '16 fl oz can', 'exact'],
    ['Vitamin D whole milk', '', '1 gallon', 'equivalent'],
    ['Sharp cheddar shredded cheese', '', 'Choose bag size', 'equivalent']
  ].map(([name, brand, size, match], i) => ({ id: 'starter-' + i, originId: 'starter-' + i, store: 'meijer', name, brand, size, match, quantity: 1, offers: {} })) };
}
function migrateCart(value) {
  if (value?.schema === 2) return validateCart(value);
  if (value?.schema !== 1 || !Array.isArray(value.items)) throw Error('Invalid cart file.');
  const items = [];
  for (const item of value.items) {
    const stores = Object.keys(item.offers || {});
    for (const [index, store] of (stores.length ? stores : ['meijer']).entries()) {
      items.push({ ...item, id: index ? `${item.id}-${store}` : item.id, originId: item.id, store, offers: item.offers?.[store] ? { [store]: { ...item.offers[store], needsReview: false } } : {} });
    }
  }
  return validateCart({ schema: 2, items });
}
function validateCart(cart) {
  if (!cart || cart.schema !== 2 || !Array.isArray(cart.items) || cart.items.length > 2000) throw Error('Invalid cart file.');
  const seen = new Set();
  for (const item of cart.items) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || !['exact', 'equivalent'].includes(item.match)) throw Error('Invalid cart item.');
    seen.add(item.id);
    if (!KNOWN_STORES.some(s => s.id === item.store) || typeof item.originId !== 'string') throw Error('Invalid item store.');
    validateSearchDetails(item);
    for (const key of ['brand', 'size']) if (typeof item[key] !== 'string' || item[key].length > 200) throw Error('Invalid product details.');
    if (!item.offers || typeof item.offers !== 'object' || Array.isArray(item.offers)) throw Error('Invalid price details.');
    for (const [store, offer] of Object.entries(item.offers)) {
      if (store !== item.store || !offer || !Number.isInteger(offer.cents) || offer.cents <= 0 || offer.cents > 10000000 || !Number.isInteger(offer.packs) || offer.packs < 1 || offer.packs > 999 || typeof offer.product !== 'string' || typeof offer.checked !== 'string' || !['manual', 'web-estimate', 'shelf'].includes(offer.source) || (offer.needsReview !== undefined && typeof offer.needsReview !== 'boolean')) throw Error('Invalid price.');
      if (offer.url && !validStoreUrl(store, offer.url)) throw Error('Invalid store product link.');
    }
    for (const quote of item.priceOptions || []) validateOffer(item.store, quote);
  }
  return cart;
}
function validateOffer(store, offer) {
  validateCart({ schema: 2, items: [{ id: 'check', originId: 'check', store, name: 'check', brand: '', size: '', match: 'exact', quantity: 1, offers: { [store]: offer } }] });
}
function validateSearchDetails(item) {
  if (item.upc && (typeof item.upc !== 'string' || !/^(?:\d{8}|\d{12,14})$/.test(item.upc))) throw Error('Use an 8, 12, 13 or 14 digit barcode, including leading zeros.');
  if (item.alternatives !== undefined) {
    if (!Array.isArray(item.alternatives) || item.alternatives.length > 20) throw Error('Use up to 20 alternatives per item.');
    for (const alternative of item.alternatives) {
      if (!alternative || typeof alternative.name !== 'string' || !alternative.name.trim() || alternative.name.length > 200) throw Error('Each alternative needs a product name.');
      if (alternative.upc && (typeof alternative.upc !== 'string' || !/^(?:\d{8}|\d{12,14})$/.test(alternative.upc))) throw Error('An alternative barcode must contain 8, 12, 13 or 14 digits.');
    }
  }
  if (item.priceOptions !== undefined && (!Array.isArray(item.priceOptions) || item.priceOptions.length > 50)) throw Error('Use up to 50 saved product options per store item.');
}
function searchChoices(item) {
  const choices = [];
  for (const [index, product] of [{ name: item.name, upc: item.upc }, ...(item.alternatives || [])].entries()) {
    choices.push({ id: `name-${index}`, query: product.name, label: index ? `Alternative: ${product.name}` : product.name });
    if (product.upc) choices.push({ id: `upc-${index}`, query: product.upc, label: `UPC: ${product.upc} · ${product.name}` });
  }
  return choices;
}
function rememberOffer(item, offer) {
  const key = value => JSON.stringify([value.product, value.url || '', value.packs]);
  const options = item.priceOptions || [];
  if (item.offers[item.store] && !options.some(o => key(o) === key(item.offers[item.store]))) options.push({ ...item.offers[item.store] });
  const index = options.findIndex(o => key(o) === key(offer));
  if (index >= 0) options[index] = { ...offer }; else options.push({ ...offer });
  item.priceOptions = options; item.offers[item.store] = { ...offer };
}
function ensureStoreItem(cart, source, store) {
  if (!STORES.some(s => s.id === store)) throw Error('Choose an active store.');
  let target = source.store === store ? source : cart.items.find(i => i.store === store && i.originId === source.originId);
  if (!target) { target = { ...source, id: require('node:crypto').randomUUID(), store, offers: {}, priceOptions: [] }; cart.items.push(target); }
  return target;
}
function summarize(cart, store) {
  let cents = 0, matched = 0, reviews = 0;
  const items = cart.items.filter(i => i.store === store);
  for (const item of items) { const o = item.offers[store]; if (o) { cents += o.cents * o.packs * item.quantity; matched++; if (o.needsReview) reviews++; } }
  return { cents, matched, reviews, count: items.length, missing: items.length - matched, complete: items.length > 0 && matched === items.length };
}
function money(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }
function checklist(cart, store) {
  const s = STORES.find(s => s.id === store); if (!s) throw Error('Choose a store.');
  const total = summarize(cart, store);
  return [`GROCERY TRACKER — ${s.name}`, 'Marion, Ohio', '', ...cart.items.filter(i => i.store === store).map(i => {
    const o = i.offers[store];
    return `☐ ${i.quantity} × ${i.name}${i.size ? ' — ' + i.size : ''}${i.upc ? ' | UPC ' + i.upc : ''}${o ? ` | SELECTED: ${o.product} | ${o.packs} package(s) per quantity | ${money(o.cents * o.packs * i.quantity)} (${o.source})${o.needsReview ? ' — NEEDS REVIEW' : ''}` : ' | PRICE MISSING'}${i.alternatives?.length ? ' | Acceptable alternatives: ' + i.alternatives.map(a => a.name).join('; ') : ''}`;
  }), '', `${total.complete ? 'Estimated subtotal' : 'Known subtotal (incomplete)'}: ${money(total.cents)}`, `${total.missing} item(s) without a price. Taxes and conditional coupons excluded.`, 'Check products, sizes, store location and prices before shopping.'].join('\n');
}
function applyChange(cart, change) {
  const item = cart.items.find(i => i.id === change.id);
  if (change.type === 'add') {
    const id = require('node:crypto').randomUUID();
    if (!STORES.some(s => s.id === change.store)) throw Error('Choose an active store.');
    cart.items.push({ id, originId: id, store: change.store, name: String(change.name || '').trim(), brand: '', size: String(change.size || '').trim(), upc: change.upc || '', alternatives: change.alternatives || [], match: change.match || 'equivalent', quantity: 1, offers: {} });
  } else {
    if (!item) throw Error('This item is no longer in your cart.');
    if (change.type === 'remove') cart.items = cart.items.filter(i => i.id !== item.id);
    else if (change.type === 'quantity') item.quantity = change.delta ? item.quantity + change.delta : change.quantity;
    else if (change.type === 'details') { item.size = change.size; item.match = change.match; item.offers = {}; item.priceOptions = []; }
    else if (change.type === 'search-details') { item.upc = change.upc || ''; item.alternatives = change.alternatives || []; }
    else if (change.type === 'ensure-store') ensureStoreItem(cart, item, change.store);
    else if (change.type === 'offer') rememberOffer(ensureStoreItem(cart, item, change.store || item.store), { ...change.offer, needsReview: false });
    else if (change.type === 'choose-option') { const option = item.priceOptions?.[change.index]; if (!option) throw Error('Choose a saved product option.'); item.offers[item.store] = { ...option }; }
    else if (change.type === 'remove-offer') {
      const selected = item.offers[item.store];
      item.priceOptions = (item.priceOptions || []).filter(o => !selected || o.product !== selected.product || o.url !== selected.url || o.packs !== selected.packs);
      if (item.priceOptions.length) item.offers[item.store] = { ...item.priceOptions[0] }; else delete item.offers[item.store];
    }
    else if (change.type === 'review') {
      const selected = item.offers[item.store];
      if (selected) { selected.needsReview = false; for (const option of item.priceOptions || []) if (option.product === selected.product && option.url === selected.url && option.packs === selected.packs) option.needsReview = false; }
    }
    else throw Error('Unknown cart change.');
  }
  return validateCart(cart);
}
function applyDetected(cart, itemId, store, result) {
  const source = cart.items.find(i => i.id === itemId);
  if (!source) throw Error('That item was removed from your cart.');
  if (!STORES.some(s => s.id === store) || !validStoreUrl(store, result.url) || result.candidates.length !== 1) throw Error('No single store price was detected.');
  const product = result.candidates[0];
  if (/OutOfStock|Discontinued|SoldOut/i.test(product.availability)) throw Error('This product is unavailable.');
  const target = ensureStoreItem(cart, source, store);
  rememberOffer(target, { cents: product.cents, packs: 1, product: product.product, source: 'web-estimate', url: result.url, checked: new Date().toISOString(), needsReview: true });
  validateCart(cart); return target.id;
}
module.exports = { STORES, validStoreUrl, searchUrl, starterCart, migrateCart, validateCart, summarize, money, checklist, applyChange, applyDetected, searchChoices };
