import { Router } from 'express';
import { validateQuoteRequest } from '../utils/validateQuoteRequest.js';
import { syncQuoteLead } from '../hubspot/syncQuoteLead.js';
import { sendQuoteEmail } from '../email/send.js';
import { DEPOSIT_STATUS } from '../hubspot/properties.js';
import { createIdempotencyCache, computeQuoteIdempotencyKey } from '../utils/idempotencyCache.js';

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const router = Router();

// So a double-click/retry within IDEMPOTENCY_WINDOW_MS doesn't send a second email or
// create a second HubSpot deal for the same submission (mirrors checkout.js's cache).
const sentQuoteEmails = createIdempotencyCache(IDEMPOTENCY_WINDOW_MS);

// For customers who want the quote emailed to them instead of paying a deposit now.
// Sending the email is the whole point of this route, so it happens first and its
// failure is reported to the caller (502) — unlike the best-effort HubSpot sync,
// which only runs after a successful send so a HubSpot outage never leaves behind a
// deal that implies a quote email went out when it didn't.
router.post('/', async (req, res) => {
  const validation = validateQuoteRequest(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  const { name, email, phone, zipCode, message, pageUrl, device, items, total } = validation;

  const idempotencyKey = computeQuoteIdempotencyKey({
    email,
    total,
    itemCount: items.length,
    windowMs: IDEMPOTENCY_WINDOW_MS,
  });

  if (sentQuoteEmails.get(idempotencyKey)) {
    return res.json({ ok: true });
  }

  try {
    await sendQuoteEmail({ to: email, name, items, total });
  } catch (err) {
    console.error('Failed to send quote email:', err);
    return res.status(502).json({ error: 'Unable to send quote email' });
  }

  sentQuoteEmails.set(idempotencyKey, true);

  try {
    await syncQuoteLead({
      name,
      email,
      phone,
      zipCode,
      message,
      pageUrl,
      items,
      total,
      deviceRaw: device,
      serverUserAgent: req.headers['user-agent'],
      ip: req.ip,
      depositStatus: DEPOSIT_STATUS.NO_DEPOSIT,
    });
  } catch (err) {
    console.error('Failed to sync no-deposit quote lead to HubSpot:', err);
  }

  return res.json({ ok: true });
});

export default router;
