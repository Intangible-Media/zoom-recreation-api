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
 *
 * Leads with "Order #" (the deal's own id — same number the customer sees in
 * their email) and "Order Type", so a rep can tell whether the customer chose
 * the deposit route or the email-only route without reading anything else on
 * the deal.
 */
export function formatQuoteNoteHtml({ dealId, items, total, depositStatus }) {
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
  // "Deposit" line, which would be misleading for e.g. PAID/FAILED. This function
  // only ever runs at deal-creation time, before either of those can apply, so
  // it's safe today; revisit if a future caller changes that.
  const orderTypeLine =
    depositStatus === DEPOSIT_STATUS.NO_DEPOSIT
      ? 'Email Quote Only — no deposit collected'
      : 'Deposit — awaiting Stripe Checkout';

  return [
    dealId ? `<p><strong>Order #: ${escapeHtml(String(dealId))}</strong></p>` : '',
    `<p><strong>Order Type:</strong> ${orderTypeLine}</p>`,
    '<p><strong>Quote Details</strong></p>',
    `<ul>${itemLines}</ul>`,
    `<p><strong>Total: ${formatCurrency(total)}</strong></p>`,
  ].join('');
}
