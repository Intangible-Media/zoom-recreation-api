import crypto from 'node:crypto';
import { Router } from 'express';
import { stripe } from '../stripeClient.js';
import { config } from '../config.js';
import { parseQuoteItems, sumQuoteTotal } from '../utils/parseQuoteItems.js';
import { syncQuoteLead, attachStripeSessionToDeal } from '../hubspot/syncQuoteLead.js';
import { sanitizeText } from '../utils/sanitizeText.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const router = Router();

// In-process cache so a double-click/retry of the same quote within IDEMPOTENCY_WINDOW_MS
// reuses the same HubSpot contact/deal instead of creating a duplicate deal that would be
// left orphaned at deposit_status "pending" forever (Stripe's own idempotencyKey only
// dedupes the Checkout Session, not these HubSpot calls). Best-effort: doesn't survive a
// restart or a multi-instance deployment, same scope as Stripe's key below.
const recentHubspotSyncs = new Map();

function getCachedHubspotSync(key) {
  const entry = recentHubspotSyncs.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    recentHubspotSyncs.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedHubspotSync(key, result) {
  for (const [cachedKey, entry] of recentHubspotSyncs) {
    if (entry.expiresAt < Date.now()) recentHubspotSyncs.delete(cachedKey);
  }
  recentHubspotSyncs.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_WINDOW_MS });
}

router.post('/', async (req, res) => {
  const { name, email, phone, zipCode, message, quoteItems, pageUrl, device } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'email is not a valid email address' });
  }

  const items = parseQuoteItems(quoteItems);
  if (!items) {
    return res.status(400).json({
      error: 'quoteItems must be a JSON-encoded array of line items with name, price, and qty',
    });
  }

  if (items.length > config.maxQuoteItems) {
    return res.status(400).json({ error: 'Too many items in quoteItems' });
  }

  const total = sumQuoteTotal(items);
  if (total < config.minQuoteTotal || total > config.maxQuoteTotal) {
    return res.status(400).json({ error: 'Quote total is outside the allowed range' });
  }

  // Groups repeat submits (double-clicks, network retries) of the same quote within a
  // short window into one Stripe session and one HubSpot contact/deal, without blocking
  // a genuinely new submission later.
  const idempotencyBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${email}|${total}|${items.length}|${idempotencyBucket}`)
    .digest('hex');

  // HubSpot sync is best-effort: a HubSpot outage must never block a customer from
  // reaching Stripe Checkout, so failures here are logged and swallowed.
  let hubspot = getCachedHubspotSync(idempotencyKey);
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
      });
      setCachedHubspotSync(idempotencyKey, hubspot);
    } catch (err) {
      console.error('Failed to sync quote lead to HubSpot:', err);
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: email,
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
        line_items: items.map((item) => ({
          quantity: item.qty,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(item.price * 100),
            product_data: {
              name: item.name.slice(0, 500),
              ...(item.desc ? { description: item.desc.slice(0, 500) } : {}),
              ...(item.img ? { images: [item.img] } : {}),
            },
          },
        })),
        metadata: {
          name: sanitizeText(name, 500),
          phone: sanitizeText(phone, 500),
          zipCode: sanitizeText(zipCode, 500),
          message: sanitizeText(message, 500),
          pageUrl: sanitizeText(pageUrl, 500),
          itemCount: String(items.length),
          total: String(total),
          ...(hubspot ? { hubspotDealId: hubspot.dealId, hubspotContactId: hubspot.contactId } : {}),
        },
      },
      { idempotencyKey },
    );

    if (hubspot) {
      try {
        await attachStripeSessionToDeal(hubspot.dealId, session.id);
      } catch (err) {
        console.error('Failed to attach Stripe session id to HubSpot deal:', err);
      }
    }

    return res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Failed to create Stripe checkout session:', err);

    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid checkout request' });
    }

    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
});

export default router;
