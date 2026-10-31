// UPC/EAN/GTIN equality ignores zero-padding, never a missing check digit.
function normalizeGtin(value) {
  if (typeof value !== 'string') return '';
  const code = value.replace(/[\s-]/g, '');
  if (!/^(?:\d{8}|\d{12,14})$/.test(code)) return '';
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(code[i]) * weight;
  return (10 - sum % 10) % 10 === Number(code.at(-1)) ? code.padStart(14, '0') : '';
}
module.exports = { normalizeGtin };
