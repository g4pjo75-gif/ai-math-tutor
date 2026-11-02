import { TutorUI } from '../shared/ui.js';
import { engStore, sharedStore } from './state.js';
import { loadWordbookAndHistory } from './wordbook.js';
import {
  applyStoredLicense,
  licenseNeedsRebind,
  LICENSE_KEY,
  normalizeLicenseKey,
  registerLicense,
  clearLicense,
  refreshLicenseInfo,
  openLicensePortal
} from '../shared/license.js';
import { isLicenseMode } from '../core/index.js';

    // =========================================================================
    // 3. 初期化 & 共通設定
    // =========================================================================
    window.addEventListener('DOMContentLoaded', () => {
      if (TutorUI) {
        TutorUI.initDarkMode({ storage: sharedStore, key: 'dark_mode' });
        TutorUI.initTheme({ storage: sharedStore, key: 'ui_theme' });
        TutorUI.updateSafeArea();
        TutorUI.bindBackdropClose('settingsModal', 'settingsModalContent');
        TutorUI.bindBackdropClose('historyModal', 'historyModalContent');
      }

      // ライセンス状態の復元とUI同期
      applyStoredLicense(sharedStore);
      applyLicenseModeUi();

      // セッションでPIN解錠済みならスキップ
      if (sessionStorage.getItem('aet_unlocked') === '1') {
        document.getElementById('pinModal').style.display = 'none';
      }

      // モデル選択の復元
      initModelDropdown();

      // 音声速度復元
      const savedRate = engStore ? engStore.getItem('speech_rate') : null;
      if (savedRate && document.getElementById('speechRateSelect')) {
        document.getElementById('speechRateSelect').value = savedRate;
      }

      // 単語帳と履歴の読み込み
      loadWordbookAndHistory();
      checkApiKeyBanner();

      // Service Worker 登録
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('./sw.js').catch((e) => {
          console.warn('English SW registration error:', e);
        });
      }
    });

export function initModelDropdown() {
      const selectEl = document.getElementById('modelSelect');
      if (!selectEl) return;
      const customModel = (engStore && engStore.getItem('custom_model_id')) || (sharedStore && sharedStore.getItem('custom_model_id')) || '';
      selectEl.innerHTML = '<option value="gemini-3.8-flash" selected>gemini-3.8-flash (標準・高速)</option>';
      if (customModel && customModel !== 'gemini-3.8-flash') {
        const opt = document.createElement('option');
        opt.value = customModel;
        opt.textContent = `${customModel} (カスタム)`;
        selectEl.prepend(opt);
        selectEl.value = customModel;
      }
    }

export function onModelChange() {
      const val = document.getElementById('modelSelect').value;
      if (engStore) engStore.setItem('selected_model', val);
    }

export function getActiveModel() {
      const custom = (engStore && engStore.getItem('custom_model_id')) || '';
      if (custom) return custom;
      return document.getElementById('modelSelect')?.value || 'gemini-3.8-flash';
    }

export function getApiKey() {
      return (sharedStore && sharedStore.getItem('gemini_api_key')) || '';
    }

export function checkApiKeyBanner() {
      const banner = document.getElementById('apiWarningBanner');
      const licenseBanner = document.getElementById('licenseWarningBanner');
      const needsRebind = licenseNeedsRebind();

      if (isLicenseMode()) {
        if (banner) banner.classList.add('hidden');
        if (licenseBanner) {
          if (needsRebind) licenseBanner.classList.remove('hidden');
          else licenseBanner.classList.add('hidden');
        }
      } else {
        if (licenseBanner) licenseBanner.classList.add('hidden');
        if (banner) {
          if (!getApiKey()) banner.classList.remove('hidden');
          else banner.classList.add('hidden');
        }
      }
    }

