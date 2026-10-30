const { test } = require('node:test');
const assert = require('node:assert/strict');
const { starterCart, migrateCart, validateCart, summarize, checklist, validStoreUrl, searchUrl, STORES, applyChange, applyDetected, searchChoices } = require('../src/model.cjs');
const quote = (name = 'Kraft 16 oz', cents = 489) => ({ cents, packs: 1, product: name, source: 'web-estimate', checked: '2026-10-30T12:00:00Z', url: '' });
const result = (name = 'Kraft 16 oz', cents = 489, store = 'meijer', id = '123') => ({ url: store === 'meijer' ? `https://www.meijer.com/shopping/product/cheese/${id}` : `https://www.aldi.us/store/aldi/products/${id}`, candidates: [{ product: name, cents, availability: '' }] });
const changeQty = (cart, id, index, quantity) => applyChange(cart, { type: 'option-quantity', id, index, quantity });
test('ALDI names and UPCs use the supplied /s?k= route, never search_term', () => {
  assert.equal(searchUrl('aldi', 'Kraft American Singles'), 'https://www.aldi.us/store/aldi/s?k=Kraft+American+Singles');
  const url = new URL(searchUrl('aldi', '021000615261')); assert.equal(url.searchParams.get('k'), '021000615261'); assert.equal(url.searchParams.has('search_term'), false);
});
test('only three active stores can be searched; Walmart remains inactive', () => {
  assert.deepEqual(STORES.map(s => s.id), ['meijer', 'aldi', 'gfs']);
  for (const s of STORES) { const url = searchUrl(s.id, 'Milk & cheese #1'); assert.equal(validStoreUrl(s.id, url), true); assert.ok([...new URL(url).searchParams.values()].includes('Milk & cheese #1')); }
  assert.throws(() => searchUrl('walmart', 'milk')); assert.throws(() => searchUrl('aldi', ' '));
});
test('store links reject untrusted hosts, credentials and non-HTTPS schemes', () => {
  assert.equal(validStoreUrl('meijer', 'https://www.meijer.com/shopping/product/123'), true);
  for (const url of ['https://meijer.com.evil.example/', 'https://evilmeijer.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@meijer.com/']) assert.equal(validStoreUrl('meijer', url), false);
});
test('quantity zero saves options without selecting them for totals or export', () => {
  const cart = starterCart(); assert.equal(summarize(cart, 'meijer').count, 0);
  applyDetected(cart, 'starter-0', 'meijer', result()); changeQty(cart, 'starter-0', 0, 0);
  assert.equal(cart.items[0].priceOptions.length, 1); assert.equal(summarize(cart, 'meijer').cents, 0); assert.doesNotMatch(checklist(cart, 'meijer'), /Kraft/);
  applyDetected(cart, 'starter-0', 'meijer', result()); assert.equal(cart.items[0].priceOptions[0].quantity, 1);
});
test('Save as alternative preserves the main price, quantity and total', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result()); changeQty(cart, 'starter-0', 0, 3);
  applyDetected(cart, 'starter-0', 'meijer', result('Meijer cheese', 279, 'meijer', '456'), true);
  assert.equal(cart.items[0].offers.meijer.product, 'Kraft 16 oz'); assert.equal(cart.items[0].offers.meijer.quantity, 3);
  assert.equal(cart.items[0].priceOptions[1].quantity, 0); assert.equal(cart.items[0].priceOptions[1].isAlternative, true); assert.equal(summarize(cart, 'meijer').cents, 1467);
});
test('main and alternative quantities both count, with independent quantities at other stores', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result());
  applyDetected(cart, 'starter-0', 'meijer', result('Meijer cheese', 279, 'meijer', '456'), true);
  const aldiId = applyDetected(cart, 'starter-0', 'aldi', result('Kraft 16 oz', 468, 'aldi'));
  changeQty(cart, 'starter-0', 0, 3); changeQty(cart, 'starter-0', 1, 1); changeQty(cart, aldiId, 0, 2);
  assert.equal(summarize(cart, 'meijer').cents, 1746); assert.equal(summarize(cart, 'aldi').cents, 936);
  assert.equal(summarize(cart, 'meijer').count, 2); assert.match(checklist(cart, 'meijer'), /3 × Kraft/); assert.match(checklist(cart, 'meijer'), /1 × Meijer cheese/);
  assert.match(checklist(cart, 'aldi'), /2 × Kraft/); assert.doesNotMatch(checklist(cart, 'aldi'), /Meijer cheese/);
});
test('saving an alternative first selects nothing and creates no unpriced shopping selection', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'aldi', result('Store cheese', 279, 'aldi'), true);
  assert.equal(summarize(cart, 'aldi').count, 0); assert.equal(summarize(cart, 'aldi').missing, 0); assert.equal(summarize(cart, 'aldi').cents, 0);
});
test('duplicate alternative saves do not replace or reprice the main option', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result());
  applyDetected(cart, 'starter-0', 'meijer', result('Kraft 16 oz', 599), true);
  assert.equal(cart.items[0].priceOptions.length, 1); assert.equal(summarize(cart, 'meijer').cents, 489);
});
test('Not available excludes all selections at only that store, with explicit export flag', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result());
  const aldiId = applyDetected(cart, 'starter-0', 'aldi', result('Other cheese', 299, 'aldi'));
  applyChange(cart, { type: 'availability', id: 'starter-0', store: 'meijer', available: false });
  assert.equal(summarize(cart, 'meijer').cents, 0); assert.equal(summarize(cart, 'meijer').unavailable, 1); assert.equal(summarize(cart, 'aldi').cents, 299);
  assert.match(checklist(cart, 'meijer'), /NOT AVAILABLE AT THIS STORE: Kraft American Singles/); assert.doesNotMatch(checklist(cart, 'meijer'), /☐ 1 × Kraft/);
  assert.throws(() => changeQty(cart, 'starter-0', 0, 2));
  applyChange(cart, { type: 'availability', id: 'starter-0', available: true }); assert.equal(summarize(cart, 'meijer').cents, 489); assert.equal(cart.items.find(i => i.id === aldiId).available, true);
});
test('an unpriced requested selection is distinct from unavailable or zero quantity', () => {
  const cart = starterCart(); applyChange(cart, { type: 'quantity', id: 'starter-0', quantity: 2 });
  assert.equal(summarize(cart, 'meijer').missing, 1); assert.match(checklist(cart, 'meijer'), /2 × Kraft American Singles.*PRICE MISSING/);
  applyChange(cart, { type: 'availability', id: 'starter-0', store: 'gfs', available: false });
  assert.equal(summarize(cart, 'gfs').missing, 0); assert.equal(summarize(cart, 'gfs').unavailable, 1);
});
test('per-option review clearing and price editing preserve other product selections', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result());
  applyDetected(cart, 'starter-0', 'meijer', result('Other cheese', 299, 'meijer', '456'), true); changeQty(cart, 'starter-0', 1, 2);
  applyChange(cart, { type: 'review', id: 'starter-0', index: 1 }); assert.equal(cart.items[0].priceOptions[0].needsReview, true); assert.equal(cart.items[0].priceOptions[1].needsReview, false);
  applyChange(cart, { type: 'offer', id: 'starter-0', index: 1, offer: quote('Other cheese', 279) });
  assert.equal(cart.items[0].priceOptions[1].quantity, 2); assert.equal(summarize(cart, 'meijer').cents, 1047);
  applyChange(cart, { type: 'remove-offer', id: 'starter-0', index: 1 }); assert.equal(summarize(cart, 'meijer').cents, 489);
});
test('invalid quantities or prices cannot be persisted', () => {
  for (const n of [-1, 1000, 1.5, '2']) { const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result()); assert.throws(() => changeQty(cart, 'starter-0', 0, n)); }
  for (const cents of [-1, 0, NaN, 1.5, '329']) assert.throws(() => applyChange(starterCart(), { type: 'offer', id: 'starter-0', offer: { ...quote(), cents } }));
});
test('old schema-2 quantities migrate only to the formerly selected product, preserving alternatives and inactive Walmart', () => {
  const main = quote(), other = quote('Meijer cheese', 279);
  const old = { schema: 2, items: [{ id: 'old', originId: 'old', store: 'meijer', name: 'Cheese', brand: '', size: '16 oz', match: 'exact', quantity: 3, offers: { meijer: main }, priceOptions: [main, other] }, { id: 'walmart-old', originId: 'old', store: 'walmart', name: 'Cheese', brand: '', size: '16 oz', match: 'exact', quantity: 2, offers: { walmart: quote('Walmart cheese', 399) } }] };
  const cart = migrateCart(old); assert.equal(cart.schema, 3); assert.equal(cart.items[0].priceOptions[0].quantity, 3); assert.equal(cart.items[0].priceOptions[1].quantity, 0);
  assert.equal(summarize(cart, 'meijer').cents, 1467); assert.equal(cart.items[1].priceOptions[0].quantity, 2); assert.throws(() => checklist(cart, 'walmart')); assert.equal(old.schema, 2); assert.equal(old.items[0].priceOptions[0].quantity, undefined);
  assert.deepEqual(migrateCart(cart), cart);
});
test('schema-1 shared carts split stores and retain their original totals', () => {
  const old = { schema: 1, items: [{ id: 'old', name: 'Cheese', brand: '', size: '8 oz', match: 'equivalent', quantity: 3, offers: { meijer: quote('Cheese', 329), aldi: quote('Cheese', 299) } }] };
  const cart = migrateCart(old); assert.equal(cart.items.length, 2); assert.equal(summarize(cart, 'meijer').cents, 987); assert.equal(summarize(cart, 'aldi').cents, 897);
});
test('UPC search details preserve leading zeros for main and named alternatives', () => {
  const cart = starterCart(); applyChange(cart, { type: 'search-details', id: 'starter-0', upc: '021000615261', alternatives: [{ name: 'Other cheese', upc: '012345678905' }] });
  const choices = searchChoices(cart.items[0]); assert.equal(choices.find(c => c.id === 'upc-0').query, '021000615261'); assert.equal(choices.find(c => c.id === 'upc-1').query, '012345678905'); assert.throws(() => applyChange(starterCart(), { type: 'search-details', id: 'starter-0', upc: '12345' }));
});
test('store-specific additions and removals never impose rows on the other stores', () => {
  const cart = starterCart(); applyChange(cart, { type: 'add', store: 'aldi', name: 'ALDI bread' });
  const item = cart.items.at(-1); assert.equal(item.quantity, 0); applyChange(cart, { type: 'quantity', id: item.id, quantity: 2 }); assert.match(checklist(cart, 'aldi'), /2 × ALDI bread/); assert.doesNotMatch(checklist(cart, 'meijer'), /ALDI bread/);
  applyChange(cart, { type: 'remove', id: item.id }); assert.equal(cart.items.length, 4); assert.equal(validateCart(cart).schema, 3);
});
