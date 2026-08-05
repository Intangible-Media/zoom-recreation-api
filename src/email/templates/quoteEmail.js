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

const NO_PRICE_NOTE = 'Price provided after review';

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

export function buildQuoteEmail({ name, items, total, orderNumber }) {
  const subject = orderNumber ? `Your quote — Order #${orderNumber}` : 'Your quote';
  const greetingName = firstName(name);
  // parseQuoteItems.js gives an exact unit price, so the line total computed here
  // is exact too. Quote-only ($0) items get a note instead of "$0.00" so they
  // don't read as free.
  const rows = items.map((item) => ({
    name: item.name,
    qty: item.qty,
    lineTotal: item.price * item.qty,
    desc: item.desc || undefined,
    note: item.price === 0 ? NO_PRICE_NOTE : undefined,
    img: item.img || undefined,
  }));

  const html = renderEmailWrapperHtml(`
      <p>Hi ${escapeHtml(greetingName)},</p>
      ${renderOrderNumberHtml(orderNumber)}
      <p>Here's the quote you requested. No payment is due right now — this is for your records.</p>
      ${renderItemsTableHtml(rows)}
      <p style="text-align:right;font-size:16px;margin-top:12px;"><strong>Total: ${formatCurrency(total)}</strong></p>
      <p>If you'd like to move forward, just reply to this email and we'll pick up from there.</p>`);

  const textLines = [`Hi ${greetingName},`, ''];
  if (orderNumber) textLines.push(renderOrderNumberText(orderNumber), '');
  textLines.push(
    "Here's the quote you requested. No payment is due right now — this is for your records.",
    '',
    renderItemsTableText(rows),
    '',
    `Total: ${formatCurrency(total)}`,
    '',
    "If you'd like to move forward, just reply to this email and we'll pick up from there.",
  );
  const text = renderEmailWrapperText(textLines);

  return { subject, html, text };
}
