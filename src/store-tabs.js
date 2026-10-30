/* global storeTabs */
const tabs = document.getElementById('tabs');
function render(state) {
  tabs.replaceChildren();
  for (const store of state.stores) {
    const button = document.createElement('button'); button.textContent = store.name + (store.loading ? ' · loading' : ''); button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(state.active === store.id));
    button.onclick = () => storeTabs.select(store.id).catch(showError); tabs.append(button);
  }
  const current = state.stores.find(s => s.id === state.active);
  document.getElementById('address').textContent = current?.url || 'Select a store';
  document.getElementById('back').disabled = !current?.canGoBack;
  document.getElementById('status').textContent = current?.error || 'Choose Marion, Ohio in each store.';
}
function showError(error) { document.getElementById('status').textContent = error.message; }
document.getElementById('back').onclick = () => storeTabs.navigate('back').catch(showError);
document.getElementById('reload').onclick = () => storeTabs.navigate('reload').catch(showError);
document.getElementById('copy').onclick = () => storeTabs.copyUrl().then(() => { document.getElementById('status').textContent = 'Link copied — paste it into the price dialog.'; }).catch(showError);
storeTabs.onState(render); storeTabs.state().then(render).catch(showError);
