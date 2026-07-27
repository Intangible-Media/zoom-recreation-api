import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { renderItemsTableHtml, renderItemsTableText, renderEmailWrapperHtml, renderEmailWrapperText } from './shared.js';

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

export function buildReceiptEmail({ name, items, total, sessionId }) {
  const subject = 'Your receipt';
  const greetingName = firstName(name);
  // items may include quote-only entries (a `note` instead of a charged amount) —
  // see stripeWebhook.js, which sources the full original cart from HubSpot rather
  // than just what Stripe actually charged, so the receipt shows everything the
  // customer asked about, not only what they paid a deposit on.
  const hasUnpaidItems = items.some((item) => Boolean(item.note));
  const intro = hasUnpaidItems
    ? "Thanks for your payment! Here's your receipt — a couple of items below aren't included in this payment yet, see the notes next to each."
    : "Thanks for your payment! Here's your receipt.";

  const html = renderEmailWrapperHtml(`
      <p>Hi ${escapeHtml(greetingName)},</p>
      <p>${intro}</p>
      ${renderItemsTableHtml(items)}
      <p style="text-align:right;font-size:16px;margin-top:12px;"><strong>Total paid: ${formatCurrency(total)}</strong></p>
      <p style="color:#666666;font-size:12px;">Reference: ${escapeHtml(sessionId)}</p>`);

  const text = renderEmailWrapperText([
    `Hi ${greetingName},`,
    '',
    intro,
    '',
    renderItemsTableText(items),
    '',
    `Total paid: ${formatCurrency(total)}`,
    '',
    `Reference: ${sessionId}`,
  ]);

  return { subject, html, text };
}
