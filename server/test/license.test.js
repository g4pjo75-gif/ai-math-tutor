// server/test/license.test.js — 순수 로직 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLicenseKey, normalizeKey, hashKey, periodOf } from '../src/license.js';

test('generateLicenseKey: AMT-XXXX-XXXX-XXXX-XXXX 형식', () => {
  for (let i = 0; i < 20; i++) {
    const k = generateLicenseKey();
    assert.match(k, /^AMT(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  }
});

test('normalizeKey: 공백·소문자·하이픈 없이도 정규화', () => {
  assert.equal(normalizeKey(' amt abcd-efgh jkmn-pqrs '), 'AMT-ABCD-EFGH-JKMN-PQRS');
  assert.equal(normalizeKey('AMTABCDEFGHJKMNPQRS'), 'AMT-ABCD-EFGH-JKMN-PQRS');
  assert.equal(normalizeKey('AMT-ABCD'), '');
  assert.equal(normalizeKey('nope'), '');
  assert.equal(normalizeKey(null), '');
});

test('hashKey: 결정적이고 64자 hex, 정규화 무관', async () => {
  const a = await hashKey('AMT-ABCD-EFGH-JKMN-PQRS');
  const b = await hashKey('amt abcd efgh jkmn pqrs');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await hashKey('invalid'), '');
});

test('periodOf: UTC 월 경계', () => {
  assert.equal(periodOf(Date.UTC(2026, 10, 1)), '2026-11');
  assert.equal(periodOf(Date.UTC(2026, 0, 9)), '2026-01');
  assert.equal(periodOf(Date.UTC(2026, 11, 31, 23, 59)), '2026-12');
});
