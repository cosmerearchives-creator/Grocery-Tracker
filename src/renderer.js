/* global grocery */
const $ = id => document.getElementById(id);
let cart, stores = [], editing, pending = 0;
let notificationTimer;
let editingSearch;
const chosenSearches = new Map();
const expandedAlternatives = new Set();
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
function selectStore(id) { selectedStore = id; localStorage.setItem('cart-store', id); $('new-store').value = id; render(); }
function summary(id) {
  const items = cart.items.filter(i => i.store === id);
  const options = items.filter(i => i.available).flatMap(i => i.priceOptions);
  const selected = options.filter(o => o.quantity > 0);
  const missing = items.filter(i => i.available && !i.offers[id] && i.quantity > 0).length;
  return { count: selected.length + missing, matched: selected.length, reviews: options.filter(o => o.needsReview).length, unavailable: items.filter(i => !i.available).length, cents: selected.reduce((n, o) => n + o.quantity * o.packs * o.cents, 0) };
}
function render() {
  if (!cart) return;
  $('stores').replaceChildren(); $('cart-tabs').replaceChildren();
  for (const store of stores) {
    const total = summary(store.id);
    const card = el('article', undefined, 'store-card' + (selectedStore === store.id ? ' best' : ''));
    card.append(el('div', store.name, 'store-name'), el('div', `${total.count} SELECTIONS · ${total.reviews} NEED REVIEW`, 'badge'), el('div', format(total.cents), 'total'), el('p', `${total.matched} of ${total.count} selections priced · ${total.unavailable} unavailable`, 'coverage'));
    card.append(button('View cart', () => selectStore(store.id)), button('Sign in / choose Marion ↗', () => grocery.openStore(store.id), 'store-open'));
    $('stores').append(card);
    const tab = button(store.name, () => selectStore(store.id), selectedStore === store.id ? 'primary' : ''); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(selectedStore === store.id)); $('cart-tabs').append(tab);
  }
  const items = cart.items.filter(i => i.store === selectedStore);
  $('count').textContent = items.length;
  $('cart-title').textContent = (stores.find(s => s.id === selectedStore)?.name || '') + ' cart';
  $('empty').hidden = !!items.length; $('items').replaceChildren();
  for (const item of items) {
    const row = el('article', undefined, 'item'); row.dataset.itemId = item.id;
    const top = el('div', undefined, 'item-top'), detail = el('div', undefined, 'item-detail');
    detail.append(el('h3', item.name));
    const prefs = el('div', undefined, 'preferences');
    const size = el('input'); size.value = item.size; size.maxLength = 200; size.placeholder = 'Size / variety'; size.setAttribute('aria-label', `${item.name}: size or variety`);
    const match = el('select'); for (const [value, label] of [['exact', 'Exact brand'], ['equivalent', 'Any comparable brand']]) { const o = el('option', label); o.value = value; match.append(o); } match.value = item.match; match.setAttribute('aria-label', `${item.name}: match preference`);
    const updateDetails = () => change({ type: 'details', id: item.id, size: size.value.trim(), match: match.value }).catch(() => {});
    size.onchange = updateDetails; match.onchange = updateDetails; prefs.append(size, match); detail.append(prefs);
    const searchOptions = el('select'); searchOptions.className = 'search-choice'; searchOptions.setAttribute('aria-label', `${item.name}: search product or UPC`);
    for (const [index, product] of [{ name: item.name, upc: item.upc }, ...(item.alternatives || [])].entries()) {
      const option = el('option', index ? `Alternative: ${product.name}` : `Name: ${product.name}`); option.value = `name-${index}`; searchOptions.append(option);
      if (product.upc) { const code = el('option', `UPC ${product.upc} · ${product.name}`); code.value = `upc-${index}`; searchOptions.append(code); }
    }
    searchOptions.value = chosenSearches.get(item.id) || 'name-0'; if (!searchOptions.value) searchOptions.value = 'name-0'; searchOptions.onchange = () => chosenSearches.set(item.id, searchOptions.value);
    const search = button('Search all 3 stores ↗', () => grocery.searchStores('', item.id, searchOptions.value), 'search-stores');
    top.append(detail, search, button('Remove', () => change({ type: 'remove', id: item.id }), 'remove')); row.append(top);
    const searchRow = el('div', undefined, 'search-options'); searchRow.append(searchOptions, button('Alternatives & UPC', () => openSearchDetails(item)));
    if (item.alternatives?.length) searchRow.append(el('span', `${item.alternatives.length} acceptable alternative(s)`, 'source'));
    row.append(searchRow);
    const options = el('div', undefined, 'offer-grid');
    for (const store of stores) {
      const related = cart.items.find(i => i.originId === item.originId && i.store === store.id);
      const block = el('div', undefined, 'store-option'); block.dataset.store = store.id;
      const unavailable = related?.available === false;
      block.append(el('div', store.name, 'store-option-title'));
      if (unavailable) block.append(el('span', 'Not available at this store', 'unavailable-badge'));
      const primaryIndex = related?.priceOptions.findIndex(o => !o.isAlternative) ?? -1;
      if (primaryIndex >= 0) block.append(productCard(related, related.priceOptions[primaryIndex], primaryIndex, store));
      else {
        const empty = el('div', undefined, 'empty-option');
        empty.append(button('+ Add / look up price', () => openPrice(related || item, store.id)), el('span', unavailable ? 'Excluded from this store’s total' : 'No main product price saved', 'source'), quantityControls(item, related, undefined, store));
        block.append(empty);
      }
      const alternatives = related?.priceOptions.map((quote, index) => ({ quote, index })).filter(o => o.quote.isAlternative) || [];
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
      block.append(el('p', `Selected here: ${format(selectedTotal)}`, 'selection-total'), button('Search this store ↗', () => grocery.searchStore(store.id, item.id, searchOptions.value), 'search-this-store'), button(unavailable ? 'Clear not available' : 'Not available at this store', () => change({ type: 'availability', id: item.id, store: store.id, available: unavailable }), 'availability-toggle'));
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
  const heading = el('div', undefined, 'product-option-heading'); heading.append(el('span', quote.isAlternative ? 'Alternative' : 'Main option', 'offer-store'), quantityControls(item, item, index, store));
  card.append(heading, button(quote.product, () => openPrice(item, store.id, index), 'product-name'), el('strong', format(quote.cents) + ' / package', 'option-price'), el('span', `${quote.packs} package(s) per quantity · ${!item.available ? 'Excluded while marked not available' : quote.quantity > 0 ? format(quote.cents * quote.packs * quote.quantity) + ' selected' : 'Saved only · quantity 0'}`, 'source'));
  card.append(el('span', `${quote.source === 'shelf' ? 'Shelf / receipt verified' : quote.source === 'web-estimate' ? 'Online estimate' : 'Manual estimate'} · ${new Date(quote.checked).toLocaleDateString()}`, 'source'));
  const main = item.priceOptions.find(o => !o.isAlternative);
  if (quote.isAlternative && main && main.cents !== quote.cents) card.append(el('span', `${format(Math.abs(main.cents - quote.cents))} ${quote.cents < main.cents ? 'less' : 'more'} per listed package than the main option`, 'source'));
  if (quote.needsReview) card.append(el('span', 'Needs review', 'review-badge'), button('Mark reviewed', () => change({ type: 'review', id: item.id, index }), 'mark-reviewed'));
  return card;
}
function parseAlternatives(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, upc = '', ...extra] = line.split('|').map(part => part.trim());
    if (extra.length) throw Error('Use one alternative per line: product name | optional UPC.');
    return { name, upc };
  });
}
function openSearchDetails(item) {
  editingSearch = item.id; $('search-item').textContent = item.name; $('item-upc').value = item.upc || '';
  $('item-alternatives').value = (item.alternatives || []).map(a => a.name + (a.upc ? ' | ' + a.upc : '')).join('\n');
  $('search-error').textContent = ''; $('search-dialog').showModal();
}
$('close-search').onclick = () => $('search-dialog').close();
$('search-form').onsubmit = async event => {
  event.preventDefault();
  try { await change({ type: 'search-details', id: editingSearch, upc: $('item-upc').value.trim(), alternatives: parseAlternatives($('item-alternatives').value) }); $('search-dialog').close(); }
  catch (e) { $('search-error').textContent = e.message; }
};
function openPrice(item, store = item.store, index) {
  editing = { id: item.id, store, index };
  grocery.setCaptureTarget(item.id).catch(e => message(e.message));
  const offer = index === undefined ? item.offers[store] : item.priceOptions[index];
  $('price-store').textContent = stores.find(s => s.id === store).name; $('price-item').textContent = item.name;
  $('offer-product').value = offer?.product || `${item.name} — ${item.size}`;
  $('offer-price').value = offer ? (offer.cents / 100).toFixed(2) : ''; $('offer-packs').value = offer?.packs || 1;
  $('offer-source').value = offer?.source || 'manual'; $('offer-url').value = offer?.url || '';
  $('offer-confirm').checked = false; $('lookup-status').textContent = ''; $('delete-offer').disabled = !offer;
  if (!$('price-dialog').open) $('price-dialog').showModal();
}
$('add-form').onsubmit = async event => {
  event.preventDefault(); const name = $('new-name').value.trim(); if (!name) return;
  try { await change({ type: 'add', name, size: $('new-size').value, store: $('new-store').value, match: $('new-match').value, upc: $('new-upc').value.trim(), alternatives: parseAlternatives($('new-alternatives').value) }); $('new-name').value = ''; $('new-size').value = ''; $('new-upc').value = ''; $('new-alternatives').value = ''; $('new-name').focus(); } catch {}
};
$('new-store').onchange = event => selectStore(event.target.value);
$('close-price').onclick = () => $('price-dialog').close();
$('delete-offer').onclick = async () => { try { await change({ type: 'remove-offer', id: editing.id, index: editing.index }); $('price-dialog').close(); } catch {} };
$('price-form').onsubmit = async event => {
  event.preventDefault();
  try {
    await change({ type: 'offer', id: editing.id, store: editing.store, index: editing.index, offer: { cents: Math.round(Number($('offer-price').value) * 100), packs: Number($('offer-packs').value), product: $('offer-product').value.trim(), source: $('offer-source').value, url: $('offer-url').value.trim(), checked: new Date().toISOString() } });
    $('price-dialog').close();
  } catch {}
};
$('lookup').onclick = async () => {
  const context = editing; $('lookup').disabled = true; $('lookup-status').textContent = 'Detecting product price…';
  try {
    const result = await grocery.capture(context.store, $('offer-url').value.trim()); if (editing !== context) return;
    if (result.candidates.length !== 1) { $('lookup-status').textContent = result.reason; return; }
    const p = result.candidates[0]; $('offer-product').value = p.product; $('offer-price').value = (p.cents / 100).toFixed(2); $('offer-packs').value = 1; $('offer-url').value = result.url; $('offer-source').value = 'web-estimate'; $('offer-confirm').checked = false; $('lookup-status').textContent = `Detected ${format(p.cents)}. Check the package and save.`;
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
  cart = data.cart; stores = list; if (!stores.some(s => s.id === selectedStore)) selectedStore = 'meijer'; $('version').textContent = 'VERSION ' + data.version;
  for (const store of stores) for (const id of ['new-store', 'export-store']) { const option = el('option', store.name); option.value = store.id; $(id).append(option); }
  $('new-store').value = selectedStore; render();
  if (data.loadError) message('Your previous cart could not be read. A backup was preserved locally.');
}).catch(e => message('Could not load your cart: ' + e.message));
