import { Router } from 'express';
import { stripe } from '../stripeClient.js';
import { config } from '../config.js';
import { updateDepositStatus } from '../hubspot/deals.js';
import { DEPOSIT_STATUS } from '../hubspot/properties.js';

const router = Router();

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
          // 'completed' can still mean payment_status 'unpaid' for async payment
          // methods (e.g. some bank debits) — those resolve via the events below.
          if (session.payment_status === 'paid') {
            await updateDepositStatus(dealId, DEPOSIT_STATUS.PAID);
          }
          break;
        case 'checkout.session.async_payment_succeeded':
          await updateDepositStatus(dealId, DEPOSIT_STATUS.PAID);
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

  res.json({ received: true });
});

export default router;
