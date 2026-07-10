import crypto from 'node:crypto';
import { Router } from 'express';
import { stripe } from '../stripeClient.js';
import { config } from '../config.js';
import { parseQuoteItems, sumQuoteTotal } from '../utils/parseQuoteItems.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const router = Router();

router.post('/', async (req, res) => {
  const { name, email, phone, zipCode, message, quoteItems, pageUrl } = req.body || {};

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

  try {
    // Groups repeat submits (double-clicks, network retries) of the same quote within a
    // short window into one Stripe session, without blocking a genuinely new submission later.
    const idempotencyBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${email}|${total}|${items.length}|${idempotencyBucket}`)
      .digest('hex');

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
          name: String(name).slice(0, 500),
          phone: String(phone || '').slice(0, 500),
          zipCode: String(zipCode || '').slice(0, 500),
          message: String(message || '').slice(0, 500),
          pageUrl: String(pageUrl || '').slice(0, 500),
          itemCount: String(items.length),
          total: String(total),
        },
      },
      { idempotencyKey },
    );

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
