    // ユーティリティ関数（上部ステータスボックス + 画面下部トースト通知で常時視認可能）
    function showToast(text, color = 'blue') {
      const toast = document.getElementById('toastNotification');
      if (!toast) return;
      const styles = {
        blue: 'bg-slate-900/95 text-white border-emerald-500/60 dark:bg-slate-800 dark:text-slate-100',
        amber: 'bg-amber-600/95 text-white border-amber-300',
        red: 'bg-red-600/95 text-white border-red-300'
      };
      toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] sm:max-w-md px-4 py-3 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold transition-all duration-300 ${styles[color] || styles.blue}`;
      toast.textContent = text;
      toast.classList.remove('hidden');

      if (state.toastTimer) clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 4000);
    }

    function showStatus(html, color = 'blue') {
      const box = document.getElementById('statusBox');
      const styles = {
        blue: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-100',
        amber: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-100',
        red: 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/60 dark:border-red-800 dark:text-red-100'
      };
      box.className = `rounded-2xl p-4 text-sm border ${styles[color] || styles.blue}`;
      box.innerHTML = html;
      box.classList.remove('hidden');

      // ページ下部にスクロールしている場合でも気づけるようトーストを表示＆エラー時はスクロール
      const plainText = box.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (plainText && !plainText.startsWith('⏳')) {
        showToast(plainText.slice(0, 80), color);
      }
      if (color === 'red') {
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function hideStatus() {
      document.getElementById('statusBox').classList.add('hidden');
    }

    // クォータ超過エラーの判定
    function isQuotaError(err) {
      const msg = (err?.message || '').toLowerCase();
      return msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted') ||
        msg.includes('billing') || msg.includes('limit: 0');
    }

    // クォータ超過時の推奨モデル一覧を取得
    function getRecommendedModels() {
      const selectEl = document.getElementById('modelSelect');
      if (!selectEl) return [];
      return [...selectEl.options]
        .map(o => o.value)
        .filter(Boolean);
    }

    // クォータ超過エラー表示（モデル切り替えボタン付き）
    function showQuotaError(selectedModel) {
      const otherModels = getRecommendedModels()
        .filter(v => v !== selectedModel)
        .slice(0, 4);

      const fallbackButtons = otherModels.map(m =>
        `<button data-action="solve" data-model="${escapeAttr(m)}" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1">🔄 ${escapeHtml(m)} で再試行</button>`
      ).join('');

      showStatus(`
        <div class="space-y-2">
          <div class="font-bold text-red-700 dark:text-red-300">⚠️ このモデル（${escapeHtml(selectedModel)}）の無料枠が上限に達しました。</div>
          <div class="text-xs text-slate-600 dark:text-slate-300">別のモデルに切り替えるか、「⚙️ 設定」から「モデル一覧を自動取得」を押して、利用可能なモデルを確認してください。</div>
          <div class="pt-1">${fallbackButtons}
            <button data-action="open-settings" class="bg-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1">⚙️ 設定・モデル自動取得</button>
          </div>
        </div>
      `, 'red');
    }

