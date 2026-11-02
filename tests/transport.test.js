// tests/transport.test.js — Phase 7-5-A: BYOK/구독 전환 transport
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../core/index.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); return true; },
    raw: m
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('transport: 기본값은 BYOK이고 라이선스 모드가 아니다', async () => {
  const { getTransport, isLicenseMode, resetTransport } = await load();
  resetTransport();
  assert.deepEqual(getTransport(), { mode: 'byok', baseUrl: '', licenseKey: '', deviceId: '' });
  assert.equal(isLicenseMode(), false);
});

test('transport: license 모드는 키와 baseUrl이 모두 있어야 성립', async () => {
  const { configureTransport, isLicenseMode, resetTransport, DEFAULT_API_BASE } = await load();
  resetTransport();

  configureTransport({ mode: 'license' });
  assert.equal(isLicenseMode(), false, '키 없음');

  const s = configureTransport({ licenseKey: ' AMT-AAAA-BBBB-CCCC-DDDD ' });
  assert.equal(s.baseUrl, DEFAULT_API_BASE, 'baseUrl 기본값');
  assert.equal(s.licenseKey, 'AMT-AAAA-BBBB-CCCC-DDDD', 'trim');
  assert.equal(isLicenseMode(), true);

  configureTransport({ licenseKey: '' });
  assert.equal(isLicenseMode(), false, '키 해제');
});

test('transport: undefined는 기존 값을 지우지 않는다', async () => {
  const { configureTransport, getTransport, resetTransport } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://x.test', deviceId: 'D' });
  configureTransport({ baseUrl: undefined, licenseKey: undefined, deviceId: undefined });
  assert.deepEqual(getTransport(), {
    mode: 'license',
    baseUrl: 'https://x.test',
    licenseKey: 'K',
    deviceId: 'D'
  });
});

test('transport: resetTransport는 전부 초기화한다', async () => {
  const { configureTransport, getTransport, resetTransport } = await load();
  configureTransport({ mode: 'license', licenseKey: 'K', deviceId: 'D' });
  resetTransport();
  assert.deepEqual(getTransport(), { mode: 'byok', baseUrl: '', licenseKey: '', deviceId: '' });
});

test('deviceId: 최초 1회 생성 후 재사용, storage 없으면 빈 문자열', async () => {
  const { getOrCreateDeviceId } = await load();
  const storage = fakeStorage();
  const a = getOrCreateDeviceId(storage, 'device_id');
  const b = getOrCreateDeviceId(storage, 'device_id');
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.equal(a, b);
  assert.equal(storage.raw.get('device_id'), a);
  assert.equal(getOrCreateDeviceId(null), '');
});

test('callProxied: BYOK에서는 호출을 거부한다', async () => {
  const { resetTransport, callProxied } = await load();
  resetTransport();
  await assert.rejects(callProxied({ prompt: 'x' }), (err) => {
    assert.equal(err.code, 'transport_not_configured');
    assert.equal(err.status, 0);
    return true;
  });
});

