// UI projection only: saved quantities, totals and store ownership are untouched.
function cartView(cart, activeStoreIds, selectedStore, comparisons) {
  const active = cart.items.filter(item => activeStoreIds.includes(item.store));
  const all = selectedStore === 'all';
  const unique = new Map();
  for (const item of active) if (!unique.has(item.originId)) unique.set(item.originId, item);
  // The reusable shopping list is shared; cart selection changes the product columns.
  const rows = [...unique.values()].map(item => active.find(i => i.originId === item.originId && i.store === selectedStore) || item);
  return { rows, compare: all || !!comparisons, storeIds: all || comparisons ? activeStoreIds : [selectedStore] };
}
module.exports = { cartView };
