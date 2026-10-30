const { test } = require('node:test');
const assert = require('node:assert/strict');
const { starterCart, validateCart, summarize, checklist, validStoreUrl, searchUrl, STORES } = require('../src/model.cjs');
const offer = { cents: 329, packs: 2, product: 'Sharp cheddar 8 oz', source: 'web-estimate', checked: '2026-10-30T12:00:00Z', url: '' };
test('missing prices are incomplete, never a zero-dollar complete cart', () => {
  const cart = starterCart(); assert.deepEqual(summarize(cart, 'aldi'), { cents: 0, matched: 0, missing: 4, complete: false });
  cart.items = []; assert.equal(summarize(cart, 'aldi').complete, false);
});
test('totals use integer cents, cart quantity and required package count', () => {
  const cart = starterCart(); cart.items = [cart.items[3]]; cart.items[0].quantity = 3; cart.items[0].offers.aldi = offer;
  assert.equal(summarize(validateCart(cart), 'aldi').cents, 1974); assert.equal(summarize(cart, 'aldi').complete, true);
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
  for (const value of [-1, 0, NaN, 1.5, '329']) { const cart = starterCart(); cart.items[0].offers.aldi = { ...offer, cents: value }; assert.throws(() => validateCart(cart)); }
  const cart = starterCart(); cart.items.push(cart.items[0]); assert.throws(() => validateCart(cart));
});
test('all four store searches encode product text without changing domains', () => {
  const query = 'Milk & cheese #1 / 16 oz';
  for (const store of STORES) { const url = searchUrl(store.id, query); assert.equal(validStoreUrl(store.id, url), true); assert.ok([...new URL(url).searchParams.values()].includes(query)); }
  assert.equal(new URL(searchUrl('gfs', query)).searchParams.get('ps'), query);
  assert.throws(() => searchUrl('aldi', ' ')); assert.throws(() => searchUrl('fake', 'milk'));
});
