import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

export const BRAND = {
  name: 'Zoom Rec',
  logoUrl: 'https://cdn.prod.website-files.com/62d9646b4c2ec13d75b22cc4/62d97140d89c2f1b488f43c5_Group%203073.svg',
  // From the logo itself: gold/yellow accent, near-black text.
  primary: '#ffc907',
  dark: '#231f20',
};
// Logo's native size is 102.742x32.799 (~3.13:1) — scaled up, same aspect ratio.
const LOGO_WIDTH = 140;
const LOGO_HEIGHT = 45;

const THUMB_SIZE = 48;
const THUMB_CELL_WIDTH = 56;

/**
 * Shared itemized table markup for the quote and receipt emails. `items` is
 * { name, qty, lineTotal, desc?, note?, img? }[]. Callers compute lineTotal
 * themselves (rather than this module deriving it from a unit price) so each
 * caller uses whichever value is exact for its source: quoteEmail.js has an
 * exact unit price (price * qty), while the Stripe receipt path has an exact
 * line total (amount_total) but no exact unit price when a line's amount
 * doesn't divide evenly by its quantity. `desc`, if present, renders as a line
 * under the item name. `note`, if present, replaces the formatted currency
 * amount — used for quote-only ($0) items so they read as "price provided
 * after review" rather than the misleading "$0.00". `img` (a thumbnail URL),
 * if any item in the array has one, adds a leading image column — `img` must
 * be escaped here (not just presence-checked upstream) since it's interpolated
 * into an HTML attribute, where an embedded `"` could otherwise break out of
 * `src="..."` and inject markup.
 */
export function renderItemsTableHtml(items) {
  const hasImages = items.some((item) => item.img);

  const rows = items
    .map((item) => {
      const descHtml = item.desc
        ? `<div style="font-size:12px;color:#666666;margin-top:2px;">${escapeHtml(item.desc)}</div>`
        : '';
      const amountHtml = item.note ? escapeHtml(item.note) : formatCurrency(item.lineTotal);
      const imageCellHtml = hasImages
        ? `<td style="padding:8px 8px 8px 0;width:${THUMB_CELL_WIDTH}px;border-bottom:1px solid #e5e5e5;">${
            item.img
              ? `<img src="${escapeHtml(item.img)}" width="${THUMB_SIZE}" height="${THUMB_SIZE}" alt="" style="display:block;border-radius:4px;">`
              : ''
          }</td>`
        : '';
      return `
        <tr>
          ${imageCellHtml}
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${escapeHtml(item.name)}${descHtml}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;text-align:center;">${item.qty}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;text-align:right;">${amountHtml}</td>
        </tr>`;
    })
    .join('');

  const imageHeaderHtml = hasImages
    ? `<th style="padding:8px 0;border-bottom:2px solid ${BRAND.primary};width:${THUMB_CELL_WIDTH}px;"></th>`
    : '';

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:${BRAND.dark};">
      <thead>
        <tr>
          ${imageHeaderHtml}
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid ${BRAND.primary};">Item</th>
          <th style="text-align:center;padding:8px 0;border-bottom:2px solid ${BRAND.primary};">Qty</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid ${BRAND.primary};">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function renderItemsTableText(items) {
  return items
    .map((item) => {
      const amount = item.note || formatCurrency(item.lineTotal);
      const descSuffix = item.desc ? ` — ${item.desc}` : '';
      return `- ${item.name} x${item.qty}: ${amount}${descSuffix}`;
    })
    .join('\n');
}

/** Wraps template-specific body markup with the shared branded header (logo + accent rule). */
export function renderEmailWrapperHtml(bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:${BRAND.dark};">
      <div style="padding:20px 0 16px;border-bottom:3px solid ${BRAND.primary};">
        <img src="${BRAND.logoUrl}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${BRAND.name}" style="display:block;">
      </div>
      <div style="padding:24px 0;">
        ${bodyHtml}
      </div>
    </div>`;
}

/** Plain-text counterpart — no image, just a name header for parity with the HTML version. */
export function renderEmailWrapperText(bodyLines) {
  return [BRAND.name, '', ...bodyLines].join('\n');
}

/**
 * The customer-facing order number is the HubSpot deal's id — omitted (not a
 * placeholder like "pending") when the deal doesn't exist yet, e.g. HubSpot sync
 * failed for this submission. See emailQuote.js/stripeWebhook.js for where this
 * comes from on each email.
 */
export function renderOrderNumberHtml(orderNumber) {
  if (!orderNumber) return '';
  return `<p style="font-size:15px;margin:0 0 16px;"><strong>Order #: ${escapeHtml(orderNumber)}</strong></p>`;
}

export function renderOrderNumberText(orderNumber) {
  return orderNumber ? `Order #: ${orderNumber}` : '';
}