test('callProxied: URL/헤더/본문을 프록시 규격으로 보낸다', async () => {
  const { configureTransport, resetTransport, callProxied } = await load();
  resetTransport();
  configureTransport({
    mode: 'license',
    licenseKey: 'AMT-AAAA-BBBB-CCCC-DDDD',
    baseUrl: 'https://api.test/',
    deviceId: 'dev-1'
  });

  const prev = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ ok: true, cached: false, data: { a: 1 }, usage: { in: 3, out: 4, costYen: 0.002 }, quota: { used: 1, limit: 300 } });
  };
  try {
    const body = await callProxied({ prompt: 'p', rawText: true, timeoutMs: 12000 });
    assert.equal(seen.url, 'https://api.test/v1/solve');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.Authorization, 'Bearer AMT-AAAA-BBBB-CCCC-DDDD');
    assert.equal(seen.init.headers['X-Device-Id'], 'dev-1');
    assert.equal(seen.init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(seen.init.body), { prompt: 'p', rawText: true, timeoutMs: 12000 });
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, { a: 1 });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callProxied: deviceId가 없으면 X-Device-Id를 보내지 않는다', async () => {
  const { configureTransport, resetTransport, callProxied } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  let headers = null;
  globalThis.fetch = async (url, init) => {
    headers = init.headers;
    return jsonResponse({ ok: true, data: 'x' });
  };
  try {
    await callProxied({ prompt: 'p' });
    assert.equal(headers['X-Device-Id'], undefined);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callProxied: 오류 응답은 code/status/quota로 전달한다', async () => {
  const { configureTransport, resetTransport, callProxied } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    ok: false,
    error: 'quota_exceeded',
    quota: { used: 300, limit: 300, remaining: 0 }
  }, 402);
  try {
    await assert.rejects(callProxied({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'quota_exceeded');
      assert.equal(err.status, 402);
      assert.deepEqual(err.quota, { used: 300, limit: 300, remaining: 0 });
      assert.match(err.message, /上限/);
      return true;
    });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callProxied: 200이어도 ok:true가 아니면 실패로 본다', async () => {
  const { configureTransport, resetTransport, callProxied } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ ok: false, error: 'invalid_license' }, 200);
  try {
    await assert.rejects(callProxied({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'invalid_license');
      assert.equal(err.status, 200);
      return true;
    });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callProxied: JSON이 아닌 오류 응답은 proxy_<status>로 처리', async () => {
  const { configureTransport, resetTransport, callProxied } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
  try {
    await assert.rejects(callProxied({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'proxy_502');
      assert.equal(err.status, 502);
      return true;
    });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callProxied: 타임아웃/네트워크 오류를 구분한다', async () => {
  const { configureTransport, resetTransport, callProxied } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    await assert.rejects(callProxied({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'timeout');
      assert.equal(err.status, 504);
      return true;
    });

    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(callProxied({ prompt: 'p' }), (err) => {
      assert.equal(err.code, 'network_error');
      assert.equal(err.status, 0);
      return true;
    });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: 라이선스 모드면 apiKey 없이 프록시로 보낸다', async () => {
  const { configureTransport, resetTransport, callGeminiModel } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test', deviceId: 'D' });

  const prev = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({
      ok: true,
      cached: false,
      data: { answer: 42 },
      usage: { in: 10, out: 5, costYen: 0.003 },
      quota: { used: 2, limit: 300, remaining: 298, period: '2026-11' }
    });
  };
  try {
    const out = await callGeminiModel('gemini-3.8-flash', null, 'solve this', null, {
      schema: { type: 'object' },
      temperature: 0.2,
      maxOutputTokens: 1000
    });
    assert.deepEqual(out, { answer: 42 });
    assert.match(seen.url, /\/v1\/solve$/);
    const sent = JSON.parse(seen.init.body);
    assert.equal(sent.prompt, 'solve this');
    assert.deepEqual(sent.schema, { type: 'object' });
    assert.equal(sent.temperature, 0.2);
    assert.equal(sent.maxOutputTokens, 1000);
    assert.equal(sent.rawText, false);
    assert.equal(sent.image, undefined);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: withMeta는 data/usage/cached/quota를 돌려준다', async () => {
  const { configureTransport, resetTransport, callGeminiModel } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    ok: true,
    cached: true,
    data: { a: 1 },
    usage: { in: 0, out: 0, costYen: 0 },
    quota: { used: 3, limit: 300 }
  });
  try {
    const r = await callGeminiModel({ promptText: 'p', schema: { type: 'object' }, withMeta: true });
    assert.deepEqual(r.data, { a: 1 });
    assert.deepEqual(r.usage, { in: 0, out: 0, costYen: 0 });
    assert.equal(r.cached, true);
    assert.deepEqual(r.quota, { used: 3, limit: 300 });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: rawText와 이미지를 프록시 본문에 넣는다', async () => {
  const { configureTransport, resetTransport, callGeminiModel } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return jsonResponse({ ok: true, data: 'OK', usage: { in: 5, out: 1 } });
  };
  try {
    const out = await callGeminiModel({ promptText: 'reply OK', imageBase64: 'AAAA', rawText: true });
    assert.equal(out, 'OK');
    assert.equal(sent.rawText, true);
    assert.equal(sent.image, 'AAAA');
    assert.equal(sent.schema, null);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: 프록시 오류를 code와 함께 전파한다', async () => {
  const { configureTransport, resetTransport, callGeminiModel } = await load();
  resetTransport();
  configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });

  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    ok: false,
    error: 'license_canceled',
    quota: { used: 0, limit: 0, remaining: 0 }
  }, 402);
  try {
    await assert.rejects(callGeminiModel({ promptText: 'p' }), (err) => {
      assert.equal(err.code, 'license_canceled');
      assert.equal(err.status, 402);
      assert.match(err.message, /サブスクリプション/);
      return true;
    });
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: BYOK는 기존처럼 apiKey가 필요하다', async () => {
  const { resetTransport, callGeminiModel } = await load();
  resetTransport();
  await assert.rejects(
    callGeminiModel('gemini-3.8-flash', '', 'p', null, {}),
    /Gemini APIキーが設定されていません/
  );
});

