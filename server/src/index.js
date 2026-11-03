// server/src/index.js — API 라우터 (7-4-B-3)
import { corsHeaders } from './cors.js';
import {
  bindDevice,
  findLicense,
  normalizeKey,
  quotaSnapshot,
  requireLicense,
  sha256Hex
} from './license.js';
import { solveProxy } from './solve.js';
import { deriveLicenseKey, handleStripeWebhook } from './stripe.js';
import { createCheckoutSession, createPortalSession, findLicenseByRequest } from './billing.js';
import { sendRecoveryEmail } from './email.js';

const VERSION = '0.7.0';
const MAX_JSON_BYTES = 8 * 1024;
const MAX_SOLVE_BYTES = 8 * 1024 * 1024;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}

async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) {
    const err = new Error('body_too_large');
    err.status = 413;
    throw err;
  }
  try {
    return JSON.parse(text || '{}');
  } catch (e) {
    const err = new Error('invalid_json');
    err.status = 400;
    throw err;
  }
}

function licensePayload(license, quota) {
  return {
    ok: true,
    plan: license.plan,
    status: license.status,
    currentPeriodEnd: license.current_period_end,
    quota
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const route = `${request.method} ${url.pathname}`;

    try {
      if (route === 'GET /health') {
        return json({ ok: true, version: VERSION, time: Date.now() }, 200, cors);
      }

      if (route === 'POST /webhook/stripe') {
        const result = await handleStripeWebhook(request, env);
        return json(result.body, result.status);
      }

      if (route === 'POST /v1/checkout') {
        const result = await createCheckoutSession(env);
        return json(result.body, result.status, cors);
      }

      if (route === 'POST /v1/portal') {
        const auth = await findLicenseByRequest(request, env);
        if (auth.error) return json({ ok: false, error: auth.error }, auth.status, cors);
        const result = await createPortalSession(env, auth.license);
        return json(result.body, result.status, cors);
      }

      if (route === 'POST /v1/recover') {
        const body = await readJson(request, MAX_JSON_BYTES);
        const email = String(body.email || '').trim().toLowerCase();
        if (!email) {
          return json({ ok: true }, 200, cors);
        }

        const emailHash = await sha256Hex(email);
        const ip = request.headers.get('cf-connecting-ip') ||
                   request.headers.get('x-forwarded-for') ||
                   'unknown';
        const ipHash = await sha256Hex(ip);
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const cleanupCutoff = now - 7 * 24 * 60 * 60 * 1000;

        try {
          await env.DB.prepare(
            'DELETE FROM recovery_log WHERE created_at < ?'
          ).bind(cleanupCutoff).run();
        } catch (e) {
          // cleanup failure should not block recovery
        }

        // 1) IP 기준: 시간당 10회
        const recentIp = await env.DB.prepare(
          'SELECT COUNT(*) AS n FROM recovery_log WHERE ip_hash = ? AND created_at > ?'
        ).bind(ipHash, oneHourAgo).first();
        if (recentIp && recentIp.n >= 10) {
          return json({ ok: false, error: 'rate_limited' }, 429, cors);
        }

        // 2) 동일 email + 동일 IP 기준: 시간당 3회
        const recentEmailIp = await env.DB.prepare(
          'SELECT COUNT(*) AS n FROM recovery_log WHERE email_hash = ? AND ip_hash = ? AND created_at > ?'
        ).bind(emailHash, ipHash, oneHourAgo).first();
        if (recentEmailIp && recentEmailIp.n >= 3) {
          return json({ ok: false, error: 'rate_limited' }, 429, cors);
        }

        await env.DB.prepare(
          'INSERT INTO recovery_log (id, email_hash, ip_hash, created_at) VALUES (?, ?, ?, ?)'
        ).bind(crypto.randomUUID(), emailHash, ipHash, Date.now()).run();

        const row = await env.DB.prepare(
          "SELECT stripe_session_id FROM licenses WHERE LOWER(email) = ? AND stripe_session_id IS NOT NULL AND status IN ('active', 'past_due', 'canceled', 'unpaid') ORDER BY created_at DESC LIMIT 1"
        ).bind(email).first();

        if (row && row.stripe_session_id && env.LICENSE_SECRET) {
          try {
            const key = await deriveLicenseKey(env.LICENSE_SECRET, row.stripe_session_id);
            const mail = await sendRecoveryEmail(env, { to: email, key, sessionId: row.stripe_session_id });
            if (!mail.ok) {
              console.error('sendRecoveryEmail failed:', mail.error);
            }
          } catch (e) {
            console.error('sendRecoveryEmail failed:', e.message);
          }
        }

        return json({ ok: true }, 200, cors);
      }

      if (route === 'GET /v1/license') {
        const sessionId = url.searchParams.get('session_id') || '';
        if (!sessionId) return json({ ok: false, error: 'missing_session' }, 400, cors);

        const row = await env.DB.prepare('SELECT * FROM licenses WHERE stripe_session_id = ?')
          .bind(sessionId).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404, cors);
        if (!env.LICENSE_SECRET) {
          return json({ ok: false, error: 'server_misconfigured' }, 500, cors);
        }

        const key = await deriveLicenseKey(env.LICENSE_SECRET, sessionId);
        if ((await sha256Hex(key)) !== row.key_hash) {
          return json({ ok: false, error: 'key_mismatch' }, 500, cors);
        }

        return json({
          ok: true,
          key,
          plan: row.plan,
          status: row.status,
          currentPeriodEnd: row.current_period_end
        }, 200, cors);
      }

      if (route === 'POST /v1/redeem') {
        const body = await readJson(request, MAX_JSON_BYTES);
        const key = normalizeKey(body.key);
        const deviceId = String(body.deviceId || '').trim();
        if (!key || !deviceId) {
          return json({ ok: false, error: 'invalid_request' }, 400, cors);
        }

        const license = await findLicense(env, key);
        if (!license) return json({ ok: false, error: 'invalid_license' }, 401, cors);
        if (license.status !== 'active') {
          return json({ ok: false, error: 'license_' + license.status }, 402, cors);
        }

        const bound = await bindDevice(env, license.id, await sha256Hex(deviceId));
        if (!bound.ok) return json({ ok: false, error: bound.reason }, 403, cors);

        const quota = await quotaSnapshot(env, license);
        return json(licensePayload(license, quota), 200, cors);
      }

      if (route === 'GET /v1/me') {
        const auth = await requireLicense(request, env);
        if (auth.error) return json({ ok: false, error: auth.error }, auth.status, cors);
        const quota = await quotaSnapshot(env, auth.license);
        return json(licensePayload(auth.license, quota), 200, cors);
      }

      if (route === 'POST /v1/solve') {
        const auth = await requireLicense(request, env);
        if (auth.error) return json({ ok: false, error: auth.error }, auth.status, cors);

        const body = await readJson(request, MAX_SOLVE_BYTES);
        const result = await solveProxy(env, auth.license, body);
        return json(result.body, result.status, cors);
      }

      return json({ ok: false, error: 'not_found' }, 404, cors);
    } catch (err) {
      if (err && err.status) return json({ ok: false, error: err.message }, err.status, cors);
      return json({ ok: false, error: 'internal' }, 500, cors);
    }
  }
};
