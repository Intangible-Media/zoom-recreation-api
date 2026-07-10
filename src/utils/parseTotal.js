const TOTAL_LINE_PATTERN = /estimated total:\s*\$\s*([\d,]+(?:\.\d{1,2})?)/gi;

/**
 * Extracts the dollar amount from a "Estimated total: $103,577" line
 * inside the free-text quoteItems field. If the line appears more than once,
 * the last occurrence wins (assumed to be the final total). Returns null if
 * not found or invalid.
 */
export function parseTotalFromQuoteItems(quoteItems) {
  if (typeof quoteItems !== 'string') return null;

  const matches = [...quoteItems.matchAll(TOTAL_LINE_PATTERN)];
  if (!matches.length) return null;

  const amount = Number(matches[matches.length - 1][1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return amount;
}
