// server/src/index.js — API 라우터 (7-3)
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

const VERSION = '0.3.0';
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
