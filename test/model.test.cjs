const { test } = require('node:test');
const assert = require('node:assert/strict');
const { starterCart, migrateCart, validateCart, summarize, checklist, validStoreUrl, searchUrl, STORES, applyChange, applyDetected, searchChoices } = require('../src/model.cjs');
const offer = { cents: 329, packs: 2, product: 'Sharp cheddar 8 oz', source: 'web-estimate', checked: '2026-10-30T12:00:00Z', url: '' };
test('missing prices are incomplete, never a zero-dollar complete cart', () => {
  const cart = starterCart(); assert.deepEqual(summarize(cart, 'meijer'), { cents: 0, matched: 0, reviews: 0, count: 4, missing: 4, complete: false });
  assert.equal(summarize(cart, 'aldi').count, 0);
  cart.items = []; assert.equal(summarize(cart, 'aldi').complete, false);
});
test('totals use integer cents, cart quantity and required package count', () => {
  const cart = starterCart(); cart.items = [cart.items[3]]; cart.items[0].quantity = 3; cart.items[0].offers.meijer = offer;
  assert.equal(summarize(validateCart(cart), 'meijer').cents, 1974); assert.equal(summarize(cart, 'meijer').complete, true);
});
test('exports flag missing prices and preserve product/package details', () => {
  const cart = starterCart(); cart.items[0].offers.meijer = offer;
  const text = checklist(cart, 'meijer'); assert.match(text, /Known subtotal \(incomplete\)/); assert.match(text, /3 item\(s\) without a price/); assert.match(text, /2 package\(s\)/); assert.match(text, /PRICE MISSING/);
});
test('store links reject untrusted hosts, schemes and embedded credentials', () => {
  assert.equal(validStoreUrl('walmart', 'https://www.walmart.com/ip/123'), true);
  for (const url of ['https://walmart.com.evil.example/', 'https://evilwalmart.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@walmart.com/']) assert.equal(validStoreUrl('walmart', url), false);
});
test('invalid stored or renderer-supplied values cannot corrupt totals', () => {
  for (const value of [-1, 0, NaN, 1.5, '329']) { const cart = starterCart(); cart.items[0].offers.meijer = { ...offer, cents: value }; assert.throws(() => validateCart(cart)); }
  const cart = starterCart(); cart.items.push(cart.items[0]); assert.throws(() => validateCart(cart));
});
test('old shared carts split saved offers by store without losing quantities or prices', () => {
  const old = { schema: 1, items: [{ id: 'old', name: 'Cheese', brand: '', size: '8 oz', match: 'equivalent', quantity: 3, offers: { meijer: { ...offer }, aldi: { ...offer, cents: 299 } } }, { id: 'unpriced', name: 'Milk', brand: '', size: 'gallon', match: 'equivalent', quantity: 1, offers: {} }] };
  const cart = migrateCart(old);
  assert.equal(cart.items.length, 3); assert.equal(summarize(cart, 'meijer').cents, 1974); assert.equal(summarize(cart, 'aldi').cents, 1794);
  assert.equal(cart.items.filter(i => i.name === 'Milk').length, 1);
  assert.equal(old.schema, 1); assert.equal(Object.keys(old.items[0].offers).length, 2);
  assert.deepEqual(migrateCart(cart), cart);
});
test('store additions, quantities, removals and exports are independent', () => {
  const cart = starterCart();
  applyChange(cart, { type: 'add', store: 'aldi', name: 'ALDI-only bread', size: 'loaf', match: 'equivalent' });
  const item = cart.items.at(-1); applyChange(cart, { type: 'quantity', id: item.id, delta: 1 });
  assert.equal(summarize(cart, 'meijer').count, 4); assert.equal(summarize(cart, 'aldi').count, 1);
  assert.match(checklist(cart, 'aldi'), /2 × ALDI-only bread/); assert.doesNotMatch(checklist(cart, 'aldi'), /Kraft/); assert.doesNotMatch(checklist(cart, 'meijer'), /ALDI-only bread/);
  applyChange(cart, { type: 'remove', id: item.id }); assert.equal(summarize(cart, 'meijer').count, 4);
});
test('detected prices save to the active store, need review, and keep independent quantities', () => {
  const cart = starterCart(), source = cart.items[0];
  const result = { url: 'https://www.aldi.us/store/aldi/products/123', candidates: [{ product: 'Cheese 16 oz', cents: 489, availability: '' }] };
  const id = applyDetected(cart, source.id, 'aldi', result);
  const added = cart.items.find(i => i.id === id);
  assert.equal(added.offers.aldi.needsReview, true); assert.equal(source.offers.meijer, undefined);
  assert.match(checklist(cart, 'aldi'), /NEEDS REVIEW/);
  applyChange(cart, { type: 'quantity', id, delta: 1 }); assert.equal(source.quantity, 1);
  applyDetected(cart, source.id, 'aldi', result); assert.equal(cart.items.filter(i => i.store === 'aldi').length, 1); assert.equal(added.quantity, 2);
  applyChange(cart, { type: 'review', id }); assert.equal(added.offers.aldi.needsReview, false); assert.doesNotMatch(checklist(cart, 'aldi'), /NEEDS REVIEW/);
});
test('a price from one store cannot be attached to another store cart', () => {
  const cart = starterCart(); cart.items[0].offers.aldi = { ...offer };
  assert.throws(() => validateCart(cart));
  assert.throws(() => applyDetected(starterCart(), 'starter-0', 'meijer', { url: 'https://www.walmart.com/ip/123', candidates: [{ cents: 489 }] }));
});
test('all three active store searches encode product text without changing domains', () => {
  const query = 'Milk & cheese #1 / 16 oz';
  for (const store of STORES) { const url = searchUrl(store.id, query); assert.equal(validStoreUrl(store.id, url), true); assert.ok([...new URL(url).searchParams.values()].includes(query)); }
  assert.equal(new URL(searchUrl('gfs', query)).searchParams.get('ps'), query);
  assert.throws(() => searchUrl('aldi', ' ')); assert.throws(() => searchUrl('fake', 'milk'));
});
test('Walmart is inactive while its old rows remain readable', () => {
  assert.deepEqual(STORES.map(s => s.id), ['meijer', 'aldi', 'gfs']);
  assert.throws(() => searchUrl('walmart', 'milk'));
  const cart = starterCart(); cart.items.push({ ...cart.items[0], id: 'old-walmart', store: 'walmart', offers: { walmart: { ...offer } } });
  assert.equal(validateCart(cart).items.at(-1).store, 'walmart'); assert.throws(() => checklist(cart, 'walmart'));
  assert.throws(() => applyChange(starterCart(), { type: 'add', store: 'walmart', name: 'Milk' }));
});
test('UPC and alternative queries preserve leading zeros and separate product searches', () => {
  const cart = starterCart(); applyChange(cart, { type: 'search-details', id: 'starter-0', upc: '021000615261', alternatives: [{ name: 'Other cheese', upc: '012345678905' }, { name: 'Store brand slices', upc: '' }] });
  const choices = searchChoices(cart.items[0]);
  assert.equal(choices.find(c => c.id === 'upc-0').query, '021000615261');
  assert.equal(choices.find(c => c.id === 'upc-1').query, '012345678905');
  assert.equal(choices.find(c => c.id === 'name-2').query, 'Store brand slices');
  assert.throws(() => applyChange(starterCart(), { type: 'search-details', id: 'starter-0', upc: '12345' }));
});
test('multiple product options count only the chosen product, with review state preserved', () => {
  const cart = starterCart();
  const result = { url: 'https://www.meijer.com/shopping/product/cheese/123', candidates: [{ product: 'Kraft 16 oz', cents: 489, availability: '' }] };
  applyDetected(cart, 'starter-0', 'meijer', result);
  applyChange(cart, { type: 'review', id: 'starter-0' });
  applyDetected(cart, 'starter-0', 'meijer', { ...result, url: 'https://www.meijer.com/shopping/product/other/456', candidates: [{ product: 'Other cheese', cents: 329 }] });
  assert.equal(cart.items[0].priceOptions.length, 2); assert.equal(summarize(cart, 'meijer').cents, 329);
  applyChange(cart, { type: 'choose-option', id: 'starter-0', index: 0 });
  assert.equal(summarize(cart, 'meijer').cents, 489); assert.equal(cart.items[0].offers.meijer.needsReview, false);
  assert.match(checklist(cart, 'meijer'), /SELECTED: Kraft 16 oz/); assert.doesNotMatch(checklist(cart, 'meijer'), /SELECTED: Other cheese/);
  applyChange(cart, { type: 'remove-offer', id: 'starter-0' }); assert.equal(cart.items[0].priceOptions.length, 1); assert.equal(summarize(cart, 'meijer').cents, 329);
});
test('saving a different store option creates only that store entry', () => {
  const cart = starterCart(); applyChange(cart, { type: 'offer', id: 'starter-0', store: 'gfs', offer: { ...offer } });
  assert.equal(summarize(cart, 'gfs').count, 1); assert.equal(summarize(cart, 'aldi').count, 0); assert.equal(cart.items[0].offers.meijer, undefined);
});
