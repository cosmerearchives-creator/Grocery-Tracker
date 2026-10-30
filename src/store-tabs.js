/* global storeTabs */
const tabs = document.getElementById('tabs');
let detecting = false;
function render(state) {
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
  document.getElementById('use-product').disabled = detecting || !state.target || !current;
  document.getElementById('reload').disabled = !current;
  document.getElementById('done').hidden = state.stores.length > 0;
  if (!detecting) document.getElementById('status').textContent = current?.error || 'Choose Marion, Ohio in each store.';
}
function showError(error) { document.getElementById('status').textContent = error.message; }
document.getElementById('back').onclick = () => storeTabs.navigate('back').catch(showError);
document.getElementById('reload').onclick = () => storeTabs.navigate('reload').catch(showError);
document.getElementById('target').onchange = event => storeTabs.setTarget(event.target.value).catch(showError);
document.getElementById('use-product').onclick = async () => {
  detecting = true; document.getElementById('use-product').disabled = true;
  document.getElementById('status').textContent = 'Detecting product price…';
  try {
    const result = await storeTabs.useProduct();
    document.getElementById('status').textContent = `Saved $${(result.cents / 100).toFixed(2)} · Needs review. Store tab closed.`;
  } catch (error) { showError(error); }
  finally { detecting = false; document.getElementById('use-product').disabled = !document.getElementById('target').value || !tabs.children.length; }
};
storeTabs.onState(render); storeTabs.state().then(render).catch(showError);
