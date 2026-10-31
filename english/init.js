import { TutorUI } from '../shared/ui.js';
import { engStore, sharedStore } from './state.js';
import { loadWordbookAndHistory } from './wordbook.js';


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
      if (!banner) return;
      if (!getApiKey()) banner.classList.remove('hidden');
      else banner.classList.add('hidden');
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
      TutorUI.openModal('settingsModal');
    }

export function closeSettings() {
      TutorUI.closeModal('settingsModal');
    }

export function saveSettings() {
      const key = document.getElementById('geminiKeyInput').value.trim();
      const customModel = document.getElementById('customModelInput').value.trim();
      const pin = document.getElementById('newPinInput').value.trim() || '1234';
      const rate = document.getElementById('speechRateSelect').value;

      if (sharedStore) {
        sharedStore.setItem('gemini_api_key', key);
        sharedStore.setItem('app_pin', pin);
        sharedStore.setItem('pin', pin);
      }
      if (engStore) {
        engStore.setItem('custom_model_id', customModel);
        engStore.setItem('speech_rate', rate);
      }

      initModelDropdown();
      checkApiKeyBanner();
      closeSettings();
      TutorUI.showToast('✅ 設定を保存しました。', 'green');
    }

