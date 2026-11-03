// server/src/stripe.js — Stripe webhook 검증 + 라이선스 키 유도 + 이벤트 처리
import { hashKey } from './license.js';
import { sendLicenseEmail } from './email.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TOLERANCE_SEC = 300;

async function hmacBytes(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(secret, message) {
  return toHex(await hmacBytes(secret, message));
}

export function timingSafeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function parseStripeSignature(header) {
  const out = {};
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export async function verifyStripeSignature(payload, header, secret, toleranceSec = TOLERANCE_SEC) {
  if (!secret) return false;
  const sig = parseStripeSignature(header);
  const t = Number(sig.t);
  if (!t) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return timingSafeEqual(expected, sig.v1 || '');
}

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// session_id로부터 결정적으로 라이선스 키를 만든다(평문 저장 불필요).
export async function deriveLicenseKey(secret, sessionId) {
  if (!secret) throw new Error('LICENSE_SECRET missing');
  const mac = await hmacBytes(secret, `license:${sessionId}`);
  const raw = base32(mac).slice(0, 16);
  return 'AMT-' + raw.match(/.{4}/g).join('-');
}

export async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';

  if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return { status: 400, body: { ok: false, error: 'invalid_signature' } };
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch (e) {
    return { status: 400, body: { ok: false, error: 'invalid_json' } };
  }

  const type = event.type;
  const obj = event.data && event.data.object ? event.data.object : null;
  if (!obj) return { status: 200, body: { ok: true, ignored: 'no_object' } };

  // 환경 격리: metadata.env가 존재하고 현재 APP_ENV와 일치하지 않으면 무시
  const currentEnv = env.APP_ENV || 'production';
  const eventEnv = obj.metadata && obj.metadata.env;
  if (eventEnv && eventEnv !== currentEnv) {
    return { status: 200, body: { ok: true, ignored: 'env_mismatch' } };
  }

  if (type === 'checkout.session.completed') {
    if (obj.mode !== 'subscription') {
      return { status: 200, body: { ok: true, ignored: 'not_subscription' } };
    }
    const existing = await env.DB.prepare('SELECT id FROM licenses WHERE stripe_session_id = ?')
      .bind(obj.id).first();
    if (existing) return { status: 200, body: { ok: true, duplicate: true } };

    if (!env.LICENSE_SECRET) {
      return { status: 500, body: { ok: false, error: 'server_misconfigured' } };
    }

    const key = await deriveLicenseKey(env.LICENSE_SECRET, obj.id);
    const keyHash = await hashKey(key);
    const id = 'lic_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const now = Date.now();
    const periodEnd = now + 30 * 86400000;
    const limit = Number(env.PLAN_LIMIT || 300);
    const email = obj.customer_details && obj.customer_details.email ? obj.customer_details.email : null;

    await env.DB.prepare(
      'INSERT INTO licenses (id, key_hash, email, stripe_customer_id, stripe_subscription_id, plan, status, call_limit, current_period_end, created_at, stripe_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id, keyHash, email,
      obj.customer || null, obj.subscription || null,
      'standard', 'active', limit, periodEnd, now, obj.id
    ).run();

    let emailStatus = 'skipped';
    if (email) {
      try {
        const mailRes = await sendLicenseEmail(env, { to: email, key, sessionId: obj.id });
        if (mailRes.ok) {
          emailStatus = 'sent';
          await env.DB.prepare('UPDATE licenses SET email_sent_at = ? WHERE id = ?')
            .bind(Date.now(), id).run();
        } else {
          emailStatus = 'failed';
          console.error('sendLicenseEmail failed:', mailRes.error);
        }
      } catch (e) {
        emailStatus = 'failed';
        console.error('sendLicenseEmail exception:', e.message);
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        created: id,
        ...(emailStatus === 'failed' ? { email: 'failed' } : {})
      }
    };
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted' || type === 'invoice.payment_failed') {
    const subId = type === 'invoice.payment_failed' ? (obj.subscription || null) : obj.id;
    if (!subId) return { status: 200, body: { ok: true, ignored: 'no_subscription' } };

    let status = 'active';
    if (type === 'customer.subscription.deleted') status = 'canceled';
    else if (type === 'invoice.payment_failed') status = 'past_due';
    else if (obj.status) status = obj.status;

    const periodEnd = obj.current_period_end ? obj.current_period_end * 1000 : null;

    await env.DB.prepare(
      'UPDATE licenses SET status = ?, current_period_end = COALESCE(?, current_period_end) WHERE stripe_subscription_id = ?'
    ).bind(status, periodEnd, subId).run();

    return { status: 200, body: { ok: true, updated: subId, status } };
  }

  return { status: 200, body: { ok: true, ignored: type } };
}
