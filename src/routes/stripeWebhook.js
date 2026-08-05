import { Router } from 'express';
import { stripe } from '../stripeClient.js';
import { config } from '../config.js';
import { updateDepositStatus, getDealQuoteItems } from '../hubspot/deals.js';
import { DEPOSIT_STATUS } from '../hubspot/properties.js';
import { sendReceiptEmail } from '../email/send.js';
import { createIdempotencyCache } from '../utils/idempotencyCache.js';

const router = Router();

// Stripe delivers webhooks at-least-once (retries, and manual resends from the
// Dashboard, redeliver the same event.id) — this guards sendReceiptForSession so a
// redelivery doesn't email the customer a second receipt for the same payment.
// updateDepositStatus doesn't need this: setting the same HubSpot status twice is a
// no-op. 24h comfortably covers realistic redelivery windows without growing unbounded
// (best-effort, in-process only — doesn't survive a restart, same scope as checkout.js's).
const RECEIPT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const sentReceipts = createIdempotencyCache(RECEIPT_DEDUPE_WINDOW_MS);

const NO_DEPOSIT_NOTE = 'No deposit collected';

// 'completed' can still mean payment_status 'unpaid' for async payment methods (e.g.
// some bank debits) — those resolve later via async_payment_succeeded instead. Single
// source of truth for "did this event represent a successful payment", used both to
// drive the HubSpot status update and to decide whether to send a receipt email.
function isPaidEvent(event, session) {
  return (
    (event.type === 'checkout.session.completed' && session?.payment_status === 'paid') ||
    event.type === 'checkout.session.async_payment_succeeded'
  );
}

/**
 * Prefers the full original cart stored on the HubSpot deal (quote_items_json) —
 * this includes $0 quote-only items that were never sent to Stripe at all (see
 * checkout.js), so the receipt can show the customer's whole request, not just the
 * items they were able to pay a deposit on. Falls back to Stripe's own line items
 * (priced items only) if the deal/cart isn't available for any reason — e.g. the
 * HubSpot sync failed back at checkout time and no dealId ever made it into the
 * session's metadata.
 */
async function buildReceiptItems(session, dealId) {
  if (dealId) {
    try {
      const cart = await getDealQuoteItems(dealId);
      if (cart) {
        return cart.map((item) => ({
          name: item.name,
          qty: item.qty,
          lineTotal: item.price * item.qty,
          desc: item.desc || undefined,
          note: item.price === 0 ? NO_DEPOSIT_NOTE : undefined,
          img: item.img || undefined,
        }));
      }
    } catch (err) {
      console.error(`Failed to load full cart from HubSpot deal ${dealId} for receipt:`, err);
    }
  }

  // Stripe's own max page size is 100; bounded further by maxQuoteItems since a
  // legitimate session never has more line items than checkout.js allowed it to.
  // expand pulls each line item's product (checkout.js sets product_data.images
  // to the original item's img), so this fallback path can still show thumbnails.
  const lineItemLimit = Math.min(config.maxQuoteItems, 100);
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: lineItemLimit,
    expand: ['data.price.product'],
  });
  if (lineItems.has_more) {
    console.error(
      `Session ${session.id} has more than ${lineItemLimit} line items — receipt email will be incomplete`,
    );
  }

  return lineItems.data.map((lineItem) => ({
    name: lineItem.description || 'Item',
    qty: lineItem.quantity || 1,
    // amount_total is Stripe's exact line total; using it directly (rather than
    // dividing by qty to back into a unit price, then multiplying back out to
    // display) avoids a rounding round-trip when a line's amount doesn't divide
    // evenly by its quantity.
    lineTotal: lineItem.amount_total / 100,
    img: lineItem.price?.product?.images?.[0] || undefined,
  }));
}

// checkout.js only puts a handful of sanitized, length-capped fields into session
// metadata (see metadata block there) — not the customer's email. That comes off the
// session itself, which Checkout always populates.
async function sendReceiptForSession(session, dealId) {
  const to = session.customer_details?.email || session.customer_email;
  if (!to) {
    console.error(`No customer email on session ${session.id}, skipping receipt email`);
    return;
  }

  if (session.amount_total == null) {
    console.error(`No amount_total on session ${session.id}, skipping receipt email`);
    return;
  }

  const items = await buildReceiptItems(session, dealId);

  await sendReceiptEmail({
    to,
    name: session.metadata?.name || '',
    items,
    total: session.amount_total / 100,
    sessionId: session.id,
    // The order number customers see is the HubSpot deal id — omitted (not a
    // placeholder) if the original checkout-time HubSpot sync never succeeded.
    orderNumber: dealId,
  });
}

// Mounted with express.raw() in server.js (before the global express.json()
// middleware) — Stripe's signature check needs the exact raw request body.
router.post('/', async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      config.stripeWebhookSecret,
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;
  const dealId = session?.metadata?.hubspotDealId;

  if (dealId) {
    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          if (isPaidEvent(event, session)) {
            await updateDepositStatus(dealId, DEPOSIT_STATUS.PAID);
          }
          break;
        case 'checkout.session.async_payment_failed':
          await updateDepositStatus(dealId, DEPOSIT_STATUS.FAILED);
          break;
        case 'checkout.session.expired':
          await updateDepositStatus(dealId, DEPOSIT_STATUS.EXPIRED);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`Failed to update HubSpot deal ${dealId} for event ${event.type}:`, err);
      // Still ack the webhook — Stripe would otherwise retry, and the failure is on
      // our side (HubSpot), not something a retry of the same event will fix.
    }
  }

  // Independent of the dealId guard above — a receipt should still go out even if
  // the original HubSpot sync failed and no deal/metadata was ever attached.
  if (isPaidEvent(event, session) && !sentReceipts.get(event.id)) {
    try {
      await sendReceiptForSession(session, dealId);
      sentReceipts.set(event.id, true);
    } catch (err) {
      console.error(`Failed to send receipt email for session ${session?.id}:`, err);
    }
  }

  res.json({ received: true });
});

export default router;
