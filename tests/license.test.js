// tests/license.test.js — Phase 7-5-B: shared/license 저장소 및 등록 헬퍼 테스트
const test = require('node:test');
const assert = require('node:assert/strict');

const loadLicense = () => import('../shared/license.js');
const loadTransport = () => import('../core/index.js');

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); return true; },
    removeItem: (k) => { m.delete(k); return true; },
    raw: m
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('license: 키 정규화 (normalizeLicenseKey)', async () => {
  const { normalizeLicenseKey } = await loadLicense();
  assert.equal(normalizeLicenseKey('amt-aaaa-bbbb-cccc-dddd'), 'AMT-AAAA-BBBB-CCCC-DDDD');
  assert.equal(normalizeLicenseKey('  AMT AAAABBBBCCCCDDDD  '), 'AMT-AAAA-BBBB-CCCC-DDDD');
  assert.equal(normalizeLicenseKey('AMT-1234-5678-90AB-CDEF'), 'AMT-1234-5678-90AB-CDEF');
  assert.equal(normalizeLicenseKey('XYZ-AAAA-BBBB-CCCC-DDDD'), '', 'AMT 접두사가 아니면 빈 문자열');
  assert.equal(normalizeLicenseKey('AMT-SHORT'), '', '길이 부족 시 빈 문자열');
  assert.equal(normalizeLicenseKey(null), '', '비문자열은 빈 문자열');
});

test('license: 키 없음 → BYOK', async () => {
  const { applyStoredLicense, licenseNeedsRebind } = await loadLicense();
  const { isLicenseMode, getTransport } = await loadTransport();
  const storage = fakeStorage();

  const applied = applyStoredLicense(storage);
  assert.equal(applied, false);
  assert.equal(isLicenseMode(), false);
  assert.equal(licenseNeedsRebind(), false);
  assert.equal(getTransport().mode, 'byok');
});

test('license: 기기 일치 → license, 네트워크 없음', async () => {
  const { applyStoredLicense, licenseNeedsRebind, LICENSE_KEY, LICENSE_DEVICE_ID, DEVICE_ID } = await loadLicense();
  const { isLicenseMode } = await loadTransport();
  const storage = fakeStorage({
    [LICENSE_KEY]: 'AMT-AAAA-BBBB-CCCC-DDDD',
    [DEVICE_ID]: 'dev-match-1',
    [LICENSE_DEVICE_ID]: 'dev-match-1'
  });

  const prev = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('should not call fetch'); };
  try {
    const applied = applyStoredLicense(storage);
    assert.equal(applied, true);
    assert.equal(isLicenseMode(), true);
    assert.equal(licenseNeedsRebind(), false);
    assert.equal(fetchCalled, false, '네트워크 호출 없음');
  } finally {
    globalThis.fetch = prev;
  }
});

test('license: 기기 불일치 → license + needsRebind', async () => {
  const { applyStoredLicense, licenseNeedsRebind, LICENSE_KEY, LICENSE_DEVICE_ID, DEVICE_ID } = await loadLicense();
  const { isLicenseMode } = await loadTransport();
  const storage = fakeStorage({
    [LICENSE_KEY]: 'AMT-AAAA-BBBB-CCCC-DDDD',
    [DEVICE_ID]: 'dev-new',
    [LICENSE_DEVICE_ID]: 'dev-old'
  });

  const applied = applyStoredLicense(storage);
  assert.equal(applied, true);
  assert.equal(isLicenseMode(), true);
  assert.equal(licenseNeedsRebind(), true, '기기 불일치 시 rebind 필요');
});

test('license: 등록 성공 → 키 2개 저장', async () => {
  const { registerLicense, licenseNeedsRebind, LICENSE_KEY, LICENSE_DEVICE_ID, DEVICE_ID } = await loadLicense();
  const { isLicenseMode, getTransport } = await loadTransport();
  const storage = fakeStorage({ [DEVICE_ID]: 'dev-reg-1' });

  const prev = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({
      ok: true,
      status: 'active',
      plan: 'standard',
      quota: { used: 0, limit: 300 }
    });
  };
  try {
    const res = await registerLicense(storage, 'amt-1111-2222-3333-4444');
    assert.equal(res.ok, true);
    assert.equal(seen.url.endsWith('/v1/redeem'), true);
    assert.equal(storage.getItem(LICENSE_KEY), 'AMT-1111-2222-3333-4444');
    assert.equal(storage.getItem(LICENSE_DEVICE_ID), 'dev-reg-1');
    assert.equal(isLicenseMode(), true);
    assert.equal(licenseNeedsRebind(), false);
    assert.equal(getTransport().deviceId, 'dev-reg-1');
  } finally {
    globalThis.fetch = prev;
  }
});

test('license: 등록 실패 → 저장 안 함', async () => {
  const { registerLicense, LICENSE_KEY, LICENSE_DEVICE_ID } = await loadLicense();
  const storage = fakeStorage();

  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ ok: false, error: 'device_limit' }, 403);
  try {
    await assert.rejects(
      registerLicense(storage, 'AMT-AAAA-BBBB-CCCC-DDDD'),
      (err) => {
        assert.equal(err.code, 'device_limit');
        assert.equal(err.status, 403);
        return true;
      }
    );
    assert.equal(storage.getItem(LICENSE_KEY), null);
    assert.equal(storage.getItem(LICENSE_DEVICE_ID), null);
  } finally {
    globalThis.fetch = prev;
  }
});

test('license: 해제 → 키 삭제 + BYOK', async () => {
  const { clearLicense, licenseNeedsRebind, LICENSE_KEY, LICENSE_DEVICE_ID } = await loadLicense();
  const { isLicenseMode, configureTransport } = await loadTransport();
  const storage = fakeStorage({
    [LICENSE_KEY]: 'AMT-AAAA-BBBB-CCCC-DDDD',
    [LICENSE_DEVICE_ID]: 'dev-1'
  });
  configureTransport({ mode: 'license', licenseKey: 'K', deviceId: 'dev-1' });

  clearLicense(storage);
  assert.equal(storage.getItem(LICENSE_KEY), null);
  assert.equal(storage.getItem(LICENSE_DEVICE_ID), null);
  assert.equal(licenseNeedsRebind(), false);
  assert.equal(isLicenseMode(), false);
});

test('license: 잘못된 형식 → 네트워크 호출 없음', async () => {
  const { registerLicense } = await loadLicense();
  const storage = fakeStorage();

  const prev = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('should not fetch'); };
  try {
    await assert.rejects(
      registerLicense(storage, 'invalid-key-format'),
      (err) => {
        assert.equal(err.code, 'invalid_license');
        assert.equal(err.status, 400);
        return true;
      }
    );
    assert.equal(fetchCalled, false, '네트워크 호출 발생 안 함');
  } finally {
    globalThis.fetch = prev;
  }
});
