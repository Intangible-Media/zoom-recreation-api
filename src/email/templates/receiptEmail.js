import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { renderItemsTableHtml, renderItemsTableText } from './shared.js';

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

export function buildReceiptEmail({ name, items, total, sessionId }) {
  const subject = 'Your receipt';
  const greetingName = firstName(name);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222222;">
      <p>Hi ${escapeHtml(greetingName)},</p>
      <p>Thanks for your payment! Here's your receipt.</p>
      ${renderItemsTableHtml(items)}
      <p style="text-align:right;font-size:16px;margin-top:12px;"><strong>Total paid: ${formatCurrency(total)}</strong></p>
      <p style="color:#666666;font-size:12px;">Reference: ${escapeHtml(sessionId)}</p>
    </div>`;

  const text = [
    `Hi ${greetingName},`,
    '',
    "Thanks for your payment! Here's your receipt.",
    '',
    renderItemsTableText(items),
    '',
    `Total paid: ${formatCurrency(total)}`,
    '',
    `Reference: ${sessionId}`,
  ].join('\n');

  return { subject, html, text };
}
