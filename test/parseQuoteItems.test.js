import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuoteItems, sumQuoteTotal } from '../src/utils/parseQuoteItems.js';

test('accepts a normal priced item', () => {
  const items = parseQuoteItems('[{"name":"Widget","price":100,"qty":2}]');
  assert.deepEqual(items, [{ name: 'Widget', desc: '', img: null, price: 100, qty: 2 }]);
});

test('accepts price: 0 (quote-only item)', () => {
  const items = parseQuoteItems('[{"name":"Pour-in-Place Surfacing","price":0,"qty":1}]');
  assert.ok(items);
  assert.equal(items[0].price, 0);
});

test('accepts a mixed cart of priced and quote-only items', () => {
  const items = parseQuoteItems(
    '[{"name":"Quote Only","price":0,"qty":1},{"name":"Priced","price":42840,"qty":1}]',
  );
  assert.equal(items.length, 2);
  assert.equal(sumQuoteTotal(items), 42840);
});

test('accepts a numeric string price (backward compatible coercion)', () => {
  const items = parseQuoteItems('[{"name":"Widget","price":"100","qty":1}]');
  assert.ok(items);
  assert.equal(items[0].price, 100);
});

test('rejects price: null', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","price":null,"qty":1}]'), null);
});

test('rejects a missing price field (undefined)', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","qty":1}]'), null);
});

test('rejects a non-numeric price (NaN after coercion)', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","price":"not-a-number","qty":1}]'), null);
});

test('rejects a non-integer price', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","price":10.5,"qty":1}]'), null);
});

test('rejects a negative price', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","price":-5,"qty":1}]'), null);
});

test('still rejects qty: 0', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","price":10,"qty":0}]'), null);
});

test('still rejects a negative qty', () => {
  assert.equal(parseQuoteItems('[{"name":"Bad","price":10,"qty":-1}]'), null);
});

test('still rejects a missing name', () => {
  assert.equal(parseQuoteItems('[{"price":10,"qty":1}]'), null);
});

test('rejects malformed JSON', () => {
  assert.equal(parseQuoteItems('not json'), null);
});

test('sumQuoteTotal sums price x qty across items, including zero-priced ones', () => {
  const items = [
    { name: 'A', price: 0, qty: 5 },
    { name: 'B', price: 100, qty: 2 },
  ];
  assert.equal(sumQuoteTotal(items), 200);
});
