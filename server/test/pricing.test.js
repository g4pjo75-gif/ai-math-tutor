import test from 'node:test';
import assert from 'node:assert/strict';
import { costMicroYen, DEFAULT_MODEL } from '../src/pricing.js';

test('3.8 Flash: 1K in + 1K out = 675000 micro-yen (¥0.675)', () => {
  assert.equal(costMicroYen('gemini-3.8-flash', 1000, 1000, 150), 675000);
});

test('unknown model falls back to default pricing', () => {
  assert.equal(costMicroYen('nope', 1000, 1000, 150), costMicroYen(DEFAULT_MODEL, 1000, 1000, 150));
});

test('zero tokens = 0', () => {
  assert.equal(costMicroYen('gemini-3.8-flash', 0, 0, 150), 0);
});

test('Flash-Lite is cheaper than Flash', () => {
  assert.ok(costMicroYen('gemini-3.5-flash-lite', 1000, 1000, 150) < costMicroYen('gemini-3.8-flash', 1000, 1000, 150));
});
