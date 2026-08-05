import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatQuoteNoteHtml } from '../src/hubspot/formatQuoteNote.js';
import { DEPOSIT_STATUS } from '../src/hubspot/properties.js';

test('lists a priced item with its line total, and leads with Order # and Order Type', () => {
  const html = formatQuoteNoteHtml({
    dealId: '123456789',
    items: [{ name: 'Motion Maze', qty: 1, price: 42840 }],
    total: 42840,
    depositStatus: DEPOSIT_STATUS.PENDING,
  });
  assert.match(html, /Order #: 123456789/);
  assert.match(html, /Order Type:<\/strong> Deposit — awaiting Stripe Checkout/);
  assert.match(html, /Motion Maze — Qty: 1 — \$42,840\.00/);
  assert.match(html, /Total: \$42,840\.00/);
});

test('labels the email-only (no-deposit) route distinctly from the deposit route', () => {
  const html = formatQuoteNoteHtml({
    dealId: '987654321',
    items: [{ name: 'Motion Maze', qty: 1, price: 42840 }],
    total: 42840,
    depositStatus: DEPOSIT_STATUS.NO_DEPOSIT,
  });
  assert.match(html, /Order Type:<\/strong> Email Quote Only — no deposit collected/);
  assert.doesNotMatch(html, /Deposit — awaiting Stripe Checkout/);
});

test('omits the Order # line (rather than showing a blank/undefined one) when dealId is missing', () => {
  const html = formatQuoteNoteHtml({
    items: [{ name: 'Motion Maze', qty: 1, price: 42840 }],
    total: 42840,
    depositStatus: DEPOSIT_STATUS.PENDING,
  });
  assert.doesNotMatch(html, /Order #/);
  assert.match(html, /Order Type:<\/strong> Deposit/);
});

test('shows a $0 item as price-pending rather than $0.00, includes its desc', () => {
  const html = formatQuoteNoteHtml({
    dealId: '1',
    items: [{ name: 'Pour-in-Place Rubber Surfacing', qty: 1, price: 0, desc: '20 ft x 4 ft, 80 sq. ft.' }],
    total: 0,
    depositStatus: DEPOSIT_STATUS.NO_DEPOSIT,
  });
  const itemLine = html.match(/<li>.*?<\/li>/)[0];
  assert.match(itemLine, /Pour-in-Place Rubber Surfacing — Qty: 1 — price provided after review \(20 ft x 4 ft, 80 sq\. ft\.\)/);
  assert.doesNotMatch(itemLine, /\$0\.00/);
  assert.match(html, /Total: \$0\.00/);
});

test('escapes item name, desc, and dealId to prevent HTML injection into the note body', () => {
  const html = formatQuoteNoteHtml({
    dealId: '<script>alert(3)</script>',
    items: [{ name: '<img src=x onerror=alert(1)>', qty: 1, price: 10, desc: '<script>alert(2)</script>' }],
    total: 10,
    depositStatus: DEPOSIT_STATUS.PENDING,
  });
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});

test('caps an oversized name/desc so a maxQuoteItems-sized cart stays well under HubSpot\'s note limit', () => {
  const html = formatQuoteNoteHtml({
    dealId: '1',
    items: [{ name: 'A'.repeat(2000), qty: 1, price: 10, desc: 'B'.repeat(2000) }],
    total: 10,
    depositStatus: DEPOSIT_STATUS.PENDING,
  });
  const itemLine = html.match(/<li>.*?<\/li>/)[0];
  assert.equal((itemLine.match(/A/g) || []).length, 500);
  assert.equal((itemLine.match(/B/g) || []).length, 500);
});

test('renders a mixed cart with one line per item', () => {
  const html = formatQuoteNoteHtml({
    dealId: '1',
    items: [
      { name: 'Motion Maze', qty: 1, price: 42840 },
      { name: 'Quote Only', qty: 2, price: 0 },
    ],
    total: 42840,
    depositStatus: DEPOSIT_STATUS.PENDING,
  });
  assert.match(html, /<li>Motion Maze — Qty: 1 — \$42,840\.00<\/li>/);
  assert.match(html, /<li>Quote Only — Qty: 2 — price provided after review<\/li>/);
});
