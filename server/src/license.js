// server/src/license.js — 라이선스 발급·검증·기기 바인딩·쿼터

// Crockford Base32: 혼동되는 I, L, O, U 제외
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_LEN = 16; // AMT + 16자 → AMT-XXXX-XXXX-XXXX-XXXX (80bit)

export function generateLicenseKey() {
  const bytes = new Uint8Array(KEY_LEN);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const b of bytes) raw += ALPHABET[b % ALPHABET.length];
  return 'AMT-' + raw.match(/.{4}/g).join('-');
}

export function normalizeKey(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s.startsWith('AMT') || s.length !== 3 + KEY_LEN) return '';
  return 'AMT-' + s.slice(3).match(/.{4}/g).join('-');
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashKey(key) {
  const norm = normalizeKey(key);
  return norm ? sha256Hex(norm) : '';
}

export function periodOf(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function createLicense(env, { email = null, plan = 'monthly', limit = 300, days = 30 } = {}) {
  const key = generateLicenseKey();
  const keyHash = await hashKey(key);
  const id = 'lic_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now = Date.now();
  const periodEnd = now + days * 86400000;

  await env.DB.prepare(
    'INSERT INTO licenses (id, key_hash, email, plan, status, call_limit, current_period_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, keyHash, email, plan, 'active', limit, periodEnd, now).run();

  return { id, key, keyHash, periodEnd };
}

export async function findLicense(env, key) {
  const h = await hashKey(key);
  if (!h) return null;
  return env.DB.prepare('SELECT * FROM licenses WHERE key_hash = ?').bind(h).first();
}

export async function bindDevice(env, licenseId, deviceHash, maxDevices = 2) {
  const now = Date.now();

  const existing = await env.DB.prepare(
    'SELECT 1 AS ok FROM devices WHERE license_id = ? AND device_hash = ?'
  ).bind(licenseId, deviceHash).first();

  if (existing) {
    await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE license_id = ? AND device_hash = ?')
      .bind(now, licenseId, deviceHash).run();
    return { ok: true, newDevice: false };
  }

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE license_id = ?')
    .bind(licenseId).first();
  if ((count && count.n ? count.n : 0) >= maxDevices) {
    return { ok: false, reason: 'device_limit' };
  }

  await env.DB.prepare('INSERT INTO devices (license_id, device_hash, first_seen, last_seen) VALUES (?, ?, ?, ?)')
    .bind(licenseId, deviceHash, now, now).run();
  return { ok: true, newDevice: true };
}

export async function getUsage(env, licenseId, period = periodOf()) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM usage WHERE license_id = ? AND period = ?')
    .bind(licenseId, period).first();
  return (row && row.n) || 0;
}

// Authorization: Bearer <license> + X-Device-Id 필수
export async function requireLicense(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: 'missing_license', status: 401 };

  const license = await findLicense(env, m[1].trim());
  if (!license) return { error: 'invalid_license', status: 401 };
  if (license.status !== 'active') return { error: 'license_' + license.status, status: 402 };

  const deviceId = (request.headers.get('X-Device-Id') || '').trim();
  if (!deviceId) return { error: 'missing_device', status: 400 };

  const deviceHash = await sha256Hex(deviceId);
  const bound = await env.DB.prepare(
    'SELECT 1 AS ok FROM devices WHERE license_id = ? AND device_hash = ?'
  ).bind(license.id, deviceHash).first();
  if (!bound) return { error: 'device_not_bound', status: 403 };

  return { license, deviceHash };
}

export async function quotaSnapshot(env, license) {
  const used = await getUsage(env, license.id);
  const limit = Number(license.call_limit) || 0;
  return { used, limit, remaining: Math.max(0, limit - used), period: periodOf() };
}
