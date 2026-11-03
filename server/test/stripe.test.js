// server/test/stripe.test.js — 서명 검증 / 키 유도 / 타이밍 세이프 비교
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  deriveLicenseKey,
  handleStripeWebhook,
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

function makeWebhookRequest(payload, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return new Request('https://api.test/webhook/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${t},v1=${v1}`
    },
    body: payload
  });
}

function createMockDb(initialLicenses = []) {
  const state = {
    licenses: initialLicenses.map((l) => ({ ...l })),
    executedQueries: []
  };
  return {
    state,
    prepare(query) {
      return {
        bind(...args) {
          return {
            async run() {
              state.executedQueries.push({ query, args });
              if (query.includes("UPDATE licenses SET status = 'refunded'")) {
                const customerId = args[0];
                let count = 0;
                for (const lic of state.licenses) {
                  if (lic.stripe_customer_id === customerId && ['active', 'past_due', 'unpaid'].includes(lic.status)) {
                    lic.status = 'refunded';
                    count++;
                  }
                }
                return { meta: { changes: count } };
              }
              return { meta: { changes: 0 } };
            }
          };
        }
      };
    }
  };
}

test('refund: 전액 환불 시 licenses.status가 refunded로 갱신되고 changes가 반환된다', async () => {
  const db = createMockDb([
    { id: 'lic_1', stripe_customer_id: 'cus_1', status: 'active' },
    { id: 'lic_2', stripe_customer_id: 'cus_1', status: 'past_due' },
    { id: 'lic_3', stripe_customer_id: 'cus_2', status: 'active' }
  ]);
  const env = {
    STRIPE_WEBHOOK_SECRET: SECRET,
    DB: db
  };

  const payload = JSON.stringify({
    id: 'evt_ref_1',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_1',
        customer: 'cus_1',
        refunded: true
      }
    }
  });

  const req = makeWebhookRequest(payload, env.STRIPE_WEBHOOK_SECRET);
  const res = await handleStripeWebhook(req, env);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.refunded, true);
  assert.equal(res.body.updated, 2);
  assert.equal(db.state.licenses[0].status, 'refunded');
  assert.equal(db.state.licenses[1].status, 'refunded');
  assert.equal(db.state.licenses[2].status, 'active');
});

test('refund: 부분 환불(refunded: false)은 자동 정지하지 않고 UPDATE를 실행하지 않는다', async () => {
  const db = createMockDb([
    { id: 'lic_1', stripe_customer_id: 'cus_1', status: 'active' }
  ]);
  const env = {
    STRIPE_WEBHOOK_SECRET: SECRET,
    DB: db
  };

  const payload = JSON.stringify({
    id: 'evt_ref_2',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_2',
        customer: 'cus_1',
        refunded: false
      }
    }
  });

  const req = makeWebhookRequest(payload, env.STRIPE_WEBHOOK_SECRET);
  const res = await handleStripeWebhook(req, env);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.ignored, 'partial_or_no_customer');
  assert.equal(db.state.executedQueries.length, 0);
  assert.equal(db.state.licenses[0].status, 'active');
});

test('refund: customer 정보가 없으면 UPDATE를 실행하지 않고 무시한다', async () => {
  const db = createMockDb([
    { id: 'lic_1', stripe_customer_id: 'cus_1', status: 'active' }
  ]);
  const env = {
    STRIPE_WEBHOOK_SECRET: SECRET,
    DB: db
  };

  const payload = JSON.stringify({
    id: 'evt_ref_3',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_3',
        customer: null,
        refunded: true
      }
    }
  });

  const req = makeWebhookRequest(payload, env.STRIPE_WEBHOOK_SECRET);
  const res = await handleStripeWebhook(req, env);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.ignored, 'partial_or_no_customer');
  assert.equal(db.state.executedQueries.length, 0);
  assert.equal(db.state.licenses[0].status, 'active');
});
