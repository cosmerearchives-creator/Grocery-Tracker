/* global grocery */
const $ = id => document.getElementById(id);
let cart, stores = [], editing, pending = 0;
let notificationTimer;
let listOperation = false;
let refreshRunning = false;
let importRunning = false;
let groupCategories = localStorage.getItem('group-categories') !== 'false';
const defaultCategories = ['Fruit', 'Vegetables', 'Dairy', 'Meat', 'Seafood', 'Bakery', 'Frozen', 'Pantry', 'Drinks', 'Household', 'Other'];
const expandedAlternatives = new Set();
let comparisons = localStorage.getItem('cart-comparisons') === 'true';
let renderGeneration = 0;
let selectedStore = localStorage.getItem('cart-store') || 'meijer';
const format = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
function message(text) { clearTimeout(notificationTimer); $('message').textContent = text; $('message').hidden = false; notificationTimer = setTimeout(() => { $('message').hidden = true; }, 6500); }
function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.onclick = () => Promise.resolve().then(action).catch(e => message(e.message)); return b; }
async function change(command) {
  pending++; $('save-status').textContent = 'Saving…';
  try { await grocery.change(command); }
  catch (e) { message(e.message); throw e; }
  finally { pending--; $('save-status').textContent = pending ? 'Saving…' : 'Saved on this computer'; }
}
function selectStore(id) {
  selectedStore = id; localStorage.setItem('cart-store', id);
  if (id !== 'all') { comparisons = false; localStorage.setItem('cart-comparisons', 'false'); $('export-store').value = id; }
  render();
}
function showRefresh(state) {
  refreshRunning = state.running;
  listButtons();
  $('refresh-prices').disabled = state.running || listOperation || importRunning;
  $('refresh-thumbnails').disabled = state.running || listOperation || importRunning;
  $('empty-carts').disabled = state.running || listOperation || importRunning;
  $('cancel-refresh').hidden = !state.running;
  $('add-link').disabled = state.running || listOperation || importRunning;
  $('refresh-status').textContent = state.text; $('refresh-status').hidden = !state.text;
}
function summary(id) {
  const items = cart.items.filter(i => i.store === id);
  const options = items.filter(i => i.available).flatMap(i => i.priceOptions);
  const selected = options.filter(o => o.quantity > 0);
  const missing = items.filter(i => i.available && !i.offers[id] && i.quantity > 0).length;
  return { count: selected.length + missing, matched: selected.length, reviews: options.filter(o => o.needsReview).length, unavailable: items.filter(i => !i.available).length, cents: selected.reduce((n, o) => n + o.quantity * o.packs * o.cents, 0) };
}
async function render() {
  if (!cart) return;
  const generation = ++renderGeneration;
  let view;
  try { view = await grocery.cartView(selectedStore, comparisons); } catch (e) { message(e.message); return; }
  if (generation !== renderGeneration) return;
  $('cart-tabs').replaceChildren(); $('store-links').replaceChildren();
  let combinedCents = 0;
  for (const store of stores) {
    const total = summary(store.id); combinedCents += total.cents;
    const tab = button('', () => selectStore(store.id), 'cart-link' + (selectedStore === store.id ? ' selected' : ''));
    tab.dataset.store = store.id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(selectedStore === store.id)); tab.setAttribute('aria-label', store.name);
    const mark = el('span', store.id === 'meijer' ? 'm' : store.id === 'aldi' ? 'ALDI' : 'GFS', 'store-mark mark-' + store.id); mark.setAttribute('aria-hidden', 'true');
    const amount = el('span', format(total.cents), 'cart-amount'); amount.id = 'cart-total-' + store.id; tab.setAttribute('aria-describedby', amount.id); tab.append(mark, amount);
    tab.title = `${store.name}: ${format(total.cents)} estimated known subtotal · ${total.matched} of ${total.count} selections priced · ${total.reviews} need review · ${total.unavailable} unavailable`;
    $('cart-tabs').append(tab);
    $('store-links').append(button(store.name + ' ↗', () => grocery.openStore(store.id), 'store-open'));
  }
  const allTab = button('', () => selectStore('all'), 'cart-link' + (selectedStore === 'all' ? ' selected' : ''));
  allTab.dataset.store = 'all'; allTab.setAttribute('role', 'tab'); allTab.setAttribute('aria-selected', String(selectedStore === 'all')); allTab.setAttribute('aria-label', 'All carts'); allTab.title = 'All carts · combined estimated known subtotal';
  const allAmount = el('span', format(combinedCents), 'cart-amount'); allAmount.id = 'cart-total-all'; allTab.setAttribute('aria-describedby', allAmount.id); allTab.append(el('span', 'Total', 'store-mark mark-all'), allAmount); $('cart-tabs').append(allTab);
  const items = [...view.rows];
  const categoryName = item => item.category?.trim() || 'Uncategorized';
  if (groupCategories) items.sort((a, b) => { const x = categoryName(a), y = categoryName(b); return (x === 'Uncategorized') - (y === 'Uncategorized') || x.localeCompare(y, 'en', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
  if (document.activeElement !== $('list-name')) $('list-name').value = cart.listName || '';
  $('group-categories').checked = groupCategories;
  $('category-choices').replaceChildren(...[...new Set([...defaultCategories, ...cart.items.map(i => i.category).filter(Boolean)])].sort().map(name => { const option = el('option'); option.value = name; return option; }));
  $('show-comparisons').checked = view.compare; $('show-comparisons').disabled = selectedStore === 'all';
  $('count').textContent = items.length;
  $('cart-title').textContent = selectedStore === 'all' ? 'All carts' : (stores.find(s => s.id === selectedStore)?.name || '') + ' cart';
  $('empty').hidden = !!items.length; $('items').replaceChildren();
  let lastCategory;
  for (const item of items) {
    if (groupCategories && categoryName(item) !== lastCategory) { lastCategory = categoryName(item); $('items').append(el('h3', lastCategory, 'category-heading')); }
    const row = el('article', undefined, 'item'); row.dataset.itemId = item.id;
    const top = el('div', undefined, 'item-top');
    top.append(el('h3', item.name));
    const category = el('input'); category.value = item.category || ''; category.maxLength = 60; category.placeholder = 'Uncategorized'; category.setAttribute('list', 'category-choices'); category.setAttribute('aria-label', `${item.name}: category`); category.className = 'item-category';
    category.onchange = () => change({ type: 'category', id: item.id, category: category.value }).catch(() => {});
    const label = el('label', 'Category', 'category-label'); label.append(category);
    const search = button('Search all 3 stores ↗', () => grocery.searchStores('', item.id, item.upc ? 'upc-0' : 'name-0'), 'search-stores');
    top.append(label, search); row.append(top);
    if (item.upc || item.retailerUpc) { const code = el('p', 'UPC: ' + (item.upc || item.retailerUpc), 'barcode-details'); code.title = item.barcodeNote || ''; row.append(code); }
    const options = el('div', undefined, 'offer-grid' + (view.compare ? '' : ' single-store'));
    for (const store of stores.filter(s => view.storeIds.includes(s.id))) {
      const related = cart.items.find(i => i.originId === item.originId && i.store === store.id);
      const block = el('div', undefined, 'store-option'); block.dataset.store = store.id;
      const unavailable = related?.available === false;
      block.append(el('div', store.name, 'store-option-title'));
      if (related?.importNote && !related.priceOptions.length) block.append(el('div', related.importNote, 'import-note'));
      if (unavailable) block.append(el('span', 'Not available at this store', 'unavailable-badge'));
      const primaryIndex = related?.priceOptions.findIndex(o => !o.isAlternative) ?? -1;
      if (primaryIndex >= 0) block.append(productCard(related, related.priceOptions[primaryIndex], primaryIndex, store));
      else if (!related?.priceOptions.some(o => o.purchaseKind)) {
        const empty = el('div', undefined, 'empty-option');
        empty.append(button('+ Add / look up price', () => openPrice(related || item, store.id)), el('span', unavailable ? 'Excluded from this store’s total' : 'No main product price saved', 'source'), quantityControls(item, related, undefined, store));
        block.append(empty);
      }
      for (const [index, quote] of (related?.priceOptions || []).entries()) if (quote.purchaseKind && index !== primaryIndex) block.append(productCard(related, quote, index, store));
      const alternatives = related?.priceOptions.map((quote, index) => ({ quote, index })).filter(o => o.quote.isAlternative && !o.quote.purchaseKind) || [];
      if (alternatives.length) {
        const key = `${item.originId}:${store.id}`, selected = alternatives.filter(o => o.quote.quantity > 0).length;
        const toggle = button(`Alternatives (${alternatives.length})${selected ? ` · ${selected} selected` : ''} ${expandedAlternatives.has(key) ? '▴' : '▾'}`, () => { if (expandedAlternatives.has(key)) expandedAlternatives.delete(key); else expandedAlternatives.add(key); render(); }, 'alternatives-toggle');
        toggle.setAttribute('aria-expanded', String(expandedAlternatives.has(key))); block.append(toggle);
        if (expandedAlternatives.has(key)) {
          const list = el('div', undefined, 'alternatives-list');
          for (const option of alternatives) list.append(productCard(related, option.quote, option.index, store));
          block.append(list);
        }
      }
      const selectedTotal = unavailable ? 0 : (related?.priceOptions || []).reduce((n, o) => n + o.cents * o.packs * o.quantity, 0);
      block.append(el('p', `Selected here: ${format(selectedTotal)}`, 'selection-total'), button('Search this store ↗', () => grocery.searchStore(store.id, item.id, item.upc ? 'upc-0' : 'name-0'), 'search-this-store'), button(unavailable ? 'Clear not available' : 'Not available at this store', () => change({ type: 'availability', id: item.id, store: store.id, available: unavailable }), 'availability-toggle'));
      if (related) block.append(button('Remove from this cart', () => change({ type: 'remove', id: related.id }), 'remove'));
      options.append(block);
    }
    row.append(options); $('items').append(row);
  }
}
function quantityControls(source, item, index, store) {
  const quote = index === undefined ? undefined : item.priceOptions[index];
  const value = quote ? quote.quantity : item?.quantity || 0;
  const label = `${quote?.product || source.name} at ${store.name}`;
  const control = el('div', undefined, 'quantity');
  const adjust = async delta => {
    let target = item;
    if (!target) { await change({ type: 'ensure-store', id: source.id, store: store.id }); target = cart.items.find(i => i.originId === source.originId && i.store === store.id); }
    await change({ type: quote ? 'option-quantity' : 'quantity', id: target.id, index, delta });
  };
  const minus = button('−', () => adjust(-1)), plus = button('+', () => adjust(1));
  minus.disabled = value === 0 || item?.available === false; plus.disabled = value === 999 || item?.available === false;
  minus.setAttribute('aria-label', `Decrease ${label}`); plus.setAttribute('aria-label', `Increase ${label}`);
  control.append(minus, el('span', value), plus); return control;
}
function productCard(item, quote, index, store) {
  const card = el('div', undefined, 'product-option' + (item.available ? '' : ' unavailable')); card.dataset.option = index;
  const heading = el('div', undefined, 'product-option-heading'); heading.append(el('span', quote.purchaseKind ? `${quote.isAlternative && quote.purchaseKind !== 'case' ? 'Alternative · ' : ''}${quote.purchaseKind === 'case' ? 'Bulk' : 'Single item'} · ${quote.purchaseUnit}` : quote.isAlternative ? 'Alternative' : 'Main option', 'offer-store'), quantityControls(item, item, index, store));
  card.append(heading, button(quote.product, () => openPrice(item, store.id, index), 'product-name'), el('strong', format(quote.cents) + ' / ' + (quote.purchaseUnit || 'package'), 'option-price'), el('span', `${quote.packs} package(s) per quantity · ${!item.available ? 'Excluded while marked not available' : quote.quantity > 0 ? format(quote.cents * quote.packs * quote.quantity) + ' selected' : 'Saved only · quantity 0'}`, 'source'));
  card.append(el('span', `${quote.source === 'shelf' ? 'Shelf / receipt verified' : quote.source === 'web-estimate' ? 'Online estimate' : 'Manual estimate'} · ${new Date(quote.checked).toLocaleDateString()}`, 'source'));
  if (quote.lastRefreshAttempt) card.append(el('span', `${quote.refreshError ? 'Last attempt' : 'Price checked'}: ${new Date(quote.lastRefreshAttempt).toLocaleString()}`, 'source'));
  if (quote.refreshError) card.append(el('span', `Couldn’t refresh: ${quote.refreshError}`, 'refresh-error'));
  if (quote.refreshDetectedProduct && quote.refreshDetectedProduct !== quote.product) card.append(el('span', `Page describes: ${quote.refreshDetectedProduct}`, 'source'));
  const main = item.priceOptions.find(o => !o.isAlternative);
  if (quote.isAlternative && !quote.purchaseKind && main && main.cents !== quote.cents) card.append(el('span', `${format(Math.abs(main.cents - quote.cents))} ${quote.cents < main.cents ? 'less' : 'more'} per listed package than the main option`, 'source'));
  if (quote.purchaseUnavailable) card.append(el('span', 'This purchase option is marked out of stock. Check the store before buying.', 'refresh-error'));
  if (quote.needsReview) card.append(el('span', 'Needs review', 'review-badge'), button('Mark reviewed', () => change({ type: 'review', id: item.id, index }), 'mark-reviewed'));
  const metadata = el('div', undefined, 'product-metadata');
  const notes = [...card.querySelectorAll('.source, .refresh-error')];
  const text = el('div', undefined, 'product-notes');
  for (const note of notes) text.append(note);
  metadata.append(text);
  if (quote.thumbnailError) text.append(el('span', `Thumbnail: ${quote.thumbnailError}`, 'refresh-error'));
  if (quote.thumbnail) {
    metadata.classList.add('has-thumbnail');
    const image = el('img', undefined, 'product-thumbnail'); image.alt = quote.product; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.onerror = () => { image.hidden = true; metadata.classList.remove('has-thumbnail'); }; image.src = quote.thumbnail; metadata.append(image);
  }
  card.insertBefore(metadata, card.querySelector('.review-badge'));
  return card;
}
function openPrice(item, store = item.store, index) {
  editing = { id: item.id, store, index };
  grocery.setCaptureTarget(item.id).catch(e => message(e.message));
  const offer = index === undefined ? item.offers[store] : item.priceOptions[index];
  $('price-store').textContent = stores.find(s => s.id === store).name; $('price-item').textContent = item.name;
  editing.thumbnail = offer?.thumbnail || '';
  $('offer-product').value = offer?.product || `${item.name} — ${item.size}`;
  $('offer-price').value = offer ? (offer.cents / 100).toFixed(2) : ''; $('offer-packs').value = offer?.packs || 1;
  $('offer-source').value = offer?.source || 'manual'; $('offer-url').value = offer?.url || item.pendingUrl || '';
  $('offer-confirm').checked = false; $('lookup-status').textContent = ''; $('delete-offer').disabled = !offer;
  if (!$('price-dialog').open) $('price-dialog').showModal();
}
function listButtons() {
  for (const id of ['new-list', 'save-list', 'load-list', 'list-name']) $(id).disabled = listOperation || refreshRunning || importRunning;
}
async function listFile(action, name) {
  if (listOperation) return;
  listOperation = true; listButtons();
  $('refresh-prices').disabled = true; $('refresh-thumbnails').disabled = true; $('empty-carts').disabled = true;
  try {
    const result = await grocery.listFile(action, name);
    if (result.replaced) { editing = null; expandedAlternatives.clear(); $('price-dialog').close(); $('thumbnail-dialog').close(); $('import-form').reset(); $('browse-form').reset(); }
    if (result.message) { $('list-status').textContent = result.message + (result.file ? ' ' + result.file : result.backup ? ' Backup: ' + result.backup : ''); message(result.message); }
  } catch (e) { message(e.message); }
  finally { listOperation = false; listButtons(); $('refresh-prices').disabled = refreshRunning; $('refresh-thumbnails').disabled = refreshRunning; $('empty-carts').disabled = refreshRunning; }
}
function showImport(state) {
  importRunning = !!state.running; listButtons();
  $('import-status').textContent = state.text || ''; $('import-status').hidden = !state.text;
  $('cancel-import').hidden = !importRunning;
  for (const id of ['add-link', 'search-items', 'refresh-prices', 'refresh-thumbnails', 'empty-carts']) $(id).disabled = importRunning || refreshRunning || listOperation;
}
$('add-link').onclick = () => { $('import-url').value = ''; $('import-category').value = ''; $('import-dialog').showModal(); };
$('cancel-link').onclick = () => $('import-dialog').close();
$('import-form').onsubmit = async event => {
  event.preventDefault(); const url = $('import-url').value.trim(), category = $('import-category').value.trim(); $('import-dialog').close();
  try { const result = await grocery.importProduct(url, category); message(result.message); } catch (e) { message(e.message); }
};
$('cancel-import').onclick = () => grocery.cancelImport().catch(e => message(e.message));
$('search-items').onclick = () => { $('browse-query').value = ''; $('browse-dialog').showModal(); };
$('cancel-browse').onclick = () => $('browse-dialog').close();
$('browse-form').onsubmit = async event => { event.preventDefault(); try { await grocery.searchStores($('browse-query').value.trim()); $('browse-dialog').close(); } catch (e) { message(e.message); } };
grocery.onImport(showImport);
$('list-name').onchange = () => change({ type: 'list-name', name: $('list-name').value.trim() || 'Untitled list' }).catch(() => {});
$('new-list').onclick = () => { $('new-list-name').value = ''; $('new-list-dialog').showModal(); };
$('cancel-new-list').onclick = () => $('new-list-dialog').close();
$('new-list-form').onsubmit = event => { event.preventDefault(); $('new-list-dialog').close(); listFile('new', $('new-list-name').value); };
$('save-list').onclick = () => listFile('save');
$('load-list').onclick = () => listFile('load');
$('group-categories').onchange = event => { groupCategories = event.target.checked; localStorage.setItem('group-categories', String(groupCategories)); render(); };
$('empty-carts').onclick = () => grocery.emptyCarts().catch(e => message(e.message));
$('refresh-thumbnails').onclick = () => $('thumbnail-dialog').showModal();
$('cancel-thumbnails').onclick = () => $('thumbnail-dialog').close();
$('confirm-thumbnails').onclick = () => { $('thumbnail-dialog').close(); grocery.refreshThumbnails().catch(e => message(e.message)); };
$('show-comparisons').onchange = event => { comparisons = event.target.checked; localStorage.setItem('cart-comparisons', String(comparisons)); render(); };
$('refresh-prices').onclick = () => grocery.refreshPrices().catch(e => message(e.message));
$('cancel-refresh').onclick = () => grocery.cancelPriceRefresh().catch(e => message(e.message));
grocery.onPriceRefresh(showRefresh);
$('offer-url').oninput = () => { if (editing) editing.lookupGroup = null; };
$('close-price').onclick = () => $('price-dialog').close();
$('delete-offer').onclick = async () => { try { await change({ type: 'remove-offer', id: editing.id, index: editing.index }); $('price-dialog').close(); } catch {} };
$('price-form').onsubmit = async event => {
  event.preventDefault();
  try {
    if (editing.lookupGroup) {
      const result = structuredClone(editing.lookupGroup);
      Object.assign(result.candidates[0], { cents: Math.round(Number($('offer-price').value) * 100), packs: Number($('offer-packs').value), product: $('offer-product').value.trim() });
      await change({ type: 'detected-offers', id: editing.id, store: editing.store, result });
    } else await change({ type: 'offer', id: editing.id, store: editing.store, index: editing.index, offer: { ...(editing.thumbnail ? { thumbnail: editing.thumbnail } : {}), cents: Math.round(Number($('offer-price').value) * 100), packs: Number($('offer-packs').value), product: $('offer-product').value.trim(), source: $('offer-source').value, url: $('offer-url').value.trim(), checked: new Date().toISOString() } });
    $('price-dialog').close();
  } catch {}
};
$('lookup').onclick = async () => {
  const context = editing; editing.lookupGroup = null; $('lookup').disabled = true; $('lookup-status').textContent = 'Detecting product price…';
  try {
    const result = await grocery.capture(context.store, $('offer-url').value.trim()); if (editing !== context) return;
    if (result.candidates.length !== 1 && !(context.store === 'gfs' && result.purchaseOptions && result.candidates.length === 2)) { $('lookup-status').textContent = result.reason; return; }
    editing.lookupGroup = context.store === 'gfs' && result.purchaseOptions ? result : null;
    const p = result.candidates[0]; editing.thumbnail = result.thumbnail || ''; $('offer-product').value = p.product; $('offer-price').value = (p.cents / 100).toFixed(2); $('offer-packs').value = 1; $('offer-url').value = result.url; $('offer-source').value = 'web-estimate'; $('offer-confirm').checked = false; $('lookup-status').textContent = editing.lookupGroup?.candidates.length === 2 ? `Detected ${result.candidates.map(p => format(p.cents) + ' / ' + p.purchaseUnit).join(' and ')}. Saving keeps both for review; the case starts at quantity 0.` : `Detected ${format(p.cents)}. Check the package and save.`;
  } catch (e) { $('lookup-status').textContent = e.message; } finally { $('lookup').disabled = false; }
};
$('copy').onclick = () => grocery.export($('export-store').value, 'copy').then(message).catch(e => message(e.message));
$('export-file').onclick = () => grocery.export($('export-store').value, 'file').then(message).catch(e => message(e.message));
$('update').onclick = () => grocery.checkUpdate().catch(e => message(e.message));
$('install').onclick = () => grocery.installUpdate().catch(e => message(e.message));
grocery.onUpdate(status => { $('update-status').textContent = status.text; $('install').hidden = !status.ready; });
grocery.onCartChanged(value => { cart = value; render(); });
window.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
Promise.all([grocery.load(), grocery.stores()]).then(([data, list]) => {
  cart = data.cart; stores = list; if (selectedStore !== 'all' && !stores.some(s => s.id === selectedStore)) selectedStore = 'meijer'; $('version').textContent = 'VERSION ' + data.version;
  for (const store of stores) for (const id of ['export-store']) { const option = el('option', store.name); option.value = store.id; $(id).append(option); }
  $('export-store').value = selectedStore === 'all' ? stores[0].id : selectedStore; render();
  showRefresh(data.refreshState); showImport(data.importState || {});
  if (data.loadError) message('Your previous cart could not be read. A backup was preserved locally.');
}).catch(e => message('Could not load your cart: ' + e.message));
