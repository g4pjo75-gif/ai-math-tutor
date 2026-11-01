// server/test/stripe.test.js — 서명 검증 / 키 유도 / 타이밍 세이프 비교
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  deriveLicenseKey,
  hmacHex,
  parseStripeSignature,
  timingSafeEqual,
  verifyStripeSignature
} from '../src/stripe.js';

const SECRET = 'whsec_test_secret';

test('deriveLicenseKey: 형식·결정성·세션별 차이', async () => {
  const a = await deriveLicenseKey(SECRET, 'cs_test_abc');
  const b = await deriveLicenseKey(SECRET, 'cs_test_abc');
  const c = await deriveLicenseKey(SECRET, 'cs_test_xyz');
  assert.match(a, /^AMT(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(await deriveLicenseKey('other_secret', 'cs_test_abc'), a);
});

test('parseStripeSignature: t/v1 추출', () => {
  const p = parseStripeSignature('t=123,v1=abc,v0=def');
  assert.equal(p.t, '123');
  assert.equal(p.v1, 'abc');
});

test('verifyStripeSignature: 정상 서명 통과', async () => {
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, SECRET), true);
});

test('verifyStripeSignature: 변조·오래된 타임스탬프·시크릿 없음 거부', async () => {
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');

  assert.equal(await verifyStripeSignature(payload + 'x', `t=${t},v1=${v1}`, SECRET), false);
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${'0'.repeat(64)}`, SECRET), false);
  assert.equal(await verifyStripeSignature(payload, `t=${t - 10000},v1=${v1}`, SECRET), false);
  assert.equal(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, ''), false);
});

test('timingSafeEqual / hmacHex 기본 동작', async () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  const h = await hmacHex('k', 'm');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, createHmac('sha256', 'k').update('m').digest('hex'));
});
