const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { starterCart, applyChange, applyDetected, applyThumbnailRefresh, applyPriceRefresh, validateCart } = require('../src/model.cjs');
const { extractThumbnail } = require('../src/lookup.cjs');
const image = 'https://images.meijer.com/cheese.jpg';
const result = { url: 'https://www.meijer.com/shopping/product/cheese/123', thumbnail: image, candidates: [{ product: 'Cheese', cents: 279 }] };
function fixture() { const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result); return cart; }
test('add to all stores shares an origin but has independent quantities and alternatives', () => {
  const cart = { schema: 3, items: [] };
  applyChange(cart, { type: 'add-all', name: 'Cheese', upc: '012345678905', alternatives: [{ name: 'Other cheese' }] });
  assert.deepEqual(cart.items.map(i => i.store), ['meijer', 'aldi', 'gfs']);
  assert.equal(new Set(cart.items.map(i => i.originId)).size, 1);
  assert.equal(new Set(cart.items.map(i => i.id)).size, 3);
  applyChange(cart, { type: 'quantity', id: cart.items[0].id, quantity: 2 });
  cart.items[0].alternatives[0].name = 'Changed';
  assert.equal(cart.items[1].quantity, 0); assert.equal(cart.items[1].alternatives[0].name, 'Other cheese');
  applyChange(cart, { type: 'empty-carts' }); assert.equal(cart.items.length, 3); assert.ok(cart.items.every(i => i.quantity === 0));
});
test('capture and price refresh save thumbnails, while image refresh preserves price and quantity', () => {
  const cart = fixture(), item = cart.items[0], before = { ...item.priceOptions[0] };
  assert.equal(before.thumbnail, image);
  const next = { ...result, thumbnail: image + '?v=2' };
  assert.equal(applyThumbnailRefresh(cart, item.id, before, next), 'changed');
  assert.equal(item.priceOptions[0].cents, before.cents); assert.equal(item.priceOptions[0].quantity, before.quantity);
  assert.equal(item.priceOptions[0].checked, before.checked);
  assert.equal(applyPriceRefresh(cart, item.id, { ...item.priceOptions[0] }, { ...next, thumbnail: image + '?v=3' }), 'unchanged');
  assert.equal(item.priceOptions[0].thumbnail, image + '?v=3'); validateCart(cart);
});
test('failed, mismatched or concurrently edited images retain the saved thumbnail', () => {
  const cart = fixture(), item = cart.items[0], before = { ...item.priceOptions[0] };
  assert.equal(applyThumbnailRefresh(cart, item.id, before, null, 'Access denied'), 'failed');
  assert.equal(item.priceOptions[0].thumbnail, image);
  assert.equal(applyThumbnailRefresh(cart, item.id, before, { ...result, candidates: [{ product: 'Other cheese' }], thumbnail: image + '?wrong' }), 'failed');
  assert.equal(item.priceOptions[0].thumbnail, image);
  assert.equal(applyThumbnailRefresh(cart, item.id, { ...before, thumbnail: 'https://old.example/img' }, result), 'skipped');
});
function extract(products, meta = [], title = 'Cheese', pathname = '/shopping/product/cheese/123', gallery = []) {
  return vm.runInNewContext(`(${extractThumbnail.toString()})({candidates:[]})`, { URL, location: { href: 'https://www.meijer.com' + pathname }, document: { title, querySelectorAll: selector => selector === 'h1' ? [{ textContent: title, getClientRects: () => [{}] }] : selector.startsWith('button[aria-label') ? gallery.map(src => ({ currentSrc: src, getClientRects: () => [{}] })) : selector.startsWith('script') ? [{ textContent: JSON.stringify(products) }] : meta.map(content => ({ getAttribute: () => content })) } });
}
test('image extraction selects product metadata rather than recommendation images', () => {
  const product = (name, image) => ({ '@type': 'Product', name, image });
  assert.equal(extract([product('Other', 'https://img.example/other'), product('Cheese', [{ url: image }])]).thumbnail, image);
  assert.equal(extract([], [image]).thumbnail, image);
  assert.equal(extract([], [image], 'Search', '/search').thumbnail, '');
  assert.equal(extract([product('Cheese', 'javascript:bad')]).thumbnail, '');
});

test('Meijer gallery fallback works without metadata and rejects ambiguous galleries', () => {
  assert.equal(extract([], [], 'Cheese', '/shopping/product/cheese/123', [image]).thumbnail, image);
  assert.equal(extract([], [], 'Cheese', '/shopping/product/cheese/123', [image, image + '?other']).thumbnail, '');
  assert.equal(extract([], [], 'Search', '/search', [image]).thumbnail, '');
});