export function unlockApp() {
      const input = document.getElementById('pinInput').value.trim();
      const savedPin = (sharedStore ? (sharedStore.getItem('app_pin') || sharedStore.getItem('pin')) : null) || '1234';
      if (input === savedPin) {
        document.getElementById('pinModal').style.display = 'none';
        sessionStorage.setItem('aet_unlocked', '1');
      } else {
        document.getElementById('pinError').classList.remove('hidden');
      }
    }

export function toggleDarkMode() {
      if (TutorUI) {
        TutorUI.toggleDarkMode({ storage: sharedStore, key: 'dark_mode' });
      }
    }

export function changeTheme(theme) {
      if (TutorUI && typeof TutorUI.applyTheme === 'function') {
        TutorUI.applyTheme(theme, { storage: sharedStore, key: 'ui_theme' });
      }
    }

export function openSettings() {
      document.getElementById('geminiKeyInput').value = getApiKey();
      document.getElementById('customModelInput').value = (engStore && engStore.getItem('custom_model_id')) || '';
      document.getElementById('newPinInput').value = (sharedStore && (sharedStore.getItem('app_pin') || sharedStore.getItem('pin'))) || '1234';

      const licenseInput = document.getElementById('licenseKeyInput');
      if (licenseInput) {
        licenseInput.value = sharedStore ? (sharedStore.getItem(LICENSE_KEY) || '') : '';
      }

      applyLicenseModeUi();
      refreshLicenseStatus();
      TutorUI.openModal('settingsModal');
    }

export function closeSettings() {
      TutorUI.closeModal('settingsModal');
    }

export async function saveSettings() {
      const key = document.getElementById('geminiKeyInput').value.trim();
      const customModel = document.getElementById('customModelInput').value.trim();
      const pin = document.getElementById('newPinInput').value.trim() || '1234';
      const rate = document.getElementById('speechRateSelect').value;
      const rawLicense = document.getElementById('licenseKeyInput')?.value?.trim() || '';
      const normalizedLicense = normalizeLicenseKey(rawLicense);
      const wasLicenseMode = isLicenseMode();

      // PIN・音声速度は常に保存
      if (sharedStore) {
        sharedStore.setItem('app_pin', pin);
        sharedStore.setItem('pin', pin);
      }
      if (engStore) {
        engStore.setItem('speech_rate', rate);
      }

      // 1. BYOK 저장을 먼저 수행
      if (!wasLicenseMode) {
        if (sharedStore) sharedStore.setItem('gemini_api_key', key);
        if (engStore) engStore.setItem('custom_model_id', customModel);
        initModelDropdown();
      }

      // 2. ライセンス登録
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
      checkApiKeyBanner();
      closeSettings();
      TutorUI.showToast('✅ 設定を保存しました。', 'green');
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

function escapeText(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
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
          <div class="font-bold text-emerald-800 dark:text-emerald-200">✅ ライセンス適用中 (${escapeText(planName)} / ${escapeText(statusText)})</div>
          <div class="text-[11px] text-emerald-700 dark:text-emerald-300">今月の利用: <strong>${used}</strong> / ${limit} 回 (残り <strong>${remaining}</strong> 回)</div>
        </div>
      `;
    }

export function renderLicenseError(err) {
      const statusEl = document.getElementById('licenseStatus');
      if (!statusEl) return;
      statusEl.innerHTML = `<div class="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 font-bold">⚠️ ${escapeText(err?.message || 'ライセンスエラーが発生しました。')}</div>`;
    }

export function clearLicenseAction() {
      if (confirm('ライセンスの登録を解除しますか？\n解除後はご自身のGemini APIキーを使用するモードに戻ります。')) {
        clearLicense(sharedStore);
        applyLicenseModeUi();
        checkApiKeyBanner();
        const input = document.getElementById('licenseKeyInput');
        if (input) input.value = '';
        const status = document.getElementById('licenseStatus');
        if (status) status.innerHTML = '<span class="text-slate-500 dark:text-slate-400">未登録（BYOK）</span>';
        TutorUI.showToast('ライセンスを解除しました。', 'blue');
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
