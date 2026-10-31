// core/cache.js — 요청 지문 + 로컬 캐시 (DOM 비의존, storage는 인자로 받는다)

export const CACHE_SCHEMA_VERSION = 2;
export const DEFAULT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export function computeRequestHash({ mode = 'default', unit = '', text = '', imageBase64 = '' } = {}) {
  const img = String(imageBase64 || '');
  const imgLen = img.length;
  const imgSample = imgLen > 0
    ? `${imgLen}:${img.slice(0, 256)}:${img.slice(Math.floor(imgLen / 2), Math.floor(imgLen / 2) + 256)}:${img.slice(Math.max(0, imgLen - 256))}`
    : 'no-img';
  const raw = `${mode}|${String(unit).trim()}|${String(text).trim()}|${imgSample}`;

  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2, 33) ^ ch;
  }
  return `fp_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}_${raw.length}`;
}

export function getCachedResponse(storage, cacheKey, fingerprint, maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS) {
  if (!storage || !cacheKey || !fingerprint) return null;
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const now = Date.now();
    const hit = list.find(item => {
      if (!item || item.fp !== fingerprint) return false;
      if (item.v !== CACHE_SCHEMA_VERSION) return false;
      if (item.savedAt && (now - item.savedAt) > maxAgeMs) return false;
      return true;
    });
    return hit ? hit.data : null;
  } catch (e) {
    return null;
  }
}

export function setCachedResponse(storage, cacheKey, fingerprint, data, maxEntries = 15) {
  if (!storage || !cacheKey || !fingerprint || !data) return;
  try {
    const raw = storage.getItem(cacheKey);
    let list = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) {}
    }
    list = list.filter(item => item && item.fp !== fingerprint && item.v === CACHE_SCHEMA_VERSION);
    list.unshift({ v: CACHE_SCHEMA_VERSION, fp: fingerprint, savedAt: Date.now(), data });
    if (list.length > maxEntries) {
      list = list.slice(0, maxEntries);
    }
    let ok = storage.setItem(cacheKey, JSON.stringify(list));
    if (!ok && list.length > 3) {
      list = list.slice(0, 3);
      storage.setItem(cacheKey, JSON.stringify(list));
    }
  } catch (e) {}
}
