import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOrderNumberHtml, renderOrderNumberText } from '../src/email/templates/shared.js';
import { buildQuoteEmail } from '../src/email/templates/quoteEmail.js';
import { buildReceiptEmail } from '../src/email/templates/receiptEmail.js';

test('renderOrderNumberHtml/Text render the number when present', () => {
  assert.match(renderOrderNumberHtml('123456789'), /Order #: 123456789/);
  assert.equal(renderOrderNumberText('123456789'), 'Order #: 123456789');
});

test('renderOrderNumberHtml/Text render nothing (not a placeholder) when omitted', () => {
  assert.equal(renderOrderNumberHtml(undefined), '');
  assert.equal(renderOrderNumberText(undefined), '');
});

test('renderOrderNumberHtml escapes the order number', () => {
  assert.doesNotMatch(renderOrderNumberHtml('<script>alert(1)</script>'), /<script>/);
});

test('buildQuoteEmail puts the order number in the subject and body when a dealId is available', () => {
  const { subject, html, text } = buildQuoteEmail({
    name: 'Jane Doe',
    items: [{ name: 'Motion Maze', price: 42840, qty: 1 }],
    total: 42840,
    orderNumber: '123456789',
  });
  assert.equal(subject, 'Your quote — Order #123456789');
  assert.match(html, /Order #: 123456789/);
  assert.match(text, /Order #: 123456789/);
});

test('buildQuoteEmail falls back to a plain subject/body when HubSpot sync failed (no dealId)', () => {
  const { subject, html, text } = buildQuoteEmail({
    name: 'Jane Doe',
    items: [{ name: 'Motion Maze', price: 42840, qty: 1 }],
    total: 42840,
  });
  assert.equal(subject, 'Your quote');
  assert.doesNotMatch(html, /Order #/);
  assert.doesNotMatch(text, /Order #/);
});

test('buildReceiptEmail puts the order number in the subject and body when a dealId is available', () => {
  const { subject, html, text } = buildReceiptEmail({
    name: 'Jane Doe',
    items: [{ name: 'Motion Maze', qty: 1, lineTotal: 42840 }],
    total: 42840,
    sessionId: 'cs_test_123',
    orderNumber: '123456789',
  });
  assert.equal(subject, 'Your receipt — Order #123456789');
  assert.match(html, /Order #: 123456789/);
  assert.match(text, /Order #: 123456789/);
});

test('buildReceiptEmail falls back to a plain subject/body when the dealId is unavailable', () => {
  const { subject, html, text } = buildReceiptEmail({
    name: 'Jane Doe',
    items: [{ name: 'Motion Maze', qty: 1, lineTotal: 42840 }],
    total: 42840,
    sessionId: 'cs_test_123',
  });
  assert.equal(subject, 'Your receipt');
  assert.doesNotMatch(html, /Order #/);
  assert.doesNotMatch(text, /Order #/);
});
