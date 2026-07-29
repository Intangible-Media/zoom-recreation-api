import { escapeHtml } from '../utils/escapeHtml.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { sanitizeText } from '../utils/sanitizeText.js';
import { DEPOSIT_STATUS } from './properties.js';

const NO_PRICE_LABEL = 'price provided after review';
// Matches the cap checkout.js already applies to these same fields before sending
// them to Stripe (item.name.slice(0, 500)) — keeps a maxQuoteItems-sized cart's
// worth of note HTML well under HubSpot's note body limit regardless of how long
// a submitted name/desc is.
const MAX_FIELD_LEN = 500;

/**
 * Builds the HTML body for a HubSpot Note attached to the deal, listing every
 * cart item in plain, readable terms for a sales rep — the deal's
 * quote_items_json property holds the same data, but as raw JSON, which isn't
 * something a rep should have to read directly. Called at deal-creation time
 * (see syncQuoteLead.js), before any Stripe payment has happened either way, so
 * this doesn't claim anything about what was actually paid — just what's in the
 * cart and at what price, if any.
 */
export function formatQuoteNoteHtml({ items, total, depositStatus }) {
  const itemLines = items
    .map((item) => {
      const priceLabel = item.price > 0 ? formatCurrency(item.price * item.qty) : NO_PRICE_LABEL;
      const name = sanitizeText(item.name, MAX_FIELD_LEN);
      const desc = sanitizeText(item.desc, MAX_FIELD_LEN);
      const descSuffix = desc ? ` (${escapeHtml(desc)})` : '';
      return `<li>${escapeHtml(name)} — Qty: ${item.qty} — ${priceLabel}${descSuffix}</li>`;
    })
    .join('');

  // The only two values ever passed in today (checkout.js's default PENDING, and
  // emailQuote.js's explicit NO_DEPOSIT) — anything else falls through to the
  // "awaiting checkout" line, which would be misleading for e.g. PAID/FAILED.
  // This function only ever runs at deal-creation time, before either of those
  // can apply, so it's safe today; revisit if a future caller changes that.
  const statusLine =
    depositStatus === DEPOSIT_STATUS.NO_DEPOSIT
      ? 'No deposit — customer asked for the quote emailed instead of paying now.'
      : 'Pending — awaiting Stripe Checkout.';

  return [
    '<p><strong>Quote Details</strong></p>',
    `<ul>${itemLines}</ul>`,
    `<p><strong>Total: ${formatCurrency(total)}</strong></p>`,
    `<p>${statusLine}</p>`,
  ].join('');
}
