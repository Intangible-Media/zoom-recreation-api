import { escapeHtml } from '../../utils/escapeHtml.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { renderItemsTableHtml, renderItemsTableText } from './shared.js';

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

export function buildQuoteEmail({ name, items, total }) {
  const subject = 'Your quote';
  const greetingName = firstName(name);
  // parseQuoteItems.js gives an exact unit price, so the line total computed here is exact too.
  const rows = items.map((item) => ({ name: item.name, qty: item.qty, lineTotal: item.price * item.qty }));

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222222;">
      <p>Hi ${escapeHtml(greetingName)},</p>
      <p>Here's the quote you requested. No payment is due right now — this is for your records.</p>
      ${renderItemsTableHtml(rows)}
      <p style="text-align:right;font-size:16px;margin-top:12px;"><strong>Total: ${formatCurrency(total)}</strong></p>
      <p>If you'd like to move forward, just reply to this email and we'll pick up from there.</p>
    </div>`;

  const text = [
    `Hi ${greetingName},`,
    '',
    "Here's the quote you requested. No payment is due right now — this is for your records.",
    '',
    renderItemsTableText(rows),
    '',
    `Total: ${formatCurrency(total)}`,
    '',
    "If you'd like to move forward, just reply to this email and we'll pick up from there.",
  ].join('\n');

  return { subject, html, text };
}
