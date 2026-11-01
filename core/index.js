// core/index.js — 배럴 (앱은 이 파일 하나만 import 한다)

export { fetchWithTimeout } from './http.js';
export { parseJson } from './json.js';
export { isQuotaError } from './errors.js';
export { callGeminiModel, fetchAvailableModels } from './gemini.js';
export {
  DEFAULT_API_BASE,
  callProxied,
  configureTransport,
  getOrCreateDeviceId,
  getTransport,
  isLicenseMode,
  resetTransport
} from './transport.js';
export {
  CACHE_SCHEMA_VERSION,
  DEFAULT_CACHE_MAX_AGE_MS,
  computeRequestHash,
  getCachedResponse,
  setCachedResponse
} from './cache.js';
export { normalizeMathExpr, isLocalMathMatch } from './math-expr.js';
