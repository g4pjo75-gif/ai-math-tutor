// core/errors.js — API 오류 분류 (DOM 비의존)

export function isQuotaError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('billing') ||
    msg.includes('limit: 0');
}
