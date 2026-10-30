// Serialized into the isolated store page. Reads public product metadata and
// selected product-option labels, never credentials, cookies or page storage.
function extractProduct() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const normalize = value => clean(value).toLowerCase();
  const pageUrl = location.href;
  const sameUrl = value => {
    try {
      const a = new URL(value, pageUrl), b = new URL(pageUrl);
      for (const u of [a, b]) {
        u.hash = ''; u.pathname = u.pathname.replace(/\/$/, '');
        for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/i.test(key)) u.searchParams.delete(key);
        u.searchParams.sort();
      }
      return a.href === b.href;
    } catch { return false; }
  };
  const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const heading = [...document.querySelectorAll('h1')].find(visible);
  const title = clean(heading?.textContent || document.title);
  const products = [], entities = new Map();
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 14 || products.length >= 80) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(v => visit(v, depth + 1)); return; }
    if (value['@id']) entities.set(value['@id'], value);
    if ([].concat(value['@type'] || []).includes('Product')) products.push(value);
    for (const [key, child] of Object.entries(value)) if (key !== 'offers') visit(child, depth + 1);
  };
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 30)) {
    if (script.textContent.length > 2000000) continue;
    try { visit(JSON.parse(script.textContent)); } catch {}
  }
  const resolve = value => value && typeof value === 'object' && value['@id'] ? { ...entities.get(value['@id']), ...value } : value;
  const candidates = [];
  for (const product of products) {
    for (let offer of [].concat(product.offers || [])) {
      offer = resolve(offer);
      if (!offer || !['USD', 'usd'].includes(offer.priceCurrency)) continue;
      const price = Number(offer.price);
      if (!Number.isFinite(price) || price <= 0 || price > 100000) continue;
      candidates.push({ product: clean(product.name || title), cents: Math.round(price * 100), availability: clean(offer.availability), productUrl: product.url || '', offerUrl: offer.url || '', sku: clean(offer.sku || product.sku), size: clean(product.size?.name || product.size || product.weight?.name), variant: clean(offer.name), primary: !!heading && normalize(product.name) === normalize(title) });
    }
  }
  // Only one store lookup offer is returned. Never pick a first/cheapest variant
  // or an AggregateOffer.lowPrice, which can belong to a different package.
  const unique = values => [...new Map(values.map(v => [JSON.stringify([v.product, v.cents, v.sku, v.size, v.variant, v.availability]), v])).values()];
  const finish = (values, reason) => {
    const offers = unique(values);
    if (offers.length !== 1) return null;
    const offer = offers[0];
    if (/OutOfStock|Discontinued|SoldOut/i.test(offer.availability)) return { url: pageUrl, candidates: [], reason: 'The selected version is marked unavailable.' };
    return { url: pageUrl, candidates: [{ product: [offer.product, offer.size || offer.variant].filter(Boolean).join(' — '), cents: offer.cents, availability: offer.availability }], reason };
  };
  let result = finish(candidates.filter(c => c.offerUrl && sameUrl(c.offerUrl)), 'Using the version linked on this page.');
  if (result) return result;
  const linked = candidates.filter(c => c.productUrl && sameUrl(c.productUrl));
  result = finish(linked, 'Using the default product on this page.');
  if (result) return result;
  const primary = linked.length ? linked : candidates.filter(c => c.primary);
  const scope = primary.length ? primary : candidates;
  const optionNodes = [...document.querySelectorAll('[aria-checked="true"], [aria-selected="true"], [data-selected="true"]')].filter(visible).slice(0, 40);
  const options = optionNodes.map(n => clean(n.getAttribute('aria-label') || n.textContent)).filter(Boolean);
  const identifiers = optionNodes.flatMap(n => ['data-sku', 'data-product-id', 'data-item-id'].map(a => n.getAttribute(a))).filter(Boolean);
  const url = new URL(pageUrl);
  for (const key of ['sku', 'skuId', 'variant', 'variantId', 'product_id', 'selectedSkuId', 'itemId']) if (url.searchParams.has(key)) identifiers.push(url.searchParams.get(key));
  if (identifiers.length) {
    result = finish(scope.filter(c => c.sku && identifiers.includes(c.sku)), 'Using the selected product version.');
    if (result) return result;
  }
  if (options.length) {
    const selected = scope.filter(c => options.some(o => [c.size, c.variant].some(v => v && normalize(o) === normalize(v))));
    result = finish(selected, 'Using the size selected on the page.');
    if (result) return result;
  }
  result = finish(primary, 'Using the default product on this page.');
  if (result) return result;
  // Product-specific current-price metadata can distinguish several offers on
  // the same page. Avoid generic dollar text and recommendation-card prices.
  const priceNodes = [...document.querySelectorAll('meta[property="product:price:amount"], meta[property="og:price:amount"], main [itemprop="price"], [itemtype$="/Product"] [itemprop="price"]')];
  const shown = [...new Set(priceNodes.filter(n => n.tagName === 'META' || visible(n)).map(n => Number(n.getAttribute('content') || clean(n.textContent).replace(/^\$/, '').replace(/,/g, ''))).filter(n => Number.isFinite(n) && n > 0).map(n => Math.round(n * 100)))];
  if (shown.length === 1) {
    result = finish(scope.filter(c => c.cents === shown[0]), 'Using the current price displayed on this page.');
    if (result) return result;
  }
  if (products.length === 1) {
    result = finish(candidates, 'Using the default product on this page.');
    if (result) return result;
  }
  return { url: pageUrl, candidates: [], reason: candidates.length ? 'The page’s default version could not be identified. Enter the displayed price manually.' : 'No readable USD product price found. Enter the displayed price manually.' };
}
module.exports = { extractProduct, extractScript: `(${extractProduct.toString()})()` };
