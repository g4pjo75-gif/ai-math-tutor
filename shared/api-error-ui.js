// shared/api-error-ui.js — 오류 분류 결과를 UI HTML로 변환 (DOM 비의존)
import { classifyApiError } from '../core/index.js';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

export function buildApiErrorView(err, { retryAction = '', retryData = null } = {}) {
  const info = classifyApiError(err);
  const quota = info.quota && Number.isFinite(info.quota.remaining)
    ? `<div class="text-xs text-slate-600 dark:text-slate-300">残り <strong>${info.quota.remaining}</strong> / ${info.quota.limit} 回${info.quota.period ? `（${escapeHtml(info.quota.period)}）` : ''}</div>`
    : '';

  const actions = [];
  if (info.actions.includes('settings')) {
    actions.push('<button data-action="open-settings" class="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1 transition">⚙️ 設定を開く</button>');
  }
  if (info.actions.includes('portal')) {
    actions.push('<button data-action="license-portal" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1 transition">💳 契約管理</button>');
  }
  if (info.actions.includes('retry') && retryAction) {
    const data = retryData ? ` data-${escapeHtml(retryData.key)}="${escapeHtml(retryData.value)}"` : '';
    actions.push(`<button data-action="${escapeHtml(retryAction)}"${data} class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1 transition">🔄 もう一度試す</button>`);
  }

  const html = `
    <div class="space-y-2">
      <div class="font-bold text-red-700 dark:text-red-300">⚠️ ${escapeHtml(info.message)}</div>
      ${quota}
      ${actions.length ? `<div class="pt-1">${actions.join('')}</div>` : ''}
    </div>
  `.trim();
  return { info, html };
}
