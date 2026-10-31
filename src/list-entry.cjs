function generalName(title, brand = '') {
  let name = String(title || '').trim();
  for (const prefix of [brand, 'Gordon Food Service', 'Gordon Choice', 'Meijer', 'ALDI'].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    name = name.replace(new RegExp('^' + escaped + '(?:\\s+|[,:–—-]\\s*)', 'i'), '').trim();
  }
  return (name || title || 'New list item').slice(0, 200);
}
function upgradeListEntries(cart) {
  const groups = new Map();
  for (const item of cart.items) {
    if (!groups.has(item.originId)) groups.set(item.originId, []);
    groups.get(item.originId).push(item);
    if (item.retailerUpc && /^\d{8,14}$/.test(item.retailerUpc) && item.upc !== item.retailerUpc) {
      if (item.upc && !item.verifiedGtin) item.verifiedGtin = item.upc;
      item.upc = item.retailerUpc;
    }
  }
  for (const rows of groups.values()) {
    const imported = rows.find(i => i.pendingUrl || i.importNote !== undefined);
    if (!imported || imported.listEntryNamed) continue;
    const name = generalName(imported.name, imported.brand);
    for (const item of rows) { item.originalProductName ||= item.name; item.name = name; item.listEntryNamed = true; }
  }
  return cart;
}
module.exports = { generalName, upgradeListEntries };
