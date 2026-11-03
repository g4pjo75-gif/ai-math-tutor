// tests/api-errors.test.js — Phase 7-5-C: API 오류 분류기 단위 테스트
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../core/index.js');

test('classifyApiError: auth codes (transport_not_configured, missing_license, invalid_license, 401)', async () => {
  const { classifyApiError } = await load();
  const c1 = classifyApiError({ code: 'transport_not_configured' });
  assert.equal(c1.kind, 'auth');
  assert.deepEqual(c1.actions, ['settings']);
  assert.equal(c1.retryable, false);

  const c2 = classifyApiError({ code: 'missing_license' });
  assert.equal(c2.kind, 'auth');
  assert.deepEqual(c2.actions, ['settings']);

  const c3 = classifyApiError({ code: 'invalid_license' });
  assert.equal(c3.kind, 'auth');
  assert.deepEqual(c3.actions, ['settings']);

  const c4 = classifyApiError({ status: 401 });
  assert.equal(c4.kind, 'auth');
  assert.deepEqual(c4.actions, ['settings']);
});

test('classifyApiError: billing codes (license_canceled, license_past_due, license_inactive, no_customer)', async () => {
  const { classifyApiError } = await load();
  const c1 = classifyApiError({ code: 'license_canceled' });
  assert.equal(c1.kind, 'billing');
  assert.deepEqual(c1.actions, ['portal']);

  const c2 = classifyApiError({ code: 'license_past_due' });
  assert.equal(c2.kind, 'billing');
  assert.deepEqual(c2.actions, ['portal']);

  const c3 = classifyApiError({ code: 'license_inactive' });
  assert.equal(c3.kind, 'billing');
  assert.deepEqual(c3.actions, ['portal', 'settings']);

  const c4 = classifyApiError({ code: 'no_customer' });
  assert.equal(c4.kind, 'billing');
  assert.deepEqual(c4.actions, ['settings']);
});

test('classifyApiError: quota codes (quota_exceeded, upstream_quota)', async () => {
  const { classifyApiError } = await load();
  const qInfo = { used: 300, limit: 300, remaining: 0, period: '2026-11' };
  const c1 = classifyApiError({ code: 'quota_exceeded', quota: qInfo });
  assert.equal(c1.kind, 'quota');
  assert.deepEqual(c1.actions, ['portal', 'settings']);
  assert.deepEqual(c1.quota, qInfo);

  const c2 = classifyApiError({ code: 'upstream_quota' });
  assert.equal(c2.kind, 'transient');
  assert.equal(c2.retryable, true);
  assert.deepEqual(c2.actions, ['retry']);
});

test('classifyApiError: rate_limited ≠ quota', async () => {
  const { classifyApiError, isQuotaError } = await load();
  const err = { code: 'rate_limited', message: 'Rate limited' };
  const c = classifyApiError(err);
  assert.equal(c.kind, 'rate_limit');
  assert.notEqual(c.kind, 'quota');
  assert.equal(c.retryable, true);
  assert.deepEqual(c.actions, ['retry']);
  // isQuotaError는 BYOK 호환용으로 true 반환 유지
  assert.equal(isQuotaError(err), true);
});

test('classifyApiError: device codes (device_not_bound, missing_device, device_limit)', async () => {
  const { classifyApiError } = await load();
  const c1 = classifyApiError({ code: 'device_not_bound' });
  assert.equal(c1.kind, 'device');
  assert.deepEqual(c1.actions, ['settings']);

  const c2 = classifyApiError({ code: 'missing_device' });
  assert.equal(c2.kind, 'device');
  assert.deepEqual(c2.actions, ['settings']);

  const c3 = classifyApiError({ code: 'device_limit' });
  assert.equal(c3.kind, 'device_limit');
  assert.deepEqual(c3.actions, []);
  assert.equal(c3.retryable, false);
});

test('classifyApiError: transient codes (timeout, network_error, upstream_error, stripe_error)', async () => {
  const { classifyApiError } = await load();
  const codes = ['timeout', 'network_error', 'upstream_error', 'stripe_error'];
  for (const code of codes) {
    const c = classifyApiError({ code });
    assert.equal(c.kind, 'transient');
    assert.equal(c.retryable, true);
    assert.deepEqual(c.actions, ['retry']);
  }
});

test('classifyApiError: input and server codes', async () => {
  const { classifyApiError } = await load();
  const inputCodes = [
    'invalid_request', 'invalid_prompt', 'prompt_too_large', 'image_too_large',
    'invalid_image', 'invalid_schema', 'schema_too_large',
    'body_too_large', 'invalid_json'
  ];
  for (const code of inputCodes) {
    const c = classifyApiError({ code });
    assert.equal(c.kind, 'input');
    assert.deepEqual(c.actions, ['input']);
    assert.equal(c.retryable, false);
  }

  const s = classifyApiError({ code: 'server_misconfigured' });
  assert.equal(s.kind, 'server');
  assert.equal(s.retryable, false);
  assert.deepEqual(s.actions, []);
});

test('classifyApiError: AbortError maps to timeout transient', async () => {
  const { classifyApiError } = await load();
  const c = classifyApiError({ name: 'AbortError', message: 'This operation was aborted' });
  assert.equal(c.kind, 'transient');
  assert.equal(c.code, 'timeout');
  assert.equal(c.status, 504);
  assert.equal(c.retryable, true);
  assert.deepEqual(c.actions, ['retry']);
  assert.equal(c.message, 'AIの応答がタイムアウトしました。もう一度お試しください。');
});

test('classifyApiError: unknown fallback (proxy_503 retry, proxy_404 no retry)', async () => {
  const { classifyApiError } = await load();
  const c503 = classifyApiError({ code: 'proxy_503', status: 503 });
  assert.equal(c503.kind, 'unknown');
  assert.equal(c503.retryable, true);
  assert.deepEqual(c503.actions, ['retry']);

  const c404 = classifyApiError({ code: 'proxy_404', status: 404 });
  assert.equal(c404.kind, 'unknown');
  assert.equal(c404.retryable, false);
  assert.deepEqual(c404.actions, []);
});

test('classifyApiError: budget_exceeded maps to non-retryable budget', async () => {
  const { classifyApiError } = await load();
  const c = classifyApiError({
    code: 'budget_exceeded',
    message: 'システムの利用上限に達しました。管理者にお問い合わせください。'
  });
  assert.equal(c.kind, 'budget');
  assert.equal(c.retryable, false);
  assert.deepEqual(c.actions, []);
  assert.equal(c.message, 'システムの利用上限に達しました。管理者にお問い合わせください。');
});
