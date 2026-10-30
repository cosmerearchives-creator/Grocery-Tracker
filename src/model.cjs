const STORES = [
  { id: 'meijer', name: 'Meijer', home: 'https://www.meijer.com/', hosts: ['meijer.com'] },
  { id: 'aldi', name: 'ALDI', home: 'https://www.aldi.us/', hosts: ['aldi.us'] },
  { id: 'walmart', name: 'Walmart', home: 'https://www.walmart.com/', hosts: ['walmart.com'] },
  { id: 'gfs', name: 'Gordon Food Service', home: 'https://gfsstore.com/', hosts: ['gfsstore.com', 'gfs.com'] }
];
function validStoreUrl(id, value) {
  const store = STORES.find(s => s.id === id);
  try { const u = new URL(value); return !!store && u.protocol === 'https:' && !u.username && !u.password && store.hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; }
}
function searchUrl(id, query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 300) throw Error('Enter an item name to search.');
  const destinations = {
    meijer: ['https://www.meijer.com/shopping/search.html', 'text'],
    aldi: ['https://www.aldi.us/store/aldi/search', 'search_term'],
    walmart: ['https://www.walmart.com/search', 'q'],
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
    if (!STORES.some(s => s.id === item.store) || typeof item.originId !== 'string') throw Error('Invalid item store.');
    for (const key of ['brand', 'size']) if (typeof item[key] !== 'string' || item[key].length > 200) throw Error('Invalid product details.');
    if (!item.offers || typeof item.offers !== 'object' || Array.isArray(item.offers)) throw Error('Invalid price details.');
    for (const [store, offer] of Object.entries(item.offers)) {
      if (store !== item.store || !offer || !Number.isInteger(offer.cents) || offer.cents <= 0 || offer.cents > 10000000 || !Number.isInteger(offer.packs) || offer.packs < 1 || offer.packs > 999 || typeof offer.product !== 'string' || typeof offer.checked !== 'string' || !['manual', 'web-estimate', 'shelf'].includes(offer.source) || (offer.needsReview !== undefined && typeof offer.needsReview !== 'boolean')) throw Error('Invalid price.');
      if (offer.url && !validStoreUrl(store, offer.url)) throw Error('Invalid store product link.');
    }
  }
  return cart;
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
    return `☐ ${i.quantity} × ${i.name}${i.size ? ' — ' + i.size : ''}${o ? ` | ${o.product} | ${o.packs} package(s) per quantity | ${money(o.cents * o.packs * i.quantity)} (${o.source})${o.needsReview ? ' — NEEDS REVIEW' : ''}` : ' | PRICE MISSING'}`;
  }), '', `${total.complete ? 'Estimated subtotal' : 'Known subtotal (incomplete)'}: ${money(total.cents)}`, `${total.missing} item(s) without a price. Taxes and conditional coupons excluded.`, 'Check products, sizes, store location and prices before shopping.'].join('\n');
}
function applyChange(cart, change) {
  const item = cart.items.find(i => i.id === change.id);
  if (change.type === 'add') {
    const id = require('node:crypto').randomUUID();
    cart.items.push({ id, originId: id, store: change.store, name: String(change.name || '').trim(), brand: '', size: String(change.size || '').trim(), match: change.match || 'equivalent', quantity: 1, offers: {} });
  } else {
    if (!item) throw Error('This item is no longer in your cart.');
    if (change.type === 'remove') cart.items = cart.items.filter(i => i.id !== item.id);
    else if (change.type === 'quantity') item.quantity = change.delta ? item.quantity + change.delta : change.quantity;
    else if (change.type === 'details') { item.size = change.size; item.match = change.match; item.offers = {}; }
    else if (change.type === 'offer') item.offers[item.store] = { ...change.offer, needsReview: false };
    else if (change.type === 'remove-offer') delete item.offers[item.store];
    else if (change.type === 'review') { if (item.offers[item.store]) item.offers[item.store].needsReview = false; }
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
  let target = source.store === store ? source : cart.items.find(i => i.store === store && i.originId === source.originId);
  if (!target) { target = { ...source, id: require('node:crypto').randomUUID(), store, offers: {} }; cart.items.push(target); }
  target.offers[store] = { cents: product.cents, packs: 1, product: product.product, source: 'web-estimate', url: result.url, checked: new Date().toISOString(), needsReview: true };
  validateCart(cart); return target.id;
}
module.exports = { STORES, validStoreUrl, searchUrl, starterCart, migrateCart, validateCart, summarize, money, checklist, applyChange, applyDetected };
