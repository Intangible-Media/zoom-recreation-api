import { resend } from './client.js';
import { config } from '../config.js';
import { buildQuoteEmail } from './templates/quoteEmail.js';
import { buildReceiptEmail } from './templates/receiptEmail.js';

// The Resend SDK returns { data, error } instead of throwing on API-level failures
// (invalid from-address, unverified domain, rate limit, etc). Normalizing that into
// a thrown error keeps every caller's try/catch working the same as the Stripe/HubSpot
// SDKs elsewhere in this codebase.
async function send(payload) {
  const { error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend error (${error.name}): ${error.message}`, { cause: error });
  }
}

export async function sendQuoteEmail({ to, name, items, total, orderNumber }) {
  const { subject, html, text } = buildQuoteEmail({ name, items, total, orderNumber });
  await send({ from: config.emailFrom, to, subject, html, text });
}

export async function sendReceiptEmail({ to, name, items, total, sessionId, orderNumber }) {
  const { subject, html, text } = buildReceiptEmail({ name, items, total, sessionId, orderNumber });
  await send({ from: config.emailFrom, to, subject, html, text });
}
