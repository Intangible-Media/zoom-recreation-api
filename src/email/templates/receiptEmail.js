import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import {
  renderItemsTableHtml,
  renderItemsTableText,
  renderEmailWrapperHtml,
  renderEmailWrapperText,
  renderOrderNumberHtml,
  renderOrderNumberText,
} from './shared.js';

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

export function buildReceiptEmail({ name, items, total, sessionId, orderNumber }) {
  const subject = orderNumber ? `Your receipt — Order #${orderNumber}` : 'Your receipt';
  const greetingName = firstName(name);
  // items may include quote-only entries (a `note` instead of a charged amount) —
  // see stripeWebhook.js, which sources the full original cart from HubSpot rather
  // than just what Stripe actually charged, so the receipt shows everything the
  // customer asked about, not only what they paid a deposit on. Split into two
  // tables so it's unambiguous which items were actually paid for.
  const paidItems = items.filter((item) => !item.note);
  const unpaidItems = items.filter((item) => item.note);
  const hasUnpaidItems = unpaidItems.length > 0;

  const intro = hasUnpaidItems
    ? "Thanks for your payment! Here's your receipt. A few items you asked about still need pricing — see the second table below."
    : "Thanks for your payment! Here's your receipt.";

  const paidHeadingHtml = hasUnpaidItems
    ? '<h3 style="font-size:15px;margin:0 0 8px;">Deposit paid</h3>'
    : '';
  const unpaidSectionHtml = hasUnpaidItems
    ? `
      <h3 style="font-size:15px;margin:24px 0 8px;">Still need pricing (no deposit collected)</h3>
      ${renderItemsTableHtml(unpaidItems)}`
    : '';

  const html = renderEmailWrapperHtml(`
      <p>Hi ${escapeHtml(greetingName)},</p>
      ${renderOrderNumberHtml(orderNumber)}
      <p>${intro}</p>
      ${paidHeadingHtml}
      ${renderItemsTableHtml(paidItems)}
      <p style="text-align:right;font-size:16px;margin-top:12px;"><strong>Total paid: ${formatCurrency(total)}</strong></p>
      ${unpaidSectionHtml}
      <p style="color:#666666;font-size:12px;margin-top:24px;">Reference: ${escapeHtml(sessionId)}</p>`);

  const textLines = [`Hi ${greetingName},`, ''];
  if (orderNumber) textLines.push(renderOrderNumberText(orderNumber), '');
  textLines.push(intro, '');
  if (hasUnpaidItems) textLines.push('DEPOSIT PAID', '');
  textLines.push(renderItemsTableText(paidItems), '', `Total paid: ${formatCurrency(total)}`);
  if (hasUnpaidItems) {
    textLines.push('', 'STILL NEED PRICING (no deposit collected)', '', renderItemsTableText(unpaidItems));
  }
  textLines.push('', `Reference: ${sessionId}`);

  const text = renderEmailWrapperText(textLines);

  return { subject, html, text };
}
