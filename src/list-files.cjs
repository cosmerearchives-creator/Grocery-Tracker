const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { migrateCart, validateCart } = require('./model.cjs');
const MAX_BYTES = 25 * 1024 * 1024;
function serializeList(cart) {
  validateCart(cart);
  return JSON.stringify({ format: 'grocery-tracker-list', version: 1, savedAt: new Date().toISOString(), cart }, null, 2);
}
function parseList(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw Error('This list file is too large (maximum 25 MB).');
  let value;
  try { value = JSON.parse(text); } catch { throw Error('This file is not a readable shopping list.'); }
  if (value?.format === 'grocery-tracker-list') {
    if (value.version !== 1) throw Error('This list uses an unsupported file version.');
    value = value.cart;
  }
  return migrateCart(value);
}
async function readList(file) {
  if ((await fs.stat(file)).size > MAX_BYTES) throw Error('This list file is too large (maximum 25 MB).');
  const cart = parseList(await fs.readFile(file, 'utf8'));
  if (!cart.listName) cart.listName = path.basename(file).replace(/(?:\.grocery)?\.json$/i, '').slice(0, 100) || 'Untitled list';
  return validateCart(cart);
}
async function writeList(file, cart) {
  const text = serializeList(cart);
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw Error('This list is too large to save (maximum 25 MB).');
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.unlink(temp).catch(() => {}); }
}
module.exports = { serializeList, parseList, readList, writeList };
