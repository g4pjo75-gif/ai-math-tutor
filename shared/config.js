// shared/config.js — 환경별 API base 결정
export const PROD_API_BASE = 'https://ai-math-tutor-api.g4pjo75.workers.dev';
export const STAGING_API_BASE = 'https://ai-math-tutor-api-staging.g4pjo75.workers.dev';

const STAGING_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'ai-math-tutor-staging.g4pjo75.workers.dev'
]);

export function resolveApiBase(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (STAGING_HOSTS.has(h) || h.endsWith('.pages.dev'))
    ? STAGING_API_BASE
    : PROD_API_BASE;
}

export function getApiBase() {
  return resolveApiBase(globalThis.location?.hostname || '');
}
