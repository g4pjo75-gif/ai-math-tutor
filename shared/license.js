// shared/license.js — 클라이언트 라이선스 저장소 및 기기 바인딩 관리
import {
  configureTransport,
  resetTransport,
  isLicenseMode,
  getOrCreateDeviceId,
  redeemLicense,
  fetchLicenseInfo,
  createPortalSession
} from '../core/index.js';
import { getApiBase } from './config.js';

export const LICENSE_KEY = 'license_key';
export const LICENSE_DEVICE_ID = 'license_device_id';
export const DEVICE_ID = 'device_id';

let rebindRequired = false;

export function licenseNeedsRebind() {
  return rebindRequired;
}

export function normalizeLicenseKey(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned.startsWith('AMT') || cleaned.length !== 19) return '';
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}-${cleaned.slice(11, 15)}-${cleaned.slice(15, 19)}`;
}

export function applyStoredLicense(storage) {
  if (!storage) {
    rebindRequired = false;
    resetTransport();
    configureTransport({ baseUrl: getApiBase() });
    return false;
  }

  const rawKey = storage.getItem(LICENSE_KEY);
  const key = normalizeLicenseKey(rawKey);
  if (!key) {
    rebindRequired = false;
    resetTransport();
    configureTransport({ baseUrl: getApiBase() });
    return false;
  }

  const currentDeviceId = getOrCreateDeviceId(storage, DEVICE_ID);
  const boundDeviceId = storage.getItem(LICENSE_DEVICE_ID);

  configureTransport({
    baseUrl: getApiBase(),
    mode: 'license',
    licenseKey: key,
    deviceId: currentDeviceId
  });

  if (boundDeviceId && boundDeviceId === currentDeviceId) {
    rebindRequired = false;
  } else {
    rebindRequired = true;
  }

  return true;
}

export async function registerLicense(storage, rawKey) {
  const key = normalizeLicenseKey(rawKey);
  if (!key) {
    const err = new Error('ライセンスキーが無効です。設定を確認してください。');
    err.code = 'invalid_license';
    err.status = 400;
    throw err;
  }

  const deviceId = getOrCreateDeviceId(storage, DEVICE_ID);
  const res = await redeemLicense({ licenseKey: key, deviceId, baseUrl: getApiBase() });

  if (storage) {
    storage.setItem(LICENSE_KEY, key);
    storage.setItem(LICENSE_DEVICE_ID, deviceId);
  }

  configureTransport({
    baseUrl: getApiBase(),
    mode: 'license',
    licenseKey: key,
    deviceId
  });
  rebindRequired = false;

  return res;
}

export function clearLicense(storage) {
  if (storage) {
    storage.removeItem(LICENSE_KEY);
    storage.removeItem(LICENSE_DEVICE_ID);
  }
  rebindRequired = false;
  resetTransport();
  configureTransport({ baseUrl: getApiBase() });
}

export async function refreshLicenseInfo() {
  if (rebindRequired || !isLicenseMode()) {
    return null;
  }
  return fetchLicenseInfo({ baseUrl: getApiBase() });
}

export async function openLicensePortal() {
  if (!isLicenseMode()) {
    const err = new Error('ライセンスモードが設定されていません。');
    err.code = 'transport_not_configured';
    err.status = 0;
    throw err;
  }
  return createPortalSession({ baseUrl: getApiBase() });
}
