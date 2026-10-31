import { safeStorage } from './state.js';
import { checkApiKeyWarning } from './init.js';
import { fetchAvailableModels as fetchModelsFromApi } from '../core/index.js';
import { showStatus } from './ui-status.js';
import { escapeHtml } from './chat-overall.js';

    // =========================================================================
    // 3. 設定モーダル & [解決策 1] ListModels API 利用可能モデル自動取得
    // =========================================================================
export function openSettings() {
      document.getElementById('geminiKeyInput').value = safeStorage.getItem('gemini_api_key') || '';
      document.getElementById('customModelInput').value = safeStorage.getItem('custom_model_id') || '';
      document.getElementById('newPinInput').value = safeStorage.getItem('app_pin') || '1234';
      const modal = document.getElementById('settingsModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

export function closeSettings() {
      const modal = document.getElementById('settingsModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

export function saveSettings() {
      const geminiKey = document.getElementById('geminiKeyInput').value.trim();
      const customModel = document.getElementById('customModelInput').value.trim();
      const newPin = document.getElementById('newPinInput').value.trim() || '1234';

      const prevKey = safeStorage.getItem('gemini_api_key');
      safeStorage.setItem('gemini_api_key', geminiKey);
      safeStorage.setItem('custom_model_id', customModel);
      safeStorage.setItem('app_pin', newPin);

      if (customModel) {
        addOrSelectModelOption(customModel, `${customModel} (カスタム指定)`);
      }

      checkApiKeyWarning();
      closeSettings();
      showStatus('✅ 設定を保存しました。', 'blue');

      if (geminiKey && geminiKey !== prevKey) {
        fetchAvailableModels().catch(() => {});
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
