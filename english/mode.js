    // =========================================================================
    // 4. モード切替 (長文読解 / 4択クイズ / 英作文添削)
    // =========================================================================
    function switchMode(mode) {
      currentMode = mode;
      stopAllSpeech();
      hideStatus();

      // P3-1: 他モードへの切り替え時は前回のクイズ状態をクリアし、誤提出・不整合を防止
      if (mode !== 'quiz' && currentQuizData) {
        currentQuizData = null;
        selectedChoiceIndex = -1;
        const emptyState = document.getElementById('quizEmptyState');
        const activeContainer = document.getElementById('quizActiveContainer');
        const resultBox = document.getElementById('quizResultBox');
        if (emptyState) emptyState.classList.remove('hidden');
        if (activeContainer) activeContainer.classList.add('hidden');
        if (resultBox) {
          resultBox.classList.add('hidden');
          resultBox.innerHTML = '';
        }
      }

      const panels = {
        reading: document.getElementById('panelReading'),
        quiz: document.getElementById('panelQuiz'),
        writing: document.getElementById('panelWriting')
      };

      Object.keys(panels).forEach((k) => {
        if (panels[k]) {
          if (k === mode) panels[k].classList.remove('hidden');
          else panels[k].classList.add('hidden');
        }
      });

      ['reading', 'quiz', 'writing'].forEach((m) => {
        const btn = document.getElementById(`modeBtn-${m}`);
        if (!btn) return;
        if (m === mode) {
          btn.className = 'mode-btn bg-blue-600 text-white p-3 rounded-2xl text-left shadow-sm transition border-2 border-blue-600';
        } else {
          btn.className = 'mode-btn bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 p-3 rounded-2xl text-left shadow-sm transition border-2 border-slate-200 dark:border-slate-800';
        }
      });
    }

    function showStatus(msg, color = 'blue') {
      const box = document.getElementById('statusBox');
      if (!box) return;
      const styles = {
        blue: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-100',
        amber: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-100',
        red: 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-100'
      };
      box.className = `rounded-2xl p-4 text-xs sm:text-sm font-bold border transition ${styles[color] || styles.blue}`;
      box.textContent = msg;
      box.classList.remove('hidden');
    }

    function hideStatus() {
      const box = document.getElementById('statusBox');
      if (box) box.classList.add('hidden');
    }