test('redeemLicense: URL/body/headers를 규격대로 보낸다', async () => {
  const { redeemLicense, resetTransport } = await load();
  resetTransport();
  const prev = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ ok: true, status: 'active', plan: 'standard', quota: { used: 0, limit: 300 } });
  };
  try {
    const res = await redeemLicense({
      licenseKey: ' AMT-AAAA-BBBB-CCCC-DDDD ',
      deviceId: 'dev-99',
      baseUrl: 'https://api.test'
    });
    assert.equal(seen.url, 'https://api.test/v1/redeem');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.Authorization, undefined);
    assert.equal(seen.init.headers['X-Device-Id'], undefined);
    assert.deepEqual(JSON.parse(seen.init.body), {
      key: 'AMT-AAAA-BBBB-CCCC-DDDD',
      deviceId: 'dev-99'
    });
    assert.equal(res.ok, true);
    assert.equal(res.status, 'active');
  } finally {
    globalThis.fetch = prev;
  }
});

test('fetchLicenseInfo: GET /v1/me 에 Authorization과 X-Device-Id를 보낸다', async () => {
  const { configureTransport, resetTransport, fetchLicenseInfo } = await load();
  resetTransport();
  configureTransport({
    mode: 'license',
    licenseKey: 'AMT-AAAA-BBBB-CCCC-DDDD',
    deviceId: 'dev-1',
    baseUrl: 'https://api.test'
  });
  const prev = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ ok: true, status: 'active', quota: { used: 5, limit: 300 } });
  };
  try {
    const res = await fetchLicenseInfo();
    assert.equal(seen.url, 'https://api.test/v1/me');
    assert.equal(seen.init.method, 'GET');
    assert.equal(seen.init.headers.Authorization, 'Bearer AMT-AAAA-BBBB-CCCC-DDDD');
    assert.equal(seen.init.headers['X-Device-Id'], 'dev-1');
    assert.equal(res.ok, true);
    assert.equal(res.quota.used, 5);
  } finally {
    globalThis.fetch = prev;
  }
});

test('createPortalSession: POST /v1/portal 에 Authorization을 보낸다', async () => {
  const { configureTransport, resetTransport, createPortalSession } = await load();
  resetTransport();
  configureTransport({
    mode: 'license',
    licenseKey: 'AMT-AAAA-BBBB-CCCC-DDDD',
    baseUrl: 'https://api.test'
  });
  const prev = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return jsonResponse({ ok: true, url: 'https://billing.stripe.com/p/session_123' });
  };
  try {
    const res = await createPortalSession();
    assert.equal(seen.url, 'https://api.test/v1/portal');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.Authorization, 'Bearer AMT-AAAA-BBBB-CCCC-DDDD');
    assert.equal(res.ok, true);
    assert.equal(res.url, 'https://billing.stripe.com/p/session_123');
  } finally {
    globalThis.fetch = prev;
  }
});

test('license 헬퍼 오류: code/status/quota가 적절히 전달된다', async () => {
  const { configureTransport, resetTransport, redeemLicense, fetchLicenseInfo, createPortalSession } = await load();
  resetTransport();

  // 1. 미설정 시 fetchLicenseInfo / createPortalSession 거부
  await assert.rejects(fetchLicenseInfo(), (err) => {
    assert.equal(err.code, 'transport_not_configured');
    assert.equal(err.status, 0);
    return true;
  });
  await assert.rejects(createPortalSession(), (err) => {
    assert.equal(err.code, 'transport_not_configured');
    assert.equal(err.status, 0);
    return true;
  });

  // 2. redeemLicense 파라미터 누락
  await assert.rejects(redeemLicense({}), (err) => {
    assert.equal(err.code, 'invalid_request');
    assert.equal(err.status, 400);
    return true;
  });

  // 3. 서버 오류 (redeem: 403 device_limit)
  const prev = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse({ ok: false, error: 'device_limit' }, 403);
    await assert.rejects(redeemLicense({ licenseKey: 'K', deviceId: 'D', baseUrl: 'https://api.test' }), (err) => {
      assert.equal(err.code, 'device_limit');
      assert.equal(err.status, 403);
      return true;
    });

    // 4. 서버 오류 (fetchLicenseInfo: 402 quota_exceeded)
    configureTransport({ mode: 'license', licenseKey: 'K', baseUrl: 'https://api.test' });
    globalThis.fetch = async () => jsonResponse({ ok: false, error: 'quota_exceeded', quota: { used: 300, limit: 300 } }, 402);
    await assert.rejects(fetchLicenseInfo(), (err) => {
      assert.equal(err.code, 'quota_exceeded');
      assert.equal(err.status, 402);
      assert.deepEqual(err.quota, { used: 300, limit: 300 });
      return true;
    });
  } finally {
    globalThis.fetch = prev;
  }
});
