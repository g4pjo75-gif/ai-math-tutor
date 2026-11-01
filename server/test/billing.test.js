// server/test/billing.test.js — Checkout/Portal 파라미터와 오류 처리
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutParams,
  createCheckoutSession,
  createPortalSession
} from '../src/billing.js';

const env = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  CHECKOUT_SUCCESS_URL: 'https://example.com/thanks?session_id={CHECKOUT_SESSION_ID}',
  CHECKOUT_CANCEL_URL: 'https://example.com/pricing',
  PORTAL_RETURN_URL: 'https://example.com/portal',
  PLAN_PRICE_JPY: '980',
  PLAN_NAME: 'AI家庭教師 スタンダード'
};

test('buildCheckoutParams: JPY 980 / monthly / success·cancel', () => {
  const p = buildCheckoutParams(env);
  assert.equal(p.mode, 'subscription');
  assert.equal(p['line_items[0][price_data][currency]'], 'jpy');
  assert.equal(p['line_items[0][price_data][unit_amount]'], 980);
  assert.equal(p['line_items[0][price_data][recurring][interval]'], 'month');
  assert.equal(p.success_url, env.CHECKOUT_SUCCESS_URL);
  assert.equal(p.cancel_url, env.CHECKOUT_CANCEL_URL);
});

test('buildCheckoutParams: 가격 기본값 980, 이름 기본값', () => {
  const p = buildCheckoutParams({});
  assert.equal(p['line_items[0][price_data][unit_amount]'], 980);
  assert.equal(p['line_items[0][price_data][product_data][name]'], 'AI家庭教師 スタンダード');
});

test('createCheckoutSession: 설정 누락 시 500', async () => {
  const r = await createCheckoutSession({});
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'server_misconfigured');
});

test('createCheckoutSession: Stripe 성공 → url 반환', async () => {
  const prev = globalThis.fetch;
  let body = '';
  globalThis.fetch = async (url, init) => {
    body = init.body;
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/x' }), { status: 200 });
  };
  try {
    const r = await createCheckoutSession(env);
    assert.equal(r.status, 200);
    assert.equal(r.body.url, 'https://checkout.stripe.com/c/x');
    const sp = new URLSearchParams(body);
    assert.equal(sp.get('mode'), 'subscription');
    assert.equal(sp.get('line_items[0][price_data][unit_amount]'), '980');
    assert.equal(sp.get('line_items[0][price_data][currency]'), 'jpy');
    assert.equal(sp.get('success_url'), env.CHECKOUT_SUCCESS_URL);
  } finally {
    globalThis.fetch = prev;
  }
});

test('createCheckoutSession: Stripe 오류 → 502', async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 });
  try {
    const r = await createCheckoutSession(env);
    assert.equal(r.status, 502);
    assert.equal(r.body.error, 'stripe_error');
  } finally {
    globalThis.fetch = prev;
  }
});

test('createPortalSession: customer 없으면 400, 키 없으면 500', async () => {
  const noCustomer = await createPortalSession(env, { stripe_customer_id: null });
  assert.equal(noCustomer.status, 400);
  assert.equal(noCustomer.body.error, 'no_customer');

  const noKey = await createPortalSession({}, { stripe_customer_id: 'cus_1' });
  assert.equal(noKey.status, 500);
});

test('createPortalSession: Stripe 성공 → url 반환', async () => {
  const prev = globalThis.fetch;
  let body = '';
  globalThis.fetch = async (url, init) => {
    body = init.body;
    return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/x' }), { status: 200 });
  };
  try {
    const r = await createPortalSession(env, { stripe_customer_id: 'cus_1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.url, 'https://billing.stripe.com/p/x');
    const sp = new URLSearchParams(body);
    assert.equal(sp.get('customer'), 'cus_1');
    assert.equal(sp.get('return_url'), env.PORTAL_RETURN_URL);
  } finally {
    globalThis.fetch = prev;
  }
});
