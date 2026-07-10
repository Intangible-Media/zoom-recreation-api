/**
 * quoteItems arrives as a JSON-encoded string (a hidden form field holding the
 * cart array). Each item is expected to have at least name, price (whole
 * dollars), and qty. Returns null if the payload is malformed.
 */
export function parseQuoteItems(quoteItemsRaw) {
  if (typeof quoteItemsRaw !== 'string' || !quoteItemsRaw.trim()) return null;

  let items;
  try {
    items = JSON.parse(quoteItemsRaw);
  } catch {
    return null;
  }

  if (!Array.isArray(items) || items.length === 0) return null;

  const parsed = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const price = Number(item.price);
    const qty = Number(item.qty);

    if (!name) return null;
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isInteger(qty) || qty <= 0) return null;

    parsed.push({
      name,
      desc: typeof item.desc === 'string' ? item.desc : '',
      img: typeof item.img === 'string' && item.img.startsWith('https://') ? item.img : null,
      price,
      qty,
    });
  }

  return parsed;
}

export function sumQuoteTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}
