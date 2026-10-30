const { test } = require('node:test');
const assert = require('node:assert/strict');
const { starterCart, applyDetected, applyChange, applyPriceRefresh, summarize } = require('../src/model.cjs');
const result = (name = 'Kraft', cents = 489) => ({ url: 'https://www.meijer.com/shopping/product/kraft/123', candidates: [{ product: name, cents, availability: '' }] });
function setup() { const cart = starterCart(); applyDetected(cart, 'starter-0', 'meijer', result()); applyChange(cart, { type: 'option-quantity', id: 'starter-0', index: 0, quantity: 3 }); applyChange(cart, { type: 'review', id: 'starter-0', index: 0 }); return cart; }
test('refresh updates price and totals, preserving selected quantity and marking changed prices for review', () => {
  const cart = setup(), previous = { ...cart.items[0].priceOptions[0] };
  assert.equal(applyPriceRefresh(cart, 'starter-0', previous, result('Kraft', 549), undefined, '2026-10-30T22:00:00Z'), 'changed');
  assert.equal(cart.items[0].priceOptions[0].quantity, 3); assert.equal(cart.items[0].offers.meijer.needsReview, true); assert.equal(summarize(cart, 'meijer').cents, 1647); assert.equal(cart.items[0].offers.meijer.lastRefreshAttempt, '2026-10-30T22:00:00Z');
});
test('failed refresh preserves the old price and last successful check, with an error and review flag', () => {
  const cart = setup(), previous = { ...cart.items[0].priceOptions[0] };
  assert.equal(applyPriceRefresh(cart, 'starter-0', previous, null, 'Sign in or try again.'), 'failed');
  assert.equal(cart.items[0].offers.meijer.cents, 489); assert.equal(cart.items[0].offers.meijer.checked, previous.checked); assert.equal(cart.items[0].offers.meijer.refreshError, 'Sign in or try again.'); assert.equal(cart.items[0].offers.meijer.needsReview, true);
});
test('refresh checks zero-quantity alternatives without selecting them, and respects unavailable status', () => {
  const cart = setup(); applyDetected(cart, 'starter-0', 'meijer', { ...result('Other', 279), url: 'https://www.meijer.com/shopping/product/other/456' }, true);
  const previous = { ...cart.items[0].priceOptions[1] }; applyChange(cart, { type: 'availability', id: 'starter-0', available: false });
  applyPriceRefresh(cart, 'starter-0', previous, { ...result('Other', 299), url: previous.url });
  assert.equal(cart.items[0].priceOptions[1].quantity, 0); assert.equal(cart.items[0].priceOptions[1].isAlternative, true); assert.equal(cart.items[0].available, false); assert.equal(summarize(cart, 'meijer').cents, 0);
});
test('refresh skips products edited or removed while it was checking', () => {
  const cart = setup(), previous = { ...cart.items[0].priceOptions[0] }; applyChange(cart, { type: 'remove-offer', id: 'starter-0', index: 0 });
  assert.equal(applyPriceRefresh(cart, 'starter-0', previous, result('Kraft', 549)), 'skipped'); assert.equal(cart.items[0].priceOptions.length, 0);
  const edited = setup(), before = { ...edited.items[0].priceOptions[0] };
  applyChange(edited, { type: 'offer', id: 'starter-0', index: 0, offer: { ...before, cents: 399, checked: '2026-10-30T23:00:00Z', source: 'shelf' } });
  assert.equal(applyPriceRefresh(edited, 'starter-0', before, result('Kraft', 549)), 'skipped'); assert.equal(edited.items[0].priceOptions[0].cents, 399);
});
test('unchanged successful refresh clears an old error without clearing existing review flags', () => {
  const cart = setup(), previous = { ...cart.items[0].priceOptions[0] }; applyPriceRefresh(cart, 'starter-0', previous, null, 'Temporary failure');
  assert.equal(applyPriceRefresh(cart, 'starter-0', previous, result()), 'unchanged'); assert.equal(cart.items[0].offers.meijer.refreshError, undefined); assert.equal(cart.items[0].offers.meijer.needsReview, true);
});
test('a link resolving to a different named product or version cannot silently reprice the saved selection', () => {
  const cart = setup(), previous = { ...cart.items[0].priceOptions[0] };
  assert.equal(applyPriceRefresh(cart, 'starter-0', previous, result('Kraft 8 oz instead of 16 oz', 299)), 'failed');
  assert.equal(cart.items[0].priceOptions[0].cents, 489); assert.equal(cart.items[0].priceOptions[0].quantity, 3); assert.match(cart.items[0].priceOptions[0].refreshError, /different product or version/);
});
