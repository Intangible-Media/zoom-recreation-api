import { config } from '../config.js';
import { parseQuoteItems, sumQuoteTotal } from './parseQuoteItems.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared request validation for both /api/checkout and /api/quote/email — same
 * request body shape (name, email, quoteItems, ...), same rules, except the
 * minimum allowed total: /api/checkout must charge at least config.minQuoteTotal
 * (a $0 charge is never valid), while /api/quote/email passes minTotal: 0 so a
 * cart made entirely of quote-only ($0) items can still be emailed. Returns
 * { error } on failure, or the parsed fields (name, email, phone, zipCode,
 * message, pageUrl, device, items, total) on success.
 */
export function validateQuoteRequest(body, { minTotal = config.minQuoteTotal } = {}) {
  const { name, email, phone, zipCode, message, quoteItems, pageUrl, device } = body || {};

  if (!name || !email) {
    return { error: 'name and email are required' };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: 'email is not a valid email address' };
  }

  const items = parseQuoteItems(quoteItems);
  if (!items) {
    return {
      error: 'quoteItems must be a JSON-encoded array of line items with name, price, and qty',
    };
  }

  if (items.length > config.maxQuoteItems) {
    return { error: 'Too many items in quoteItems' };
  }

  const total = sumQuoteTotal(items);
  if (total < minTotal || total > config.maxQuoteTotal) {
    return { error: 'Quote total is outside the allowed range' };
  }

  return { name, email, phone, zipCode, message, pageUrl, device, items, total };
}
