// core/errors.js — API 오류 분류 (DOM 비의존)

export function isQuotaError(err) {
  const code = (err?.code || '').toLowerCase();
  if (code === 'quota_exceeded' || code === 'upstream_quota' || code === 'rate_limited') {
    return true;
  }
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('billing') ||
    msg.includes('limit: 0');
}

export function classifyApiError(err) {
  const isAbort = err?.name === 'AbortError';
  const code = String((isAbort ? 'timeout' : err?.code) || 'unknown');
  const status = Number(err?.status) || (isAbort ? 504 : 0);
  const quota = err?.quota || null;
  const message = isAbort
    ? 'AIの応答がタイムアウトしました。もう一度お試しください。'
    : (err?.message || '通信エラーが発生しました。もう一度お試しください。');
  const base = { code, status, quota, message, retryable: false, actions: [] };

  if (code === 'transport_not_configured' || code === 'missing_license' ||
      code === 'invalid_license' || status === 401) {
    return { ...base, kind: 'auth', actions: ['settings'] };
  }
  if (['license_canceled', 'license_past_due', 'license_inactive', 'no_customer'].includes(code)) {
    const actions = code === 'no_customer'
      ? ['settings']
      : (code === 'license_inactive' ? ['portal', 'settings'] : ['portal']);
    return { ...base, kind: 'billing', actions };
  }
  if (code === 'quota_exceeded') {
    return { ...base, kind: 'quota', actions: ['portal', 'settings'] };
  }
  if (code === 'rate_limited') {
    return { ...base, kind: 'rate_limit', retryable: true, actions: ['retry'] };
  }
  if (code === 'device_not_bound' || code === 'missing_device') {
    return { ...base, kind: 'device', actions: ['settings'] };
  }
  if (code === 'device_limit') {
    return { ...base, kind: 'device_limit' };
  }
  if (isAbort || ['timeout', 'network_error', 'upstream_error', 'upstream_quota', 'stripe_error'].includes(code)) {
    return { ...base, kind: 'transient', retryable: true, actions: ['retry'] };
  }
  if (code === 'server_misconfigured') {
    return { ...base, kind: 'server' };
  }
  if (status === 400 || status === 413 ||
      ['invalid_request', 'invalid_prompt', 'prompt_too_large', 'image_too_large',
       'invalid_image', 'invalid_schema', 'schema_too_large',
       'body_too_large', 'invalid_json'].includes(code)) {
    return { ...base, kind: 'input', actions: ['input'] };
  }
  return {
    ...base,
    kind: 'unknown',
    retryable: status >= 500,
    actions: status >= 500 ? ['retry'] : []
  };
}
