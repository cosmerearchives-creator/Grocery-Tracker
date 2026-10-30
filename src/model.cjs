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
function starterCart() {
  return { schema: 1, items: [
    ['Kraft American Singles', 'Kraft', 'Compare package sizes', 'exact'],
    ['Red Bull Original', 'Red Bull', '16 fl oz can', 'exact'],
    ['Vitamin D whole milk', '', '1 gallon', 'equivalent'],
    ['Sharp cheddar shredded cheese', '', 'Choose bag size', 'equivalent']
  ].map(([name, brand, size, match], i) => ({ id: 'starter-' + i, name, brand, size, match, quantity: 1, offers: {} })) };
}
function validateCart(cart) {
  if (!cart || cart.schema !== 1 || !Array.isArray(cart.items) || cart.items.length > 500) throw Error('Invalid cart file.');
  const seen = new Set();
  for (const item of cart.items) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || !['exact', 'equivalent'].includes(item.match)) throw Error('Invalid cart item.');
    seen.add(item.id);
    for (const key of ['brand', 'size']) if (typeof item[key] !== 'string' || item[key].length > 200) throw Error('Invalid product details.');
    if (!item.offers || typeof item.offers !== 'object' || Array.isArray(item.offers)) throw Error('Invalid price details.');
    for (const [store, offer] of Object.entries(item.offers)) {
      if (!STORES.some(s => s.id === store) || !offer || !Number.isInteger(offer.cents) || offer.cents <= 0 || offer.cents > 10000000 || !Number.isInteger(offer.packs) || offer.packs < 1 || offer.packs > 999 || typeof offer.product !== 'string' || typeof offer.checked !== 'string' || !['manual', 'web-estimate', 'shelf'].includes(offer.source)) throw Error('Invalid price.');
      if (offer.url && !validStoreUrl(store, offer.url)) throw Error('Invalid store product link.');
    }
  }
  return cart;
}
function summarize(cart, store) {
  let cents = 0, matched = 0;
  for (const item of cart.items) { const o = item.offers[store]; if (o) { cents += o.cents * o.packs * item.quantity; matched++; } }
  return { cents, matched, missing: cart.items.length - matched, complete: cart.items.length > 0 && matched === cart.items.length };
}
function money(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }
function checklist(cart, store) {
  const s = STORES.find(s => s.id === store); if (!s) throw Error('Choose a store.');
  const total = summarize(cart, store);
  return [`GROCERY TRACKER — ${s.name}`, 'Marion, Ohio', '', ...cart.items.map(i => {
    const o = i.offers[store];
    return `☐ ${i.quantity} × ${i.name}${i.size ? ' — ' + i.size : ''}${o ? ` | ${o.product} | ${o.packs} package(s) per quantity | ${money(o.cents * o.packs * i.quantity)} (${o.source})` : ' | PRICE MISSING'}`;
  }), '', `${total.complete ? 'Estimated subtotal' : 'Known subtotal (incomplete)'}: ${money(total.cents)}`, `${total.missing} item(s) without a price. Taxes and conditional coupons excluded.`, 'Check products, sizes, store location and prices before shopping.'].join('\n');
}
module.exports = { STORES, validStoreUrl, starterCart, validateCart, summarize, money, checklist };
