// server/test/devices.test.js — 기기 등록 해제 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { unlinkDevices } from '../src/devices.js';
import { hashKey, sha256Hex } from '../src/license.js';

function createMockDb() {
  const state = {
    licenses: [],
    devices: []
  };

  return {
    state,
    prepare: (query) => ({
      bind: (...args) => ({
        all: async () => {
          if (query.includes('FROM licenses WHERE LOWER(email) = ?')) {
            const email = args[0];
            const rows = state.licenses.filter(
              (l) => l.email && l.email.toLowerCase() === email.toLowerCase()
            );
            return { results: rows };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes('FROM licenses WHERE key_hash = ?')) {
            const keyHash = args[0];
            const row = state.licenses.find((l) => l.key_hash === keyHash);
            return row || null;
          }
          return null;
        },
        run: async () => {
          if (query.includes('DELETE FROM devices WHERE license_id = ? AND device_hash = ?')) {
            const [licId, devHash] = args;
            const prevLen = state.devices.length;
            state.devices = state.devices.filter(
              (d) => !(d.license_id === licId && d.device_hash === devHash)
            );
            return { meta: { changes: prevLen - state.devices.length } };
          }
          if (query.includes('DELETE FROM devices WHERE license_id = ?')) {
            const [licId] = args;
            const prevLen = state.devices.length;
            state.devices = state.devices.filter((d) => d.license_id !== licId);
            return { meta: { changes: prevLen - state.devices.length } };
          }
          return { meta: { changes: 0 } };
        }
      })
    })
  };
}

test('devices: email로 라이선스 찾고 특정 device hash 삭제', async () => {
  const db = createMockDb();
  db.state.licenses.push({ id: 'lic_1', email: 'user@example.com' });
  const devHash1 = await sha256Hex('device_phone');
  const devHash2 = await sha256Hex('device_tablet');
  db.state.devices.push(
    { license_id: 'lic_1', device_hash: devHash1 },
    { license_id: 'lic_1', device_hash: devHash2 }
  );

  const res = await unlinkDevices(db, { email: 'User@Example.com', deviceId: 'device_phone' });
  assert.equal(res.ok, true);
  assert.equal(res.unlinkedCount, 1);
  assert.equal(db.state.devices.length, 1);
  assert.equal(db.state.devices[0].device_hash, devHash2);
});

test('devices: licenseKey로 라이선스 찾고 all 삭제', async () => {
  const db = createMockDb();
  const rawKey = 'AMT-1111-2222-3333-4444';
  const keyHash = await hashKey(rawKey);
  db.state.licenses.push({ id: 'lic_2', key_hash: keyHash });
  db.state.devices.push(
    { license_id: 'lic_2', device_hash: 'hash_a' },
    { license_id: 'lic_2', device_hash: 'hash_b' }
  );

  const res = await unlinkDevices(db, { licenseKey: rawKey, all: true });
  assert.equal(res.ok, true);
  assert.equal(res.unlinkedCount, 2);
  assert.equal(db.state.devices.length, 0);
});

test('devices: 존재하지 않는 device / license는 no-op (0건 삭제)', async () => {
  const db = createMockDb();
  db.state.licenses.push({ id: 'lic_3', email: 'exist@example.com' });

  // 1. 등록된 디바이스가 없는 경우
  const res1 = await unlinkDevices(db, { email: 'exist@example.com', deviceId: 'none' });
  assert.equal(res1.ok, true);
  assert.equal(res1.unlinkedCount, 0);

  // 2. 라이선스가 없는 경우
  const res2 = await unlinkDevices(db, { email: 'no_such_user@example.com', all: true });
  assert.equal(res2.ok, true);
  assert.equal(res2.unlinkedCount, 0);
});
