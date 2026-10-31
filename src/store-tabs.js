/* global storeTabs */
const tabs = document.getElementById('tabs');
let detecting = false;
let importing = false;
function render(state) {
  importing = !!state.importState?.running;
  tabs.replaceChildren();
  for (const store of state.stores) {
    const button = document.createElement('button'); button.textContent = store.name + (store.loading ? ' · loading' : ''); button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(state.active === store.id));
    button.onclick = () => storeTabs.select(store.id).catch(showError); tabs.append(button);
  }
  const current = state.stores.find(s => s.id === state.active);
  document.getElementById('address').textContent = current?.url || 'Select a store';
  document.getElementById('back').disabled = !current?.canGoBack;
  const target = document.getElementById('target');
  target.replaceChildren(new Option('Choose cart item…', ''));
  for (const item of state.items) target.append(new Option(item.name, item.id));
  target.value = state.target || '';
  document.getElementById('use-product').disabled = detecting || importing || !state.target || !current;
  document.getElementById('save-alternative').disabled = detecting || importing || !state.target || !current;
  document.getElementById('add-new').disabled = detecting || importing || !current;
  document.getElementById('reload').disabled = !current;
  document.getElementById('done').hidden = state.stores.length > 0;
  if (importing || !detecting) document.getElementById('status').textContent = state.importState?.text || current?.error || 'Choose Marion, Ohio in each store.';
}
function showError(error) { document.getElementById('status').textContent = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
document.getElementById('back').onclick = () => storeTabs.navigate('back').catch(showError);
document.getElementById('reload').onclick = () => storeTabs.navigate('reload').catch(showError);
document.getElementById('target').onchange = event => storeTabs.setTarget(event.target.value).catch(showError);
async function saveProduct(mode) {
  detecting = true; document.getElementById('use-product').disabled = true;
  document.getElementById('save-alternative').disabled = true;
  document.getElementById('status').textContent = 'Detecting product price…';
  try {
    const result = await storeTabs.useProduct(mode);
    const prices = result.prices?.map(p => `$${(p.cents / 100).toFixed(2)} / ${p.unit}`).join(' + ');
    document.getElementById('status').textContent = result.prices?.length > 1 ? `Saved ${prices} · Needs review. ${result.asAlternative ? 'Quantities 0 until selected.' : 'Case quantity 0 until selected. Store tab closed.'}` : result.asAlternative ? `Alternative saved at $${(result.cents / 100).toFixed(2)}. Quantity 0 until selected.` : `Saved $${(result.cents / 100).toFixed(2)} · Needs review. Store tab closed.`;
  } catch (error) { showError(error); }
  finally { detecting = false; const disabled = !document.getElementById('target').value || !tabs.children.length; document.getElementById('use-product').disabled = disabled; document.getElementById('save-alternative').disabled = disabled; }
}
document.getElementById('add-new').onclick = async () => {
  detecting = true; document.getElementById('add-new').disabled = true;
  document.getElementById('status').textContent = 'Reading product details…';
  let failure;
  try { const result = await storeTabs.addNew(); document.getElementById('status').textContent = result.message; } catch (error) { failure = error; showError(error); }
  finally { detecting = false; try { render(await storeTabs.state()); if (failure) showError(failure); } catch (error) { showError(error); } }
};

document.getElementById('use-product').onclick = () => saveProduct('main');
document.getElementById('save-alternative').onclick = () => saveProduct('alternative');
storeTabs.onState(render); storeTabs.state().then(render).catch(showError);
