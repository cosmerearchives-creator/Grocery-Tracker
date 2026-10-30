const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extractScript } = require('../src/lookup.cjs');
function lookup(products, { url = 'https://www.walmart.com/ip/red-bull/16', title = 'Red Bull', options = [], shown = [], selected = [] } = {}) {
  const node = (textContent, attrs = {}, tagName = 'DIV') => ({ textContent, tagName, getAttribute: key => attrs[key] || null, getClientRects: () => [{}] });
  const heading = node(title), scripts = [node(JSON.stringify(products))];
  const context = { URL, location: { href: url }, getComputedStyle: () => ({ visibility: 'visible' }), document: { title, querySelectorAll: selector => {
    if (selector === 'h1') return [heading];
    if (selector.startsWith('a[aria-current')) return selected.map(s => ({ ...node('', { 'data-product-id': s.id, 'data-option-name': s.name }), querySelectorAll: () => s.prices.map(p => ({ ...node(p.text || p), children: [], closest: () => p.crossed ? {} : null })) }));
    if (selector.startsWith('script')) return scripts;
    if (selector.startsWith('[aria-checked')) return options.map(size => node(size));
    if (selector.startsWith('meta[property')) return shown.map(price => node('', { content: price }, 'META'));
    return [];
  } } };
  return JSON.parse(JSON.stringify(vm.runInNewContext(extractScript, context)));
}
const product = (name, offers, extra = {}) => ({ '@type': 'Product', name, offers, ...extra });
const offer = (price, extra = {}) => ({ '@type': 'Offer', price, priceCurrency: 'USD', availability: 'https://schema.org/InStock', ...extra });
test('linked default wins even when a cheaper size appears first', () => {
  const result = lookup([product('Red Bull', [offer('2.99', { url: '/ip/red-bull/8' }), offer('4.29', { url: '/ip/red-bull/16' })])]);
  assert.equal(result.candidates[0].cents, 429);
});
test('primary page product is distinguished from recommendations', () => {
  const result = lookup([product('Other drink', offer('1.99')), product('Red Bull', offer('4.29'))]);
  assert.equal(result.candidates[0].product, 'Red Bull'); assert.equal(result.candidates[0].cents, 429);
});
test('selected size identifies a default inside a product group', () => {
  const result = lookup({ '@type': 'ProductGroup', hasVariant: [product('Red Bull 8 oz', offer('2.99'), { size: '8 oz' }), product('Red Bull 16 oz', offer('4.29'), { size: '16 oz' })] }, { options: ['16 oz'] });
  assert.equal(result.candidates[0].cents, 429); assert.match(result.candidates[0].product, /16 oz/);
});
test('current product price can disambiguate several sizes', () => {
  const result = lookup(product('Red Bull', [offer('2.99'), offer('4.29')]), { shown: ['4.29'] });
  assert.equal(result.candidates[0].cents, 429);
});
test('unavailable default does not silently switch to another size', () => {
  const result = lookup(product('Red Bull', [offer('2.99', { url: '/ip/red-bull/8' }), offer('4.29', { url: '/ip/red-bull/16', availability: 'https://schema.org/OutOfStock' })]));
  assert.equal(result.candidates.length, 0); assert.match(result.reason, /unavailable/);
});
test('ambiguous versions and price ranges are never picked arbitrarily', () => {
  const ambiguous = lookup(product('Red Bull', [offer('2.99'), offer('4.29')]));
  assert.equal(ambiguous.candidates.length, 0); assert.match(ambiguous.reason, /default version/);
  const range = lookup(product('Red Bull', { '@type': 'AggregateOffer', lowPrice: '2.99', highPrice: '4.29', priceCurrency: 'USD' }));
  assert.equal(range.candidates.length, 0);
  const samePrice = lookup(product('Red Bull', [offer('4.29', { name: '8 oz' }), offer('4.29', { name: '16 oz' })]));
  assert.equal(samePrice.candidates.length, 0);
});
test('non-USD offers and empty product metadata do not populate a price', () => {
  assert.equal(lookup(product('Red Bull', offer('4.29', { priceCurrency: 'CAD' }))).candidates.length, 0);
  assert.equal(lookup([]).candidates.length, 0);
});
const meijerPage = { url: 'https://www.meijer.com/shopping/product/kraft-singles/2100061526', title: 'Kraft Singles Sliced American Deli Cheese, 24 ct Pack Slices' };
test('Meijer reads selected visible 16 oz price without product-price metadata', () => {
  const result = lookup([], { ...meijerPage, selected: [
    { id: '2100008326', name: 'Jalapeno', prices: ['$3.99'] },
    { id: '2100061526', name: 'American', prices: ['$4.89'] },
    { id: '2100061526', name: '16 Ounces', prices: ['$4.89'] }
  ] });
  assert.equal(result.candidates[0].cents, 489); assert.match(result.candidates[0].product, /16 Ounces/);
});
test('Meijer ignores old struck-through price and rejects conflicting selected prices', () => {
  const sale = lookup([], { ...meijerPage, selected: [{ id: '2100061526', name: '16 Ounces', prices: [{ text: '$5.89', crossed: true }, '$4.89'] }] });
  assert.equal(sale.candidates[0].cents, 489);
  const conflict = lookup([], { ...meijerPage, selected: [{ id: '2100061526', name: 'American', prices: ['$3.99', '$4.89'] }] });
  assert.equal(conflict.candidates.length, 0);
  const otherProduct = lookup([], { ...meijerPage, selected: [{ id: 'other-id', name: 'American', prices: ['$4.89'] }] });
  assert.equal(otherProduct.candidates.length, 0);
});
