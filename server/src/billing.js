// server/src/billing.js — Stripe Checkout / Customer Portal
import { findLicense } from './license.js';

const STRIPE_API = 'https://api.stripe.com/v1';

function form(params) {
  const sp = new URLSearchParams();
  Object.keys(params).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) sp.append(k, String(params[k]));
  });
  return sp;
}

export function buildCheckoutParams(env) {
  const price = Number(env.PLAN_PRICE_JPY || 980);
  const name = env.PLAN_NAME || 'AI家庭教師 スタンダード';
  return {
    mode: 'subscription',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'jpy',
    'line_items[0][price_data][unit_amount]': price,
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': name,
    success_url: env.CHECKOUT_SUCCESS_URL,
    cancel_url: env.CHECKOUT_CANCEL_URL
  };
}

async function stripePost(env, path, params) {
  const res = await fetch(STRIPE_API + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form(params).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || 'stripe_' + res.status);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function createCheckoutSession(env) {
  if (!env.STRIPE_SECRET_KEY || !env.CHECKOUT_SUCCESS_URL || !env.CHECKOUT_CANCEL_URL) {
    return { status: 500, body: { ok: false, error: 'server_misconfigured' } };
  }
  try {
    const session = await stripePost(env, '/checkout/sessions', buildCheckoutParams(env));
    return { status: 200, body: { ok: true, url: session.url, id: session.id } };
  } catch (err) {
    return { status: 502, body: { ok: false, error: 'stripe_error' } };
  }
}

// 포털은 기기 바인딩 없이 라이선스 키만 확인한다(새 기기에서도 구독 관리 가능).
export async function findLicenseByRequest(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: 'missing_license', status: 401 };
  const license = await findLicense(env, m[1].trim());
  if (!license) return { error: 'invalid_license', status: 401 };
  if (license.status !== 'active') return { error: 'license_' + license.status, status: 402 };
  return { license };
}

export async function createPortalSession(env, license) {
  if (!env.STRIPE_SECRET_KEY) {
    return { status: 500, body: { ok: false, error: 'server_misconfigured' } };
  }
  if (!license.stripe_customer_id) {
    return { status: 400, body: { ok: false, error: 'no_customer' } };
  }
  try {
    const session = await stripePost(env, '/billing_portal/sessions', {
      customer: license.stripe_customer_id,
      return_url: env.PORTAL_RETURN_URL || env.CHECKOUT_CANCEL_URL || ''
    });
    return { status: 200, body: { ok: true, url: session.url } };
  } catch (err) {
    return { status: 502, body: { ok: false, error: 'stripe_error' } };
  }
}
