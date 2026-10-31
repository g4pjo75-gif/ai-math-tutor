    // マイノート（オ答ノート / 過去の解説記録）
    // =========================================================================
    function initTutorHistory() {
      const saved = safeStorage.getItem('tutor_history');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          tutorHistory = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          tutorHistory = [];
        }
      }
    }

    function saveTutorHistory(data, { attachChat = true } = {}) {
      if (!data) return null;
      const entry = {
        id: Date.now().toString(),
        savedAt: new Date().toISOString(),
        unitHint: data.unitHint || '自動判定',
        problem_label: data.problem_label || '',
        recognized_problem: data.recognized_problem || '',
        key_point: data.key_point || '',
        steps: Array.isArray(data.steps) ? data.steps : [],
        final_answer: data.final_answer || '',
        twin_quiz: data.twin_quiz || null,
        overall_chat: Array.isArray(data.overall_chat)
          ? data.overall_chat
          : (attachChat && overallChats[currentProblemIndex] ? overallChats[currentProblemIndex] : [])
      };

      // 最大100件まで保持、古いものから削除
      tutorHistory.unshift(entry);
      if (tutorHistory.length > 100) {
        tutorHistory = tutorHistory.slice(0, 100);
      }

      let ok = safeStorage.setItem('tutor_history', JSON.stringify(tutorHistory));
      // ストレージ容量超過時は古い履歴を削って再試行
      if (!ok && tutorHistory.length > 10) {
        tutorHistory = tutorHistory.slice(0, Math.max(10, Math.floor(tutorHistory.length / 2)));
        ok = safeStorage.setItem('tutor_history', JSON.stringify(tutorHistory));
      }
      return ok ? entry.id : null;
    }

    function deleteFromTutorHistory(id) {
      tutorHistory = tutorHistory.filter(item => item.id !== id);
      safeStorage.setItem('tutor_history', JSON.stringify(tutorHistory));
      renderTutorHistoryList();
    }

    function renderTutorHistoryList() {
      const container = document.getElementById('tutorHistoryList');
      if (!container) return;

      if (tutorHistory.length === 0) {
        container.innerHTML = `
          <div class="text-center py-8">
            <p class="text-slate-500 dark:text-slate-400 text-sm">記録がまだありません。</p>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">解説が終わった後に「📁 ノートに保存」ボタンで追加できます。</p>
          </div>
        `;
        return;
      }

      container.innerHTML = tutorHistory.map((item) => {
        const parsedDate = item.savedAt ? new Date(item.savedAt) : null;
        const dateStr = (parsedDate && !isNaN(parsedDate.getTime()))
          ? parsedDate.toLocaleDateString('ja-JP', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            })
          : '日時不明';
        const labelBadge = item.problem_label ? `[${item.problem_label}] ` : '';
        const problemPreview = `${labelBadge}${(item.recognized_problem || '').replace(/\$/g, '')}`.slice(0, 45);
        return `
          <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-3 shadow-sm">
            <div class="flex items-start justify-between gap-2 mb-1.5">
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-0.5">${escapeHtml(item.unitHint || '自動判定')}</div>
                <div class="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">${escapeHtml(problemPreview)}${problemPreview.length >= 45 ? '…' : ''}</div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(dateStr)}</div>
              </div>
              <div class="flex items-start gap-1">
                <button onclick="restoreFromHistory('${escapeJsString(item.id)}')" 
                  class="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition">
                  🔄 もう一度見る
                </button>
                <button onclick="deleteFromTutorHistory('${escapeJsString(item.id)}')" 
                  class="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 transition">
                  🗑️ 削除
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function escapeJsString(str) {
      return String(str).replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');
    }

    async function restoreFromHistory(id) {
      const item = tutorHistory.find(it => it.id === id);
      if (!item) return;

      if (item.unitHint) {
        const unitSel = document.getElementById('unitSelect');
        if (unitSel && [...unitSel.options].some(o => o.value === item.unitHint)) {
          unitSel.value = item.unitHint;
        }
      }

      closeTutorHistoryModal();
      renderTutorResult(item);
    }

    function showTutorHistory() {
      const modal = document.getElementById('tutorHistoryModal');
      if (!modal) return;
      renderTutorHistoryList();
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeTutorHistoryModal() {
      const modal = document.getElementById('tutorHistoryModal');
      if (!modal) return;
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function saveCurrentToTutorHistory() {
      if (!currentSteps.length && !currentProblemText) {
        showStatus('⚠️ 保存する解説データがありません。', 'amber');
        return;
      }

      const unitHint = document.getElementById('unitSelect').value;
      const currentProb = currentProblems[currentProblemIndex] || {};
      const recEl = document.getElementById('recognizedProblem');
      const keyEl = document.getElementById('keyPoint');
      const ansEl = document.getElementById('finalAnswer');

      // P0-1: KaTeXレンダリング後のtextContentではなく、必ず元のLaTeX文字列を保存する
      const data = {
        unitHint: unitHint,
        problem_label: currentProb.problem_label || '',
        recognized_problem: currentProb.recognized_problem || recEl?.dataset?.rawMath || currentProblemText || '',
        key_point: currentProb.key_point || keyEl?.dataset?.rawMath || '',
        steps: currentSteps,
        final_answer: currentProb.final_answer || ansEl?.dataset?.rawMath || '',
        twin_quiz: currentProb.twin_quiz || null,
        overall_chat: overallChats[currentProblemIndex] || []
      };

      const savedId = saveTutorHistory(data);
      if (!savedId) {
        showStatus('⚠️ ブラウザの保存容量が不足しているため、マイノートに保存できませんでした。不要な履歴を削除してください。', 'amber');
        return;
      }

      const btn = document.getElementById('saveToNoteBtn');
      if (btn) {
        btn.textContent = '✅ マイノートに保存済み';
        btn.classList.replace('bg-slate-100', 'bg-emerald-100');
        btn.classList.replace('text-slate-700', 'text-emerald-700');
        btn.classList.replace('dark:bg-slate-800', 'dark:bg-emerald-900/30');
        btn.classList.replace('dark:text-slate-300', 'dark:text-emerald-400');
        btn.disabled = true;
      }

      showStatus('✅ マイノートに保存しました。', 'blue');
    }

    // =========================================================================
