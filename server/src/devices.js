// server/src/devices.js — 기기 등록 해제 관리
import { hashKey, sha256Hex } from './license.js';

export async function unlinkDevices(db, { email, licenseKey, deviceId, all = false } = {}) {
  let licenseIds = [];

  if (email) {
    const rows = await db.prepare('SELECT id FROM licenses WHERE LOWER(email) = ?')
      .bind(String(email).trim().toLowerCase()).all();
    const results = rows.results || (Array.isArray(rows) ? rows : []);
    licenseIds = results.map((r) => r.id);
  } else if (licenseKey) {
    const keyHash = await hashKey(licenseKey);
    const row = await db.prepare('SELECT id FROM licenses WHERE key_hash = ?')
      .bind(keyHash).first();
    if (row) licenseIds = [row.id];
  }

  if (licenseIds.length === 0) {
    return { ok: true, unlinkedCount: 0 };
  }

  let totalDeleted = 0;

  for (const licId of licenseIds) {
    if (all) {
      const res = await db.prepare('DELETE FROM devices WHERE license_id = ?').bind(licId).run();
      totalDeleted += (res && res.meta && res.meta.changes) ?? (res && res.changes) ?? 0;
    } else if (deviceId) {
      const deviceHash = await sha256Hex(deviceId);
      const res = await db.prepare('DELETE FROM devices WHERE license_id = ? AND device_hash = ?')
        .bind(licId, deviceHash).run();
      totalDeleted += (res && res.meta && res.meta.changes) ?? (res && res.changes) ?? 0;
    }
  }

  return { ok: true, unlinkedCount: totalDeleted };
}
