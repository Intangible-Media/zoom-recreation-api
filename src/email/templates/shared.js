import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

/**
 * Shared itemized table markup for the quote and receipt emails. `items` is
 * { name, qty, lineTotal }[] — callers compute lineTotal themselves (rather than this
 * module deriving it from a unit price) so each caller uses whichever value is exact
 * for its source: quoteEmail.js has an exact unit price (price * qty), while the
 * Stripe receipt path has an exact line total (amount_total) but no exact unit price
 * when a line's amount doesn't divide evenly by its quantity.
 */
export function renderItemsTableHtml(items) {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;">${escapeHtml(item.name)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;text-align:center;">${item.qty}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e5e5e5;text-align:right;">${formatCurrency(item.lineTotal)}</td>
        </tr>`,
    )
    .join('');

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#222222;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #222222;">Item</th>
          <th style="text-align:center;padding:8px 0;border-bottom:2px solid #222222;">Qty</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #222222;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function renderItemsTableText(items) {
  return items.map((item) => `- ${item.name} x${item.qty}: ${formatCurrency(item.lineTotal)}`).join('\n');
}
