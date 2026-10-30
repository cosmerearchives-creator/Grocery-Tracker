/* global grocery */
const $ = id => document.getElementById(id);
let cart, stores, editing, saveChain = Promise.resolve(), saving = false;
const format = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
function message(text) { $('message').textContent = text; $('message').hidden = false; }
function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', () => Promise.resolve().then(action).catch(e => message(e.message))); return b; }
function summary(store) {
  let cents = 0, matched = 0;
  for (const item of cart.items) { const o = item.offers[store]; if (o) { cents += item.quantity * o.packs * o.cents; matched++; } }
  return { cents, matched, complete: cart.items.length > 0 && matched === cart.items.length };
}
function save() {
  const snapshot = JSON.parse(JSON.stringify(cart));
  $('save-status').textContent = 'Saving…'; saving = true;
  saveChain = saveChain.catch(() => {}).then(() => grocery.save(snapshot));
  const thisSave = saveChain;
  thisSave.then(() => { if (saveChain === thisSave) { saving = false; $('save-status').textContent = 'Saved on this computer'; } }, e => { saving = false; $('save-status').textContent = 'Save failed — keep the app open'; message(e.message); });
  return thisSave;
}
function render() {
  const totals = stores.map(s => ({ ...s, ...summary(s.id) }));
  const complete = totals.filter(t => t.complete);
  const lowest = complete.length ? Math.min(...complete.map(t => t.cents)) : null;
  $('stores').replaceChildren();
  for (const s of totals) {
    const card = el('article', undefined, 'store-card' + (s.complete && s.cents === lowest ? ' best' : ''));
    card.append(el('div', s.name, 'store-name'));
    const badge = s.complete && s.cents === lowest ? 'LOWEST COMPLETE CART' : s.complete ? 'COMPLETE ESTIMATE' : 'NEEDS PRICES';
    card.append(el('div', badge, 'badge'), el('div', s.matched ? format(s.cents) : '—', 'total'));
    card.append(el('p', `${s.matched} of ${cart.items.length} items priced${s.complete ? ' · estimated subtotal' : ' · partial subtotal'}`, 'coverage'));
    card.append(button('Sign in / choose Marion ↗', () => grocery.openStore(s.id), 'store-open'));
    $('stores').append(card);
  }
  $('count').textContent = cart.items.length;
  $('empty').hidden = !!cart.items.length;
  $('items').replaceChildren();
  for (const item of cart.items) {
    const row = el('article', undefined, 'item');
    const top = el('div', undefined, 'item-top');
    const detail = el('div', undefined, 'item-detail');
    const name = el('h3', item.name); detail.append(name);
    const size = el('input'); size.value = item.size; size.maxLength = 200; size.placeholder = 'Size / variety'; size.setAttribute('aria-label', `${item.name}: size or variety`);
    size.addEventListener('change', () => { item.size = size.value.trim(); item.offers = {}; save(); render(); message('Size changed. Previous prices cleared so you can compare the new size.'); });
    const match = el('select');
    for (const [v, text] of [['exact', 'Exact brand'], ['equivalent', 'Any comparable brand']]) { const o = el('option', text); o.value = v; match.append(o); }
    match.value = item.match; match.setAttribute('aria-label', `${item.name}: match preference`);
    match.addEventListener('change', () => { item.match = match.value; item.offers = {}; save(); render(); message('Match preference changed. Previous prices cleared for review.'); });
    const preferences = el('div', undefined, 'preferences'); preferences.append(size, match); detail.append(preferences);
    const quantity = el('div', undefined, 'quantity');
    const decrement = button('−', () => { if (item.quantity > 1) { item.quantity--; save(); render(); } }); decrement.setAttribute('aria-label', `Decrease ${item.name}`); decrement.disabled = item.quantity <= 1;
    const increment = button('+', () => { if (item.quantity < 999) { item.quantity++; save(); render(); } }); increment.setAttribute('aria-label', `Increase ${item.name}`);
    quantity.append(decrement, el('span', item.quantity), increment);
    const remove = button('Remove', () => { if (window.confirm(`Remove ${item.name} from your cart?`)) { cart.items = cart.items.filter(i => i.id !== item.id); save(); render(); } }, 'remove');
    const search = button('Search all 4 stores ↗', async () => {
      const size = /^(choose|compare)\b/i.test(item.size) ? '' : item.size;
      await grocery.searchStores([item.name, size].filter(Boolean).join(' '));
      message('Searches opened in one store window. Choose a store tab, then a product. Use Copy product link to look up its default version.');
    }, 'search-stores');
    top.append(detail, search, quantity, remove); row.append(top);
    const offers = el('div', undefined, 'offer-grid');
    for (const store of stores) {
      const o = item.offers[store.id];
      const cell = button('', () => openPrice(item, store), 'offer' + (o ? ' has-price' : ''));
      cell.append(el('span', store.name, 'offer-store'), el('strong', o ? format(o.cents * o.packs * item.quantity) : '+ Add / look up price'));
      if (o) {
        cell.append(el('span', `${o.product} · ${o.packs} pkg × ${item.quantity}`, 'product'), el('span', `${o.source === 'shelf' ? 'Shelf / receipt verified' : o.source === 'web-estimate' ? 'Online estimate' : 'Manual estimate'} · ${new Date(o.checked).toLocaleDateString()}`, 'source'));
      } else cell.append(el('span', 'Not included in subtotal', 'source'));
      offers.append(cell);
    }
    row.append(offers); $('items').append(row);
  }
}
function openPrice(item, store) {
  editing = { item, store };
  const o = item.offers[store.id];
  $('price-store').textContent = store.name;
  $('price-item').textContent = item.name;
  $('offer-product').value = o?.product || `${item.name} — ${item.size}`;
  $('offer-price').value = o ? (o.cents / 100).toFixed(2) : '';
  $('offer-packs').value = o?.packs || 1;
  $('offer-source').value = o?.source || 'manual';
  $('offer-url').value = o?.url || '';
  $('offer-confirm').checked = false;
  $('lookup-status').textContent = '';
  $('delete-offer').disabled = !o;
  $('price-dialog').showModal();
}
$('add-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('new-name').value.trim(); if (!name) return;
  cart.items.push({ id: crypto.randomUUID(), name, brand: '', size: $('new-size').value.trim(), match: $('new-match').value, quantity: 1, offers: {} });
  $('add-form').reset(); save(); render(); $('new-name').focus();
});
$('close-price').onclick = () => $('price-dialog').close();
$('delete-offer').onclick = () => { delete editing.item.offers[editing.store.id]; save(); render(); $('price-dialog').close(); };
$('price-form').addEventListener('submit', event => {
  event.preventDefault();
  const cents = Math.round(Number($('offer-price').value) * 100), packs = Number($('offer-packs').value);
  if (!Number.isInteger(cents) || cents < 1 || !Number.isInteger(packs) || packs < 1) return;
  const product = $('offer-product').value.trim(); if (!product) return;
  const offer = { cents, packs, product, source: $('offer-source').value, url: $('offer-url').value.trim(), checked: new Date().toISOString() };
  // Validate via the main process before replacing the displayed cart.
  const candidate = JSON.parse(JSON.stringify(cart));
  candidate.items.find(i => i.id === editing.item.id).offers[editing.store.id] = offer;
  grocery.save(candidate).then(() => { cart = candidate; render(); $('price-dialog').close(); }).catch(e => message(e.message));
});
$('lookup').onclick = async () => {
  const context = editing;
  $('lookup').disabled = true; $('lookup-status').textContent = 'Opening product page…';
  try {
    const result = await grocery.capture(context.store.id, $('offer-url').value.trim());
    if (editing !== context) return;
    const unique = [...new Map(result.candidates.map(c => [c.product + c.cents, c])).values()];
    const available = unique.filter(c => !/OutOfStock|Discontinued|SoldOut/i.test(c.availability));
    if (available.length !== 1) { $('lookup-status').textContent = result.reason || 'The default version could not be identified. Enter the displayed price manually.'; return; }
    const p = available[0];
    $('offer-product').value = p.product; $('offer-price').value = (p.cents / 100).toFixed(2); $('offer-url').value = result.url; $('offer-source').value = 'web-estimate'; $('offer-confirm').checked = false;
    $('lookup-status').textContent = (result.reason || 'Default version found.') + ' Verify Marion, size and availability before saving.';
  } catch (e) { $('lookup-status').textContent = e.message; }
  finally { $('lookup').disabled = false; }
};
async function exportList(kind) { await saveChain; message(await grocery.export($('export-store').value, kind)); }
$('copy').onclick = () => exportList('copy').catch(e => message(e.message));
$('export-file').onclick = () => exportList('file').catch(e => message(e.message));
$('update').onclick = () => grocery.checkUpdate().catch(e => message(e.message));
$('install').onclick = async () => { try { await save(); await grocery.installUpdate(); } catch (e) { message(e.message); } };
grocery.onUpdate(status => { $('update-status').textContent = status.text; $('install').hidden = !status.ready; });
window.addEventListener('beforeunload', event => { if (saving) { event.preventDefault(); event.returnValue = ''; } });
Promise.all([grocery.load(), grocery.stores()]).then(([data, list]) => {
  cart = data.cart; stores = list; $('version').textContent = 'VERSION ' + data.version;
  for (const s of stores) { const o = el('option', s.name); o.value = s.id; $('export-store').append(o); }
  render();
  if (data.loadError) message('Your previous cart could not be read. A backup was preserved locally; starter items are shown.');
}).catch(e => message('Could not load your cart: ' + e.message));
