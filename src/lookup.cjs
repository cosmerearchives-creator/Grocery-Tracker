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
  if (/^(access denied|verify you are human|robot or human|security check|sign in required)/i.test(title)) return { url: pageUrl, candidates: [], accessBlocked: true, reason: 'The store blocked this request or requires verification. Open its store tab to sign in, or try again later.' };
  // GFS deliberately offers both each and case pricing. Bind the purchase
  // panels to this page's reorder number; recommendation cards are excluded.
  if (heading && /(^|\.)gfsstore\.com$/.test(new URL(pageUrl).hostname) && /^\/products\/\d+\/?$/.test(new URL(pageUrl).pathname)) {
    const code = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1);
    const options = [];
    for (const panel of document.querySelectorAll('#each-detail, #case-detail')) {
      if (!visible(panel)) continue;
      const button = panel.querySelector('button.add-to-list-button[data-reorder_number]');
      if (!button || button.getAttribute('data-reorder_number') !== code) continue;
      const kind = panel.getAttribute('id') === 'case-detail' ? 'case' : 'single';
      const prices = [...panel.querySelectorAll('.unit_price')].filter(visible).map(n => clean(n.textContent));
      const descriptions = [...panel.querySelectorAll('.unit_description')].filter(visible).map(n => clean(n.textContent));
      const price = [...new Set(prices)]; const units = [...new Set(descriptions)];
      if (price.length !== 1 || units.length !== 1 || !units[0] || units[0].length > 60) continue;
      const match = price[0].match(/^\$\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/);
      if (!match) continue;
      const cents = Number(match[1].replace(/,/g, '')) * 100 + Number(match[2]);
      if (cents <= 0 || cents > 10000000) continue;
      const stock = panel.querySelector('.item_inventory_stock_level');
      const unavailable = button.disabled || (stock && /^0$/.test(clean(stock.textContent)));
      options.push({ product: `${title} — ${kind === 'case' ? 'Bulk' : 'Single item'} (${units[0]})`, cents, availability: unavailable ? 'OutOfStock' : '', purchaseKind: kind, purchaseUnit: units[0], productCode: code });
    }
    if (options.length && options.length <= 2 && new Set(options.map(o => o.purchaseKind)).size === options.length) return { url: pageUrl, purchaseOptions: true, candidates: options, reason: 'Gordon Food Service single-item and bulk prices are listed separately.' };
  }
  // Meijer's current product pages expose variant prices as visible text,
  // while their JSON-LD can contain only ratings and breadcrumbs.
  // Bind the selected controls to the product ID in this page's URL so other
  // flavors, package sizes, recommendations and the header cart stay excluded.
  if (heading && /(^|\.)meijer\.com$/.test(new URL(pageUrl).hostname) && new URL(pageUrl).pathname.startsWith('/shopping/product/')) {
    const pageId = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1);
    const selected = [...document.querySelectorAll('a[aria-current="page"][data-product-id]')].filter(n => visible(n) && n.getAttribute('data-product-id') === pageId);
    const prices = new Set();
    for (const option of selected) {
      for (const node of option.querySelectorAll('span')) {
        if (node.children.length || !visible(node) || node.closest('del, s, .line-through')) continue;
        const price = clean(node.textContent).match(/^\$\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/);
        if (price) { const cents = Number(price[1].replace(/,/g, '')) * 100 + Number(price[2]); if (cents > 0 && cents <= 10000000) prices.add(cents); }
      }
    }
    if (prices.size === 1) {
      const size = selected.map(n => clean(n.getAttribute('data-option-name'))).find(name => /\b(ounces?|oz|pounds?|lbs?|gallons?|gal|count|ct|fl\s*oz)\b/i.test(name));
      return { url: pageUrl, candidates: [{ product: [title, size].filter(Boolean).join(' — '), cents: [...prices][0], availability: '' }], reason: 'Using the displayed price for Meijer’s selected product version.' };
    }
  }
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
  // Other stores return one offer. Never pick a first/cheapest variant
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
  if (heading && /(^|\.)meijer\.com$/.test(new URL(pageUrl).hostname) && new URL(pageUrl).pathname.startsWith('/shopping/product/')) {
    const values = new Set();
    // A recommendation can sit inside a distant purchase-panel ancestor.
    // Require direct ownership so its price never joins the main panel's price.
    const panels = [...document.querySelectorAll('[data-cart-eligibility] > section[aria-label="Product pricing information"]')].filter(visible);
    for (const panel of panels) {
      const container = panel.closest('[data-cart-eligibility]');
      if (!container?.querySelector('button[data-testid="quantity-input-add-to-cart"][aria-label="Add to Cart"]')) continue;
      if (container.getAttribute('data-cart-eligibility') !== 'available') continue;
      for (const node of panel.querySelectorAll('span')) {
        if (node.children.length || !visible(node) || node.closest('del, s, .line-through')) continue;
        const price = clean(node.textContent).match(/^\$\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/);
        if (price) { const cents = Number(price[1].replace(/,/g, '')) * 100 + Number(price[2]); if (cents > 0 && cents <= 10000000) values.add(cents); }
      }
    }
    if (values.size === 1) return { url: pageUrl, candidates: [{ product: title, cents: [...values][0], availability: '' }], reason: 'Using the main product price displayed beside Add to Cart.' };
  }
  return { url: pageUrl, candidates: [], reason: candidates.length ? 'The page’s default version could not be identified. Enter the displayed price manually.' : 'No readable USD product price found. Enter the displayed price manually.' };
}
// Read only product-specific images, independently of the price.
function extractThumbnail(result) {
  if (result.accessBlocked) return result;
  const title = [...document.querySelectorAll('h1')].find(n => n.getClientRects().length)?.textContent?.trim() || document.title;
  const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const safe = value => { try { if (!value || /(?:missing[-_]item|no[-_]image|image[-_]not[-_]available|placeholder)/i.test(value)) return ''; const u = new URL(value, location.href); return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= 4000 ? u.href : ''; } catch { return ''; } };
  const imageUrl = value => { if (Array.isArray(value)) return value.map(imageUrl).find(Boolean) || ''; if (value && typeof value === 'object') return imageUrl(value.url || value.contentUrl); return typeof value === 'string' ? safe(value) : ''; };
  const products = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 14 || products.length >= 80) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(v => visit(v, depth + 1)); return; }
    if ([].concat(value['@type'] || []).includes('Product')) products.push(value);
    for (const [key, child] of Object.entries(value)) if (key !== 'offers') visit(child, depth + 1);
  };
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 30)) {
    if (script.textContent.length <= 2000000) { try { visit(JSON.parse(script.textContent)); } catch {} }
  }
  const samePage = value => { try { const u = new URL(value, location.href), page = new URL(location.href); return u.origin === page.origin && u.pathname.replace(/\/$/, '') === page.pathname.replace(/\/$/, ''); } catch { return false; } };
  const linked = products.filter(p => p.url && samePage(p.url));
  const matched = linked.length ? linked : products.filter(p => normalize(p.name) === normalize(title));
  const images = [...new Set(matched.map(p => imageUrl(p.image)).filter(Boolean))];
  let thumbnail = images.length === 1 ? images[0] : '';
  if (!thumbnail && /(^|\.)meijer\.com$/.test(new URL(location.href).hostname) && new URL(location.href).pathname.startsWith('/shopping/product/')) {
    // Meijer omits image metadata on some pages. Its labeled first gallery
    // image belongs to the main product; recommendation cards use other markup.
    const gallery = [...document.querySelectorAll('button[aria-label^="Product image. View larger image 1 of"] img')].filter(n => n.getClientRects().length);
    const sources = [...new Set(gallery.map(n => safe(n.currentSrc || n.getAttribute('src'))).filter(Boolean))];
    if (sources.length === 1) thumbnail = sources[0];
  }
  const productPage = result.candidates.length === 1 || /\/(?:product|products|p)\//.test(new URL(location.href).pathname) || matched.length === 1;
  if (!thumbnail && productPage) {
    const values = [...new Set([...document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')].map(n => safe(n.getAttribute('content'))).filter(Boolean))];
    if (values.length === 1) thumbnail = values[0];
  }
  // Dynamic ALDI carousel and GFS galleries can lack JSON-LD/OG images.
  // Require an exact product alt label; never choose a generic first image.
  if (!thumbnail && productPage) {
    const selector = /(^|\.)aldi\.us$/.test(new URL(location.href).hostname) ? 'img[alt]' : 'main img[alt], [itemtype$="/Product"] img[alt]';
    const gallery = [...document.querySelectorAll(selector)].filter(n => n.getClientRects().length && normalize(n.getAttribute('alt')) === normalize(title));
    const sources = [...new Set(gallery.map(n => safe(n.currentSrc || n.getAttribute('src') || n.getAttribute('data-src'))).filter(Boolean))];
    if (sources.length === 1) thumbnail = sources[0];
  }
  return { ...result, thumbnail, imageProduct: title };
}
function extractDetails(result, normalizeGtin) {
  if (result.accessBlocked) return result;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const heading = [...document.querySelectorAll('h1')].find(visible);
  const name = clean(heading?.textContent || result.imageProduct).slice(0, 200);
  const path = new URL(location.href).pathname;
  const productPage = /\/(?:product|products|p)\//.test(path);
  if (!productPage) return { ...result, details: { productPage: false } };
  const codes = new Set();
  const products = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 12 || products.length > 80) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(v => visit(v, depth + 1)); return; }
    if ([].concat(value['@type'] || []).includes('Product') && clean(value.name).toLowerCase() === name.toLowerCase()) products.push(value);
    for (const [key, child] of Object.entries(value)) if (!['review', 'offers', 'aggregateRating'].includes(key)) visit(child, depth + 1);
  };
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 30)) if (script.textContent.length < 2000000) { try { visit(JSON.parse(script.textContent)); } catch {} }
  for (const product of products) for (const key of ['gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14']) if (typeof product[key] === 'string' && normalizeGtin(product[key])) codes.add(product[key].replace(/[\s-]/g, ''));
  const labels = [...document.querySelectorAll('main p, main li, main dd, main span, [itemprop="gtin12"], [itemprop="gtin13"], [itemprop="gtin14"]')].filter(n => visible(n) && n.children.length < 3 && n.textContent.length < 100);
  const raw = new Set();
  for (const label of labels) {
    const match = clean(label.textContent).match(/^(?:UPC(?:-A)?|GTIN(?:-?\d+)?|EAN)\s*:?\s*#?\s*([\d -]{8,22})$/i);
    const value = match ? match[1].replace(/[ -]/g, '') : label.getAttribute('itemprop')?.startsWith('gtin') ? label.getAttribute('content') || clean(label.textContent) : '';
    if (value) { raw.add(value); if (normalizeGtin(value)) codes.add(value); }
  }
  let retailerUpc = raw.size === 1 ? [...raw][0] : '', upcNote = '';
  // Meijer labels a shortened reorder code as UPC. Complete it only when the
  // checksum-valid barcode in the primary product image independently agrees.
  if (retailerUpc && /^\d{9,11}$/.test(retailerUpc) && /(^|\.)meijer\.com$/.test(new URL(location.href).hostname)) {
    const imageCode = result.thumbnail?.match(/\/(\d{12,14})(?:_|\.)/)?.[1];
    const base = retailerUpc.padStart(11, '0');
    const completed = Array.from({ length: 10 }, (_, digit) => base + digit).find(code => normalizeGtin(code));
    if (imageCode && normalizeGtin(imageCode) && normalizeGtin(imageCode) === normalizeGtin(completed)) { codes.add(completed); upcNote = 'Store searches use the displayed UPC unchanged. A full barcode verified from the product image is stored separately for matching.'; }
  }
  const normalized = new Set([...codes].map(normalizeGtin));
  const verifiedGtin = normalized.size === 1 ? [...codes][0] : '';
  const upc = retailerUpc || verifiedGtin;
  const brand = products.map(p => clean(typeof p.brand === 'string' ? p.brand : p.brand?.name)).find(Boolean) || '';
  const sizes = [...new Set(products.map(p => clean(p.size?.name || p.size || p.weight?.name)).filter(v => v && v !== '[object Object]'))];
  const size = (sizes.length === 1 ? sizes[0] : name.match(/\b\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|ounces?|lb|lbs|pounds?|gal|gallons?|ml|liters?|litres?|ct|count|pack)\b/i)?.[0] || (/\bgallon\b/i.test(name) ? '1 gallon' : '')).slice(0, 200);
  return { ...result, details: { name, brand, size, quantity: 1, upc, verifiedGtin, retailerUpc, upcNote, productPage } };
}
function extractSearchLinks() {
  const links = new Set();
  for (const node of document.querySelectorAll('a[href]')) {
    if (!node.getClientRects().length) continue;
    try { const url = new URL(node.getAttribute('href'), location.href); if (url.protocol === 'https:' && /\/(?:product|products|p)\//.test(url.pathname)) { url.hash = ''; links.add(url.href); } } catch {}
    if (links.size >= 12) break;
  }
  return [...links];
}
const { normalizeGtin } = require('./barcode.cjs');
module.exports = { extractProduct, extractThumbnail, extractDetails, extractSearchLinks, searchLinksScript: `(${extractSearchLinks.toString()})()`, extractScript: `(${extractDetails.toString()})((${extractThumbnail.toString()})((${extractProduct.toString()})()), (${normalizeGtin.toString()}))` };
