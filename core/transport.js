// core/transport.js — BYOK(직접 호출) / 구독(프록시) 전환
import { fetchWithTimeout } from './http.js';

export const DEFAULT_API_BASE = 'https://ai-math-tutor-api.g4pjo75.workers.dev';

const state = {
  mode: 'byok', // 'byok' | 'license'
  baseUrl: '',
  licenseKey: '',
  deviceId: ''
};

// UI에 그대로 보여줄 수 있는 기본 메시지. 세부 UX는 7-5-C에서 다듬는다.
const MESSAGES = {
  transport_not_configured: 'ライセンスモードが設定されていません。',
  invalid_license: 'ライセンスキーが無効です。設定を確認してください。',
  missing_license: 'ライセンスキーが設定されていません。',
  license_canceled: 'サブスクリプションが終了しています。',
  license_past_due: 'お支払いに問題があります。契約管理ページをご確認ください。',
  license_inactive: 'ライセンスが有効ではありません。',
  missing_device: '端末の認証情報がありません。アプリを再読み込みしてください。',
  device_not_bound: 'この端末はライセンスに登録されていません。設定からキーを再登録してください。',
  device_limit: '登録できる端末数（2台）の上限に達しました。',
  quota_exceeded: '今月の利用上限に達しました。',
  rate_limited: 'リクエストが多すぎます。少し待ってからお試しください。',
  timeout: 'AIの応答がタイムアウトしました。もう一度お試しください。',
  network_error: 'サーバーに接続できませんでした。通信環境を確認してください。',
  invalid_request: 'リクエストが不正です。',
  invalid_prompt: '入力内容を確認してください。',
  prompt_too_large: '入力が長すぎます。内容を分けてお試しください。',
  image_too_large: '画像が大きすぎます。別の画像でお試しください。',
  upstream_quota: 'AIの利用上限に達しました。時間をおいてお試しください。',
  upstream_error: 'AIの応答でエラーが発生しました。もう一度お試しください。',
  server_misconfigured: 'サーバー設定に問題があります。管理者にお問い合わせください。'
};

function proxyError(code, status, extra = {}) {
  const err = new Error(MESSAGES[code] || '通信エラーが発生しました。もう一度お試しください。');
  err.code = code;
  err.status = status;
  Object.assign(err, extra);
  return err;
}

export function apiUrl(path = '', baseUrl = '') {
  const base = (baseUrl || state.baseUrl || DEFAULT_API_BASE).replace(/\/+$/, '');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${base}/${cleanPath}`;
}

async function requestApi(path, options = {}) {
  const url = apiUrl(path, options.baseUrl);
  const timeoutMs = Number(options.timeoutMs) || 30000;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const key = options.licenseKey !== undefined ? options.licenseKey : state.licenseKey;
  if (key && !headers.Authorization) {
    headers.Authorization = 'Bearer ' + key;
  }
  const deviceId = options.deviceId !== undefined ? options.deviceId : state.deviceId;
  if (deviceId && !headers['X-Device-Id']) {
    headers['X-Device-Id'] = deviceId;
  }

  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    }, timeoutMs + 5000);
  } catch (err) {
    if (err && err.name === 'AbortError') throw proxyError('timeout', 504);
    throw proxyError('network_error', 0);
  }

  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    body = null;
  }

  if (!res.ok || !body || body.ok !== true) {
    const code = (body && body.error) || 'proxy_' + res.status;
    throw proxyError(code, res.status, { quota: (body && body.quota) || null });
  }

  return body;
}

export function configureTransport(next = {}) {
  if (next.mode === 'byok' || next.mode === 'license') state.mode = next.mode;
  if (typeof next.baseUrl === 'string') state.baseUrl = next.baseUrl.trim();
  if (typeof next.licenseKey === 'string') state.licenseKey = next.licenseKey.trim();
  if (typeof next.deviceId === 'string') state.deviceId = next.deviceId.trim();
  if (state.mode === 'license' && !state.baseUrl) state.baseUrl = DEFAULT_API_BASE;
  return { ...state };
}

export function resetTransport() {
  state.mode = 'byok';
  state.baseUrl = '';
  state.licenseKey = '';
  state.deviceId = '';
}

export function getTransport() {
  return { ...state };
}

export function isLicenseMode() {
  return state.mode === 'license' && Boolean(state.licenseKey) && Boolean(state.baseUrl);
}

// 기기 ID는 앱 공용(tutor_ 프리픽스 스토리지)으로 저장한다.
export function getOrCreateDeviceId(storage, key = 'device_id') {
  if (!storage) return '';
  let id = storage.getItem(key);
  if (!id) {
    const c = globalThis.crypto;
    id = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    storage.setItem(key, id);
  }
  return id;
}

export async function callProxied(payload = {}) {
  if (!isLicenseMode()) {
    throw proxyError('transport_not_configured', 0);
  }
  return requestApi('/v1/solve', {
    method: 'POST',
    body: payload,
    timeoutMs: Number(payload.timeoutMs) || 30000
  });
}

export async function redeemLicense({ licenseKey, deviceId, baseUrl, timeoutMs } = {}) {
  const key = String(licenseKey || '').trim();
  const devId = String(deviceId || '').trim();
  if (!key || !devId) {
    throw proxyError('invalid_request', 400);
  }
  return requestApi('/v1/redeem', {
    method: 'POST',
    baseUrl,
    licenseKey: '',
    deviceId: '',
    body: { key, deviceId: devId },
    timeoutMs: timeoutMs || 15000
  });
}

export async function fetchLicenseInfo(options = {}) {
  if (!isLicenseMode()) {
    throw proxyError('transport_not_configured', 0);
  }
  return requestApi('/v1/me', {
    method: 'GET',
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs || 15000
  });
}

export async function createPortalSession(options = {}) {
  if (!isLicenseMode()) {
    throw proxyError('transport_not_configured', 0);
  }
  return requestApi('/v1/portal', {
    method: 'POST',
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs || 15000
  });
}
