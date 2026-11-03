// server/test/email.test.js — Resend 이메일 발송 및 Webhook 연동 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sendLicenseEmail, sendRecoveryEmail } from '../src/email.js';
import { handleStripeWebhook } from '../src/stripe.js';

test('email: Resend 설정 누락 시 email_not_configured 반환', async () => {
  const r1 = await sendLicenseEmail({}, { to: 'user@example.com', key: 'AMT-1111-2222-3333-4444' });
  assert.equal(r1.ok, false);
  assert.equal(r1.error, 'email_not_configured');

  const r2 = await sendRecoveryEmail({}, { to: 'user@example.com', key: 'AMT-1111-2222-3333-4444' });
  assert.equal(r2.ok, false);
  assert.equal(r2.error, 'email_not_configured');
});

test('email: 메일 payload 검증 (to, subject, key 포함)', async () => {
  const prevFetch = globalThis.fetch;
  let sentPayload = null;
  let authHeader = null;

  globalThis.fetch = async (url, init) => {
    authHeader = init.headers.Authorization;
    sentPayload = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 });
  };

  try {
    const env = {
      RESEND_API_KEY: 're_test_key_123',
      MAIL_FROM: 'Tutor <noreply@example.com>',
      SITE_BASE_URL: 'https://test.example.com',
      SUPPORT_EMAIL: 'help@example.com'
    };

    const res = await sendLicenseEmail(env, {
      to: 'customer@example.com',
      key: 'AMT-AAAA-BBBB-CCCC-DDDD',
      sessionId: 'cs_test_session'
    });

    assert.equal(res.ok, true);
    assert.equal(res.id, 'msg_123');
    assert.equal(authHeader, 'Bearer re_test_key_123');
    assert.deepEqual(sentPayload.to, ['customer@example.com']);
    assert.equal(sentPayload.from, 'Tutor <noreply@example.com>');
    assert.match(sentPayload.subject, /ご購入ありがとうございます/);
    assert.match(sentPayload.text, /AMT-AAAA-BBBB-CCCC-DDDD/);
    assert.match(sentPayload.text, /cs_test_session/);
    assert.match(sentPayload.html, /AMT-AAAA-BBBB-CCCC-DDDD/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

function createMockDb() {
  const state = {
    licenses: [],
    updates: []
  };
  return {
    state,
    prepare: (query) => ({
      bind: (...args) => ({
        first: async () => {
          if (query.includes('FROM licenses WHERE stripe_session_id = ?')) {
            return state.licenses.find((l) => l.stripe_session_id === args[0]) || null;
          }
          return null;
        },
        run: async () => {
          if (query.includes('INSERT INTO licenses')) {
            state.licenses.push({
              id: args[0],
              key_hash: args[1],
              email: args[2],
              stripe_customer_id: args[3],
              stripe_subscription_id: args[4],
              plan: args[5],
              status: args[6],
              call_limit: args[7],
              current_period_end: args[8],
              created_at: args[9],
              stripe_session_id: args[10],
              email_sent_at: null
            });
            return { meta: { changes: 1 } };
          }
          if (query.includes('UPDATE licenses SET email_sent_at = ?')) {
            const lic = state.licenses.find((l) => l.id === args[1]);
            if (lic) lic.email_sent_at = args[0];
            state.updates.push({ id: args[1], email_sent_at: args[0] });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
      })
    })
  };
}

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

test('email: webhook 생성 후 메일 발송 성공 시 email_sent_at 갱신', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'msg_webhook_1' }), { status: 200 });

  try {
    const db = createMockDb();
    const env = {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      LICENSE_SECRET: 'lic_secret_test_123',
      RESEND_API_KEY: 're_test_key',
      DB: db
    };

    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_success_1',
          mode: 'subscription',
          customer: 'cus_1',
          subscription: 'sub_1',
          customer_details: { email: 'buyer@example.com' }
        }
      }
    });

    const req = makeWebhookRequest(payload, env.STRIPE_WEBHOOK_SECRET);
    const res = await handleStripeWebhook(req, env);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.email, undefined); // not failed
    assert.equal(db.state.licenses.length, 1);
    assert.ok(db.state.licenses[0].email_sent_at > 0);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('email: 발송 실패 시에도 라이선스는 유지되고 200 email:failed 반환', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Rate limit exceeded' }), { status: 429 });

  try {
    const db = createMockDb();
    const env = {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      LICENSE_SECRET: 'lic_secret_test_123',
      RESEND_API_KEY: 're_test_key',
      DB: db
    };

    const payload = JSON.stringify({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fail_1',
          mode: 'subscription',
          customer: 'cus_2',
          subscription: 'sub_2',
          customer_details: { email: 'buyer2@example.com' }
        }
      }
    });

    const req = makeWebhookRequest(payload, env.STRIPE_WEBHOOK_SECRET);
    const res = await handleStripeWebhook(req, env);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.email, 'failed');
    assert.equal(db.state.licenses.length, 1);
    assert.equal(db.state.licenses[0].email_sent_at, null); // 유지
  } finally {
    globalThis.fetch = prevFetch;
  }
});
