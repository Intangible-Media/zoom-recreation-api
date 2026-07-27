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
    if (!name) return null;

    // price === 0 is valid — quote-only line items (e.g. pricing pending a site
    // review) still need to appear on the quote/receipt, just not charged via
    // Stripe. Number(null)/Number(undefined) would otherwise coerce to 0/NaN, so
    // null/undefined are rejected explicitly rather than relying on that coercion.
    if (item.price === null || item.price === undefined) return null;
    const price = Number(item.price);
    if (!Number.isInteger(price) || price < 0) return null;

    const qty = Number(item.qty);
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
