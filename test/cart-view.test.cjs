const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cartView } = require('../src/cart-view.cjs');
const ids = ['meijer', 'aldi', 'gfs'];
const cart = { items: [{ id: 'm1', originId: 'cheese', store: 'meijer' }, { id: 'a1', originId: 'cheese', store: 'aldi' }, { id: 'a2', originId: 'bread', store: 'aldi' }, { id: 'g1', originId: 'rice', store: 'gfs' }, { id: 'w1', originId: 'hidden', store: 'walmart' }] };
test('individual store view shows the shared list with only that store’s product column', () => {
  const view = cartView(cart, ids, 'meijer', false); assert.deepEqual(view.rows.map(i => i.id), ['m1', 'a2', 'g1']); assert.deepEqual(view.storeIds, ['meijer']); assert.equal(view.compare, false);
});
test('comparison toggle adds product columns without duplicating list entries', () => {
  const view = cartView(cart, ids, 'meijer', true); assert.deepEqual(view.rows.map(i => i.id), ['m1', 'a2', 'g1']); assert.deepEqual(view.storeIds, ids); assert.equal(view.compare, true);
});
test('All carts includes every active origin once and always enables comparisons', () => {
  const view = cartView(cart, ids, 'all', false); assert.deepEqual(view.rows.map(i => i.originId), ['cheese', 'bread', 'rice']); assert.deepEqual(view.storeIds, ids); assert.equal(view.compare, true);
});
test('views never merge unrelated same-named items or mutate saved cart data', () => {
  const copy = JSON.stringify(cart); const named = { items: [{ id: '1', originId: '1', store: 'meijer', name: 'Milk' }, { id: '2', originId: '2', store: 'aldi', name: 'Milk' }] };
  assert.equal(cartView(named, ids, 'all', true).rows.length, 2); cartView(cart, ids, 'all', true); assert.equal(JSON.stringify(cart), copy);
});
