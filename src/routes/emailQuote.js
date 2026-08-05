import { Router } from 'express';
import { validateQuoteRequest } from '../utils/validateQuoteRequest.js';
import { syncQuoteLead } from '../hubspot/syncQuoteLead.js';
import { sendQuoteEmail } from '../email/send.js';
import { DEPOSIT_STATUS } from '../hubspot/properties.js';
import { createIdempotencyCache, computeQuoteIdempotencyKey } from '../utils/idempotencyCache.js';

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const router = Router();

// Two separate caches, mirroring checkout.js's pattern exactly:
// - hubspotSyncCache holds the sync result as soon as it succeeds, independent of
//   whether the email send that follows succeeds — so a retry after a failed send
//   (e.g. a transient Resend outage) reuses the existing deal instead of creating a
//   new one every attempt.
// - sentQuoteEmails is only set once the email has actually gone out, so a retry
//   after a successful send doesn't re-send it.
const hubspotSyncCache = createIdempotencyCache(IDEMPOTENCY_WINDOW_MS);
const sentQuoteEmails = createIdempotencyCache(IDEMPOTENCY_WINDOW_MS);

// For customers who want the quote emailed to them instead of paying a deposit now.
// HubSpot sync runs first (best-effort, same order as checkout.js) so the email can
// include the deal's id as an order number. If HubSpot is unreachable, the sync
// failure is logged and the email still goes out — just without an order number,
// rather than blocking the whole point of this route on a HubSpot outage.
router.post('/', async (req, res) => {
  // Unlike /api/checkout, a cart made entirely of quote-only ($0) items is valid
  // here — there's no payment involved either way.
  const validation = validateQuoteRequest(req.body, { minTotal: 0 });
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

  let hubspot = hubspotSyncCache.get(idempotencyKey);
  if (!hubspot) {
    try {
      hubspot = await syncQuoteLead({
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
      hubspotSyncCache.set(idempotencyKey, hubspot);
    } catch (err) {
      console.error('Failed to sync no-deposit quote lead to HubSpot:', err);
    }
  }

  try {
    await sendQuoteEmail({ to: email, name, items, total, orderNumber: hubspot?.dealId });
  } catch (err) {
    console.error('Failed to send quote email:', err);
    return res.status(502).json({ error: 'Unable to send quote email' });
  }

  sentQuoteEmails.set(idempotencyKey, true);

  return res.json({ ok: true });
});

export default router;
