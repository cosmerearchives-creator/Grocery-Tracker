const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { normalizeGtin } = require('../src/barcode.cjs');
const { extractDetails } = require('../src/lookup.cjs');
const { sourceStore, createImported, applyImportedMatch } = require('../src/import-product.cjs');
const { applyChange, summarize, validateCart } = require('../src/model.cjs');
const upc = '719283135469', url = 'https://www.meijer.com/shopping/product/cheese/71928313546';
const result = { url, details: { name: 'Sharp cheese, 8 oz', size: '8 oz', upc }, candidates: [{ product: 'Sharp cheese, 8 oz', cents: 200 }] };
function details({ codes = [], label = '', image = '', pathname = '/shopping/product/cheese/71928313546' } = {}) {
  const title = 'Sharp cheese, 8 oz';
  const node = textContent => ({ textContent, children: [], getClientRects: () => [{}], getAttribute: () => null });
  const context = { URL, location: { href: 'https://www.meijer.com' + pathname }, getComputedStyle: () => ({ visibility: 'visible' }), document: { querySelectorAll: selector => selector === 'h1' ? [node(title)] : selector.startsWith('script') ? [node(JSON.stringify(codes.map(code => ({ '@type': 'Product', name: title, gtin12: code }))))] : label ? [node(label)] : [] } };
  return vm.runInNewContext(`(${extractDetails.toString()})({candidates:[],thumbnail:${JSON.stringify(image)}},(${normalizeGtin.toString()}))`, context).details;
}
test('barcode matching validates check digits and normalizes only leading zeros', () => {
  assert.equal(normalizeGtin(upc), normalizeGtin('0' + upc));
  assert.equal(normalizeGtin('71928313546'), ''); assert.equal(normalizeGtin('719283135460'), '');
  assert.notEqual(normalizeGtin(upc), normalizeGtin('021000615261'));
});
test('Meijer shortened UPC is completed only when the primary image confirms the full barcode', () => {
  const found = details({ label: 'UPC: #71928313546', image: 'https://www.meijer.com/content/dam/0719283135469_1.jpg' });
  assert.equal(found.upc, '71928313546'); assert.equal(found.verifiedGtin, upc); assert.equal(found.retailerUpc, '71928313546'); assert.equal(found.size, '8 oz');
  assert.equal(details({ label: 'UPC: #71928313546' }).upc, '71928313546'); assert.equal(details({ label: 'UPC: #71928313546' }).verifiedGtin, '');
  assert.equal(details({ codes: [upc, '021000615261'] }).upc, '');
  assert.equal(details({ codes: [upc, '0' + upc] }).upc, upc);
  assert.equal(details({ codes: [upc], pathname: '/shopping/search.html' }).productPage, false);
});
test('link imports create one reusable entry with no cart selection even without price or barcode', () => {
  const cart = { schema: 3, items: [] };
  const created = createImported(cart, 'meijer', url, { url, candidates: [], details: { name: 'Cheese', size: '8 oz' } }, 'Dairy');
  assert.equal(cart.items.length, 1); assert.ok(cart.items.every(i => i.originId === created.originId && i.quantity === 0 && i.category === 'Dairy'));
  assert.ok(cart.items.every(i => !i.priceOptions.length && i.importNote));
  assert.equal(cart.items[0].pendingUrl, url); assert.equal(summarize(cart, 'meijer').missing, 0);
  validateCart(cart);
});
test('only a confirmed same-UPC product can fill an unpriced imported store entry', () => {
  const cart = { schema: 3, items: [] }, created = createImported(cart, 'meijer', url, result);
  const matched = { ...result, url: 'https://www.aldi.us/product/cheese', details: { ...result.details, upc: '0' + upc } };
  assert.equal(applyImportedMatch(cart, created.originId, 'aldi', matched), true);
  assert.equal(cart.items[1].priceOptions[0].cents, 200); assert.equal(cart.items[1].priceOptions[0].needsReview, true);
  assert.equal(applyImportedMatch(cart, created.originId, 'aldi', matched), false);
  assert.throws(() => applyImportedMatch(cart, created.originId, 'gfs', { ...result, url: 'https://gfsstore.com/products/123/', details: { upc: '021000615261' } }), /same UPC/);
  assert.equal(cart.items.some(i => i.store === 'gfs'), false);
});
test('manual selection changes during matching are preserved, and unsupported links are rejected', () => {
  const cart = { schema: 3, items: [] }, created = createImported(cart, 'meijer', url, result);
  applyChange(cart, { type: 'ensure-store', id: created.id, store: 'aldi' });
  applyChange(cart, { type: 'quantity', id: cart.items[1].id, quantity: 2 });
  assert.equal(applyImportedMatch(cart, created.originId, 'aldi', { ...result, url: 'https://www.aldi.us/product/cheese' }), false);
  assert.equal(cart.items[1].quantity, 2);
  assert.equal(sourceStore(url), 'meijer');
  for (const link of ['https://evil.example/product/foo', 'https://www.meijer.com/', 'https://www.meijer.com/shopping/search.html?text=cheese']) assert.throws(() => sourceStore(link));
});
