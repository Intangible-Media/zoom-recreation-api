import { test } from 'node:test';
import assert from 'node:assert/strict';

// validateQuoteRequest.js imports src/config.js, which throws at import time if any
// required env var is missing — these dummy values just need to satisfy that boot
// check, none of them are actually called out to. Set via process.env (not a .env
// file) so this works the same in CI as it does locally, and set before the dynamic
// import below so config.js sees them (a static import would run before this code).
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.WEBFLOW_SUCCESS_URL ??= 'https://example.com/success';
process.env.WEBFLOW_CANCEL_URL ??= 'https://example.com/cancel';
process.env.CORS_ORIGIN ??= 'https://example.com';
process.env.HUBSPOT_ACCESS_TOKEN ??= 'pat-dummy';
process.env.RESEND_API_KEY ??= 're_dummy';
process.env.EMAIL_FROM ??= 'Test <test@example.com>';
process.env.MIN_QUOTE_TOTAL ??= '1';
process.env.MAX_QUOTE_TOTAL ??= '1000000';
process.env.MAX_QUOTE_ITEMS ??= '50';
process.env.HUBSPOT_DEAL_PIPELINE ??= 'Sales Order Pipeline';

const { validateQuoteRequest } = await import('../src/utils/validateQuoteRequest.js');

const baseBody = (quoteItems) => ({
  name: 'Jane Doe',
  email: 'jane@example.com',
  quoteItems,
});

test('checkout default (no minTotal override): rejects an all-quote-only cart', () => {
  const result = validateQuoteRequest(baseBody('[{"name":"Quote Only","price":0,"qty":1}]'));
  assert.equal(result.error, 'Quote total is outside the allowed range');
});

test('checkout default: accepts a mixed cart whose total is >= MIN_QUOTE_TOTAL', () => {
  const result = validateQuoteRequest(
    baseBody('[{"name":"Quote Only","price":0,"qty":1},{"name":"Priced","price":42840,"qty":1}]'),
  );
  assert.equal(result.error, undefined);
  assert.equal(result.total, 42840);
  assert.equal(result.items.length, 2);
});

test('minTotal: 0 accepts an all-quote-only cart (the /api/quote/email case)', () => {
  const result = validateQuoteRequest(baseBody('[{"name":"Quote Only","price":0,"qty":5}]'), {
    minTotal: 0,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.total, 0);
});

test('rejects missing name/email regardless of minTotal', () => {
  const result = validateQuoteRequest(
    { quoteItems: '[{"name":"A","price":0,"qty":1}]' },
    { minTotal: 0 },
  );
  assert.equal(result.error, 'name and email are required');
});

test('minTotal: 0 still enforces MAX_QUOTE_TOTAL', () => {
  const result = validateQuoteRequest(baseBody('[{"name":"Huge","price":5000000,"qty":1}]'), {
    minTotal: 0,
  });
  assert.equal(result.error, 'Quote total is outside the allowed range');
});

test('minTotal: 0 still enforces MAX_QUOTE_ITEMS', () => {
  const items = Array.from({ length: 51 }, (_, i) => ({ name: `Item ${i}`, price: 0, qty: 1 }));
  const result = validateQuoteRequest(baseBody(JSON.stringify(items)), { minTotal: 0 });
  assert.equal(result.error, 'Too many items in quoteItems');
});
