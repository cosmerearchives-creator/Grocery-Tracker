/* global grocery */
const $ = id => document.getElementById(id);
let cart, stores = [], editing, pending = 0;
let notificationTimer;
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
  const priced = items.filter(i => i.offers[id]);
  return { count: items.length, matched: priced.length, reviews: priced.filter(i => i.offers[id].needsReview).length, cents: priced.reduce((n, i) => n + i.quantity * i.offers[id].packs * i.offers[id].cents, 0) };
}
function render() {
  if (!cart) return;
  $('stores').replaceChildren(); $('cart-tabs').replaceChildren();
  for (const store of stores) {
    const total = summary(store.id);
    const card = el('article', undefined, 'store-card' + (selectedStore === store.id ? ' best' : ''));
    card.append(el('div', store.name, 'store-name'), el('div', `${total.count} ITEMS · ${total.reviews} NEED REVIEW`, 'badge'), el('div', format(total.cents), 'total'), el('p', `${total.matched} of ${total.count} items priced · ${total.matched < total.count ? 'partial' : 'estimated'} subtotal`, 'coverage'));
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
    const qty = el('div', undefined, 'quantity');
    const minus = button('−', () => change({ type: 'quantity', id: item.id, delta: -1 })); minus.disabled = item.quantity === 1; minus.setAttribute('aria-label', `Decrease ${item.name}`);
    const plus = button('+', () => change({ type: 'quantity', id: item.id, delta: 1 })); plus.disabled = item.quantity === 999; plus.setAttribute('aria-label', `Increase ${item.name}`); qty.append(minus, el('span', item.quantity), plus);
    const search = button('Search all 4 stores ↗', () => grocery.searchStores([item.name, /^(choose|compare)\b/i.test(item.size) ? '' : item.size].filter(Boolean).join(' '), item.id), 'search-stores');
    top.append(detail, search, qty, button('Remove', () => change({ type: 'remove', id: item.id }), 'remove')); row.append(top);
    const price = item.offers[item.store], block = el('div', undefined, 'store-price');
    const edit = button('', () => openPrice(item), 'offer' + (price ? ' has-price' : ''));
    edit.append(el('span', stores.find(s => s.id === item.store).name, 'offer-store'), el('strong', price ? format(price.cents * price.packs * item.quantity) : '+ Add / look up price'));
    if (price) {
      edit.append(el('span', price.product, 'product'), el('span', `${format(price.cents)} per package · ${price.packs} package(s) × ${item.quantity}`, 'source'), el('span', `${price.source === 'shelf' ? 'Shelf / receipt verified' : price.source === 'web-estimate' ? 'Online estimate' : 'Manual estimate'} · ${new Date(price.checked).toLocaleDateString()}`, 'source'));
      if (price.needsReview) edit.append(el('span', 'Needs review', 'review-badge'));
    } else edit.append(el('span', 'Not included in subtotal', 'source'));
    block.append(edit);
    if (price?.needsReview) block.append(button('Mark reviewed', () => change({ type: 'review', id: item.id }), 'mark-reviewed'));
    row.append(block); $('items').append(row);
  }
}
function openPrice(item) {
  editing = { id: item.id, store: item.store };
  grocery.setCaptureTarget(item.id).catch(e => message(e.message));
  const offer = item.offers[item.store];
  $('price-store').textContent = stores.find(s => s.id === item.store).name; $('price-item').textContent = item.name;
  $('offer-product').value = offer?.product || `${item.name} — ${item.size}`;
  $('offer-price').value = offer ? (offer.cents / 100).toFixed(2) : ''; $('offer-packs').value = offer?.packs || 1;
  $('offer-source').value = offer?.source || 'manual'; $('offer-url').value = offer?.url || '';
  $('offer-confirm').checked = false; $('lookup-status').textContent = ''; $('delete-offer').disabled = !offer;
  if (!$('price-dialog').open) $('price-dialog').showModal();
}
$('add-form').onsubmit = async event => {
  event.preventDefault(); const name = $('new-name').value.trim(); if (!name) return;
  try { await change({ type: 'add', name, size: $('new-size').value, store: $('new-store').value, match: $('new-match').value }); $('new-name').value = ''; $('new-size').value = ''; $('new-name').focus(); } catch {}
};
$('new-store').onchange = event => selectStore(event.target.value);
$('close-price').onclick = () => $('price-dialog').close();
$('delete-offer').onclick = async () => { try { await change({ type: 'remove-offer', id: editing.id }); $('price-dialog').close(); } catch {} };
$('price-form').onsubmit = async event => {
  event.preventDefault();
  try {
    await change({ type: 'offer', id: editing.id, offer: { cents: Math.round(Number($('offer-price').value) * 100), packs: Number($('offer-packs').value), product: $('offer-product').value.trim(), source: $('offer-source').value, url: $('offer-url').value.trim(), checked: new Date().toISOString() } });
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
