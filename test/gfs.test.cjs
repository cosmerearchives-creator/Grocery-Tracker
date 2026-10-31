const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extractScript } = require('../src/lookup.cjs');
const { starterCart, applyDetected, applyChange, applyPriceRefresh, applyThumbnailRefresh, summarize, checklist } = require('../src/model.cjs');
const url = 'https://gfsstore.com/products/781342/';
const title = 'Kraft Original Whipped Topping, 16 Oz Tub, 12/Case';
function extract(panels) {
  const node = text => ({ textContent: text, getClientRects: () => [{}] });
  const context = { URL, location: { href: url }, getComputedStyle: () => ({ visibility: 'visible' }), document: { title, querySelectorAll: selector => {
    if (selector === 'h1') return [node(title)];
    if (selector === '#each-detail, #case-detail') return panels.map(p => ({ ...node(''), getAttribute: () => p.case ? 'case-detail' : 'each-detail', querySelectorAll: sel => (sel === '.unit_price' ? p.prices || [p.case ? '$60.99' : '$5.49'] : [p.case ? 'case' : 'tub']).map(node), querySelector: sel => sel.startsWith('button') ? { getAttribute: () => p.code || '781342', disabled: !!p.disabled } : node(p.stock || '3') }));
    return [];
  } } };
  return JSON.parse(JSON.stringify(vm.runInNewContext(extractScript, context)));
}
test('GFS reads both labeled purchase panels without choosing one price or a recommendation', () => {
  const r = extract([{}, { case: true }]);
  assert.equal(r.purchaseOptions, true); assert.deepEqual(r.candidates.map(p => [p.purchaseKind, p.purchaseUnit, p.cents]), [['single', 'tub', 549], ['case', 'case', 6099]]);
  assert.equal(extract([{ code: 'other' }]).candidates.length, 0);
  assert.equal(extract([{ prices: ['$5.49', '$9.99'] }]).candidates.length, 0);
  assert.equal(extract([{ case: true }]).candidates[0].purchaseKind, 'case');
  assert.equal(extract([{ stock: '0' }]).candidates[0].availability, 'OutOfStock');
});
test('both GFS prices save with independent quantities; a case is priced once, not multiplied by case contents', () => {
  const cart = starterCart(), r = extract([{}, { case: true }]);
  applyDetected(cart, 'starter-0', 'gfs', r);
  const item = cart.items.at(-1); assert.deepEqual(item.priceOptions.map(o => o.quantity), [1, 0]);
  applyChange(cart, { type: 'option-quantity', id: item.id, index: 1, quantity: 2 });
  assert.equal(summarize(cart, 'gfs').cents, 549 + 6099 * 2); assert.match(checklist(cart, 'gfs'), /2 × .*Bulk \(case\)/);
  applyDetected(cart, 'starter-0', 'gfs', r); assert.equal(item.priceOptions[1].quantity, 2); assert.equal(item.priceOptions.length, 2);
  assert.ok(item.priceOptions.every(o => o.packs === 1));
});
test('Save as alternative preserves the existing selection and saves both options at zero', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'gfs', { url, candidates: [{ product: 'Other', cents: 199 }] });
  applyDetected(cart, 'starter-0', 'gfs', extract([{}, { case: true }]), true);
  const item = cart.items.at(-1); assert.deepEqual(item.priceOptions.map(o => o.quantity), [1, 0, 0]); assert.equal(summarize(cart, 'gfs').cents, 199);
});
test('refresh matches each GFS purchase unit and retains the old price when its unit disappears', () => {
  const cart = starterCart(), r = extract([{}, { case: true }]); applyDetected(cart, 'starter-0', 'gfs', r);
  const item = cart.items.at(-1), before = item.priceOptions.map(o => ({ ...o }));
  r.candidates[0].cents = 599; r.candidates[1].cents = 6599; r.thumbnail = 'https://img.example/whip.jpg';
  assert.equal(applyPriceRefresh(cart, item.id, before[0], r), 'changed'); assert.equal(applyPriceRefresh(cart, item.id, before[1], r), 'changed');
  assert.deepEqual(item.priceOptions.map(o => o.cents), [599, 6599]);
  assert.equal(applyThumbnailRefresh(cart, item.id, { ...item.priceOptions[1] }, { ...r, thumbnail: 'https://img.example/new.jpg' }), 'changed');
  assert.equal(applyPriceRefresh(cart, item.id, { ...item.priceOptions[1] }, extract([{}])), 'failed'); assert.equal(item.priceOptions[1].cents, 6599);
});
test('case-only selections retain their quantity if single pricing later appears', () => {
  const cart = starterCart(); applyDetected(cart, 'starter-0', 'gfs', extract([{ case: true }]));
  const item = cart.items.at(-1); applyChange(cart, { type: 'option-quantity', id: item.id, index: 0, quantity: 3 });
  applyDetected(cart, 'starter-0', 'gfs', extract([{}, { case: true }]));
  assert.equal(item.priceOptions.find(o => o.purchaseKind === 'case').quantity, 3);
  assert.equal(item.priceOptions.find(o => o.purchaseKind === 'single').quantity, 1);
});
