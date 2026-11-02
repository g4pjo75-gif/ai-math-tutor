import { safeStorage, sharedStore } from './state.js';
import { checkApiKeyWarning } from './init.js';
import { fetchAvailableModels as fetchModelsFromApi, isLicenseMode, classifyApiError } from '../core/index.js';
import {
  LICENSE_KEY,
  normalizeLicenseKey,
  licenseNeedsRebind,
  registerLicense,
  clearLicense,
  refreshLicenseInfo,
  openLicensePortal
} from '../shared/license.js';
import { showStatus } from './ui-status.js';
import { escapeHtml } from './chat-overall.js';

    // =========================================================================
    // 3. 設定モーダル & ライセンス管理 / ListModels API
    // =========================================================================
export function openSettings() {
      document.getElementById('geminiKeyInput').value = safeStorage.getItem('gemini_api_key') || '';
      document.getElementById('customModelInput').value = safeStorage.getItem('custom_model_id') || '';
      document.getElementById('newPinInput').value = safeStorage.getItem('app_pin') || '1234';

      const licenseInput = document.getElementById('licenseKeyInput');
      if (licenseInput) {
        licenseInput.value = sharedStore ? (sharedStore.getItem(LICENSE_KEY) || '') : '';
      }

      applyLicenseModeUi();
      refreshLicenseStatus();

      const modal = document.getElementById('settingsModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

export function closeSettings() {
      const modal = document.getElementById('settingsModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

export async function saveSettings() {
      const geminiKey = document.getElementById('geminiKeyInput').value.trim();
      const customModel = document.getElementById('customModelInput').value.trim();
      const newPin = document.getElementById('newPinInput').value.trim() || '1234';
      const rawLicense = document.getElementById('licenseKeyInput')?.value?.trim() || '';
      const normalizedLicense = normalizeLicenseKey(rawLicense);
      const wasLicenseMode = isLicenseMode();

      safeStorage.setItem('app_pin', newPin);

      // 1. BYOK 저장을 먼저 수행
      if (!wasLicenseMode) {
        const prevKey = safeStorage.getItem('gemini_api_key');
        safeStorage.setItem('gemini_api_key', geminiKey);
        safeStorage.setItem('custom_model_id', customModel);

        if (customModel) {
          addOrSelectModelOption(customModel, `${customModel} (カスタム指定)`);
        }

        // ライセンス登録を同時に行う場合はモデル取得しない
        if (geminiKey && geminiKey !== prevKey && !normalizedLicense) {
          fetchAvailableModels().catch(() => {});
        }
      }

      // 2. 라이선스 등록
      if (rawLicense) {
        if (!normalizedLicense) {
          renderLicenseError(new Error('ライセンスキーが無効です。設定を確認してください。'));
          return;
        }

        const savedLicense = sharedStore ? (sharedStore.getItem(LICENSE_KEY) || '') : '';
        if (normalizedLicense !== savedLicense || licenseNeedsRebind()) {
          try {
            await registerLicense(sharedStore, normalizedLicense);
          } catch (err) {
            renderLicenseError(err);
            return;
          }
        }
      }

      applyLicenseModeUi();
      checkApiKeyWarning();
      closeSettings();
      showStatus('✅ 設定を保存しました。', 'blue');
    }

export function applyLicenseModeUi() {
      const licenseMode = isLicenseMode();

      const modelSelect = document.getElementById('modelSelect');
      if (modelSelect) {
        if (licenseMode) modelSelect.classList.add('hidden');
        else modelSelect.classList.remove('hidden');
      }

      const byokSection = document.getElementById('byokSettingsSection');
      if (byokSection) {
        if (licenseMode) byokSection.classList.add('hidden');
        else byokSection.classList.remove('hidden');
      }

      const licenseActions = document.getElementById('licenseActions');
      if (licenseActions) {
        if (licenseMode) licenseActions.classList.remove('hidden');
        else licenseActions.classList.add('hidden');
      }
    }

export async function refreshLicenseStatus() {
      const statusEl = document.getElementById('licenseStatus');
      if (!statusEl) return;

      if (!isLicenseMode()) {
        statusEl.innerHTML = '<span class="text-slate-500 dark:text-slate-400">未登録（BYOK）</span>';
        return;
      }

      if (licenseNeedsRebind()) {
        renderLicenseError({ message: 'この端末はライセンスに登録されていません。設定を保存して再認証してください。' });
        return;
      }

      statusEl.innerHTML = '<span class="text-blue-600 dark:text-blue-400">🔄 ライセンス状態を確認中...</span>';

      try {
        const info = await refreshLicenseInfo();
        if (info) {
          renderLicenseInfo(info);
        }
      } catch (err) {
        renderLicenseError(err);
      }
    }

export function renderLicenseInfo(info) {
      const statusEl = document.getElementById('licenseStatus');
      if (!statusEl) return;

      const quota = info.quota || {};
      const used = quota.used ?? 0;
      const limit = quota.limit ?? 300;
      const remaining = quota.remaining ?? Math.max(0, limit - used);
      const planName = info.plan === 'standard' ? 'スタンダードプラン' : (info.plan || '登録中');
      const statusText = info.status === 'active' ? '有効' : (info.status || '不明');

      statusEl.innerHTML = `
        <div class="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-1">
          <div class="font-bold text-emerald-800 dark:text-emerald-200">✅ ライセンス適用中 (${escapeHtml(planName)} / ${escapeHtml(statusText)})</div>
          <div class="text-[11px] text-emerald-700 dark:text-emerald-300">今月の利用: <strong>${used}</strong> / ${limit} 回 (残り <strong>${remaining}</strong> 回)</div>
        </div>
      `;
    }

export function renderLicenseError(err) {
      const statusEl = document.getElementById('licenseStatus');
      if (!statusEl) return;
      const info = classifyApiError(err);
      statusEl.innerHTML = `<div class="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 font-bold">⚠️ ${escapeHtml(info.message)}</div>`;
    }

export function clearLicenseAction() {
      if (confirm('ライセンスの登録を解除しますか？\n解除後はご自身のGemini APIキーを使用するモードに戻ります。')) {
        clearLicense(sharedStore);
        applyLicenseModeUi();
        checkApiKeyWarning();
        const input = document.getElementById('licenseKeyInput');
        if (input) input.value = '';
        const status = document.getElementById('licenseStatus');
        if (status) status.innerHTML = '<span class="text-slate-500 dark:text-slate-400">未登録（BYOK）</span>';
        showStatus('ライセンスを解除しました。', 'blue');
      }
    }

export async function openLicensePortalAction() {
      try {
        const res = await openLicensePortal();
        if (res && res.url) {
          window.location.href = res.url;
        }
      } catch (err) {
        renderLicenseError(err);
      }
    }

export async function fetchAvailableModels() {
      const keyInputEl = document.getElementById('geminiKeyInput');
      const key = (keyInputEl ? keyInputEl.value.trim() : '') || safeStorage.getItem('gemini_api_key');
      const statusEl = document.getElementById('modelFetchStatus');

      if (!key) {
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-red-600 dark:text-red-400 font-bold">⚠️ 先にGemini APIキーを入力してください。</span>`;
        }
        return;
      }

      if (statusEl) {
        statusEl.innerHTML = `<span class="text-blue-700 dark:text-blue-300 font-bold">🔄 Googleサーバーから利用可能なモデル一覧を照会中...</span>`;
      }

      try {
        const validModels = await fetchModelsFromApi({ apiKey: key, timeoutMs: 15000 });

        safeStorage.setItem('gemini_api_key', key);
        safeStorage.setItem('available_gemini_models', JSON.stringify(validModels));
        populateModelSelect(validModels);
        checkApiKeyWarning();

        if (statusEl) {
          statusEl.innerHTML = `<span class="text-emerald-700 dark:text-emerald-300 font-bold">✅ 取得成功！利用可能な ${validModels.length} 個のモデルをドロップダウンに登録しました。</span>`;
        }
      } catch (err) {
        if (statusEl) {
          statusEl.innerHTML = `<span class="text-red-600 dark:text-red-400 font-bold">❌ モデル取得エラー: ${escapeHtml(err.message)}</span>`;
        }
      }
    }

export function populateModelSelect(models) {
      const selectEl = document.getElementById('modelSelect');
      if (!selectEl) return;

      let list = Array.isArray(models) && models.length ? models : null;
      if (!list) {
        try {
          const raw = safeStorage.getItem('available_gemini_models');
          if (raw) list = JSON.parse(raw);
        } catch (_) {}
      }

      const baseline = [
        { id: 'gemini-3.8-flash', displayName: 'gemini-3.8-flash (標準・高速)' },
        { id: 'gemini-2.5-flash', displayName: 'gemini-2.5-flash' },
        { id: 'gemini-2.5-pro', displayName: 'gemini-2.5-pro (高精度)' }
      ];

      const modelList = Array.isArray(list) && list.length ? [...list] : baseline;
      if (!modelList.some(m => m.id === 'gemini-3.8-flash')) {
        modelList.unshift({ id: 'gemini-3.8-flash', displayName: 'gemini-3.8-flash (標準・高速)' });
      }

      const savedSelected = safeStorage.getItem('selected_model') || 'gemini-3.8-flash';
      const customModel = safeStorage.getItem('custom_model_id');

      selectEl.innerHTML = '';
      modelList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.displayName || m.id;
        selectEl.appendChild(opt);
      });

      if (customModel && !modelList.some(m => m.id === customModel)) {
        addOrSelectModelOption(customModel, `${customModel} (カスタム指定)`);
      } else if (modelList.some(m => m.id === savedSelected)) {
        selectEl.value = savedSelected;
      } else {
        selectEl.value = 'gemini-3.8-flash';
        safeStorage.setItem('selected_model', 'gemini-3.8-flash');
      }
    }

export function addOrSelectModelOption(modelId, label) {
      const selectEl = document.getElementById('modelSelect');
      let existing = [...selectEl.options].find(o => o.value === modelId);
      if (!existing) {
        existing = document.createElement('option');
        existing.value = modelId;
        existing.textContent = label || modelId;
        selectEl.prepend(existing);
      }
      selectEl.value = modelId;
      safeStorage.setItem('selected_model', modelId);
    }

export function onModelDropdownChange() {
      const val = document.getElementById('modelSelect').value;
      safeStorage.setItem('selected_model', val);
      // ドロップダウンを直接変更すると Custom 入力欄の優先順位を解除し混乱を防ぐ
      safeStorage.setItem('custom_model_id', '');
      const customEl = document.getElementById('customModelInput');
      if (customEl) customEl.value = '';
    }
