
    // =========================================================================
    // 2. 初期化 及び PINロック解除
    // =========================================================================
    window.addEventListener('DOMContentLoaded', () => {
      initDarkMode();
      initTheme();
      initTutorHistory();

      // 埋め込み API キー（設定がある場合のみ）
      if (!safeStorage.getItem('gemini_api_key') && EMBEDDED_GEMINI_API_KEY) {
        safeStorage.setItem('gemini_api_key', EMBEDDED_GEMINI_API_KEY);
      }

      updateSafeArea();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateSafeArea);
      }
      const selectEl = document.getElementById('modelSelect');
      const savedCustomModel = safeStorage.getItem('custom_model_id');
      if (savedCustomModel) {
        addOrSelectModelOption(savedCustomModel, `${savedCustomModel} (カスタム指定)`);
      } else {
        if (selectEl) {
          selectEl.innerHTML = '<option value="gemini-3.8-flash" selected>gemini-3.8-flash (標準・高速)</option>';
        }
        safeStorage.setItem('selected_model', 'gemini-3.8-flash');
      }

      // 音声速度の復元
      const savedRate = safeStorage.getItem('speech_rate');
      const rateEl = document.getElementById('speechRate');
      if (savedRate && rateEl && [...rateEl.options].some(o => o.value === savedRate)) {
        rateEl.value = savedRate;
      }

      checkApiKeyWarning();
      initVoiceSelect();
      populateModelSelect();

      // モデルが未取得かつAPIキーがある場合、自動取得を試行
      const hasModels = safeStorage.getItem('available_gemini_models');
      if (!hasModels && safeStorage.getItem('gemini_api_key')) {
        fetchAvailableModels().catch(() => {});
      }

      // PWA Service Worker 登録
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    });

    function unlockApp() {
      const input = document.getElementById('pinInput').value.trim();
      const savedPin = safeStorage.getItem('app_pin') || '1234';
      if (input === savedPin) {
        document.getElementById('pinModal').style.display = 'none';
      } else {
        document.getElementById('pinError').classList.remove('hidden');
      }
    }

    function checkApiKeyWarning() {
      const key = safeStorage.getItem('gemini_api_key');
      const banner = document.getElementById('apiWarningBanner');
      if (!key) banner.classList.remove('hidden');
      else banner.classList.add('hidden');
    }

