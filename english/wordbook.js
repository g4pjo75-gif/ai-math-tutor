import { engStore, state } from './state.js';
import { switchMode } from './mode.js';
import { renderEnglishResult } from './reading.js';
import { renderEnglishQuizChoices } from './quiz.js';
import { renderWritingCorrection, updateWordCount } from './writing.js';
import { escapeHtml } from './voice.js';

    // =========================================================================
    // 8. マイ単語帳 & 復習ノート (Wordbook & Study History)
    // =========================================================================
export function loadWordbookAndHistory() {
      if (!engStore) return;
      try {
        const wb = JSON.parse(engStore.getItem('wordbook') || '[]');
        state.wordbookList = Array.isArray(wb) ? wb : [];
      } catch (e) {
        state.wordbookList = [];
      }
      try {
        const hist = JSON.parse(engStore.getItem('history') || '[]');
        state.englishHistory = Array.isArray(hist) ? hist : [];
      } catch (e) {
        state.englishHistory = [];
      }
      updateWordbookBadges();
    }

export function persistWordbook() {
      if (!engStore) return false;
      if (state.wordbookList.length > 300) state.wordbookList = state.wordbookList.slice(0, 300);
      const ok = engStore.setItem('wordbook', JSON.stringify(state.wordbookList));
      updateWordbookBadges();
      return ok;
    }

export function persistHistory() {
      if (!engStore) return false;
      if (state.englishHistory.length > 80) state.englishHistory = state.englishHistory.slice(0, 80);
      const ok = engStore.setItem('history', JSON.stringify(state.englishHistory));
      updateWordbookBadges();
      return ok;
    }

export function updateWordbookBadges() {
      const badge = document.getElementById('wordbookBadge');
      if (badge) badge.textContent = String(state.wordbookList.length);
      const wbLabel = document.getElementById('wordbookCountLabel');
      if (wbLabel) wbLabel.textContent = String(state.wordbookList.length);
      const notesLabel = document.getElementById('notesCountLabel');
      if (notesLabel) notesLabel.textContent = String(state.englishHistory.length);
    }

export function addWordDirect(word, meaning, example = '') {
      const cleanWord = String(word || '').trim();
      if (!cleanWord) return;
      const exists = state.wordbookList.some(w => w.word.toLowerCase() === cleanWord.toLowerCase());
      if (exists) {
        window.TutorUI.showToast(`ℹ️ 「${cleanWord}」は既にマイ単語帳に登録されています。`, 'blue');
        return;
      }
      state.wordbookList.unshift({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        word: cleanWord,
        meaning: String(meaning || '').trim(),
        example: String(example || '').trim(),
        memorized: false,
        savedAt: new Date().toISOString()
      });
      if (persistWordbook()) {
        window.TutorUI.showToast(`🔤 「${cleanWord}」をマイ単語帳に保存しました！`, 'green');
      } else {
        window.TutorUI.showToast('⚠️ 保存容量の上限に達しています。', 'amber');
      }
    }

export function addWordToWordbook(idx) {
      if (!state.lastLessonData || !Array.isArray(state.lastLessonData.vocabulary)) return;
      const v = state.lastLessonData.vocabulary[idx];
      if (!v) return;
      addWordDirect(v.word, v.meaning, v.example || '');
    }

export function saveAllLessonWords() {
      if (!state.lastLessonData || !Array.isArray(state.lastLessonData.vocabulary)) return;
      let addedCount = 0;
      state.lastLessonData.vocabulary.forEach(v => {
        const cleanWord = String(v.word || '').trim();
        if (!cleanWord) return;
        if (!state.wordbookList.some(w => w.word.toLowerCase() === cleanWord.toLowerCase())) {
          state.wordbookList.unshift({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            word: cleanWord,
            meaning: String(v.meaning || '').trim(),
            example: String(v.example || '').trim(),
            memorized: false,
            savedAt: new Date().toISOString()
          });
          addedCount++;
        }
      });
      persistWordbook();
      window.TutorUI.showToast(`🔤 新しく ${addedCount} 個の単語をマイ単語帳に一括登録しました！`, 'green');
    }

export function openAddCustomWord() {
      document.getElementById('customWordForm').classList.remove('hidden');
      document.getElementById('customWordInput').focus();
    }

export function saveCustomWord() {
      const w = document.getElementById('customWordInput').value.trim();
      const m = document.getElementById('customMeaningInput').value.trim();
      const ex = document.getElementById('customExampleInput').value.trim();
      if (!w || !m) {
        window.TutorUI.showToast('⚠️ 英単語と日本語の意味を入力してください。', 'amber');
        return;
      }
      addWordDirect(w, m, ex);
      document.getElementById('customWordInput').value = '';
      document.getElementById('customMeaningInput').value = '';
      document.getElementById('customExampleInput').value = '';
      document.getElementById('customWordForm').classList.add('hidden');
      renderWordbookList();
    }

export function toggleWordMemorized(id) {
      const item = state.wordbookList.find(w => w.id === id);
      if (item) {
        item.memorized = !item.memorized;
        persistWordbook();
        renderWordbookList();
      }
    }

export function deleteWordItem(id) {
      state.wordbookList = state.wordbookList.filter(w => w.id !== id);
      persistWordbook();
      renderWordbookList();
    }

    // 学習履歴の保存（長文解説・4択クイズ・英作文）
export function saveCurrentLessonToHistory() {
      if (!state.lastLessonData) return;
      const { _twinQuizConsumed, ...persistPayload } = state.lastLessonData;
      const entry = {
        id: Date.now().toString(),
        type: 'reading',
        title: (state.lastLessonData.passage_en || '長文読解').slice(0, 48),
        summary: (state.lastLessonData.translation_ja || '').slice(0, 70),
        payload: persistPayload,
        savedAt: new Date().toISOString()
      };
      state.englishHistory.unshift(entry);
      if (persistHistory()) {
        window.TutorUI.showToast('📁 長文解説を復習ノートに保存しました！', 'green');
      } else {
        window.TutorUI.showToast('⚠️ 保存容量が不足しています。', 'amber');
      }
    }

export function saveQuizRecordToHistory(isCorrect) {
      if (!state.currentQuizData) return;
      const correctText = state.currentQuizData.displayChoices[state.currentQuizData.displayCorrectIndex];
      const entry = {
        id: Date.now().toString(),
        type: 'quiz',
        title: `[4択${isCorrect ? '正解⭕' : '復習❌'}] ${state.currentQuizData.questionEn.slice(0, 42)}`,
        summary: `正解: ${correctText} ｜ ${state.currentQuizData.translationJa}`,
        payload: state.currentQuizData,
        savedAt: new Date().toISOString()
      };
      state.englishHistory.unshift(entry);
      if (persistHistory()) {
        window.TutorUI.showToast('📁 クイズ記録を復習ノートに保存しました！', 'green');
      }
    }

export function saveWritingToHistory() {
      if (!state.lastWritingData) return;
      const entry = {
        id: Date.now().toString(),
        type: 'writing',
        title: `[英作文添削 ${state.lastWritingData.score}点] ${state.lastWritingData.corrected_text.slice(0, 42)}`,
        summary: `元文: ${state.lastWritingData.original_text}`,
        payload: state.lastWritingData,
        savedAt: new Date().toISOString()
      };
      state.englishHistory.unshift(entry);
      if (persistHistory()) {
        window.TutorUI.showToast('📁 英作文の添削結果を復習ノートに保存しました！', 'green');
      }
    }

export function openHistoryModal(defaultTab = 'wordbook') {
      loadWordbookAndHistory();
      window.TutorUI.openModal('historyModal');
      switchHistoryTab(defaultTab);
    }

export function closeHistoryModal() {
      window.TutorUI.closeModal('historyModal');
    }

export function switchHistoryTab(tab) {
      state.currentHistoryTab = tab;
      const wbBtn = document.getElementById('tabBtnWordbook');
      const notesBtn = document.getElementById('tabBtnNotes');
      const wbControls = document.getElementById('wordbookControls');

      if (tab === 'wordbook') {
        wbBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-blue-600 text-white';
        notesBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
        wbControls.classList.remove('hidden');
        renderWordbookList();
      } else {
        notesBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-blue-600 text-white';
        wbBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
        wbControls.classList.add('hidden');
        document.getElementById('customWordForm').classList.add('hidden');
        renderNotesHistoryList();
      }
    }

export function renderWordbookList() {
      const container = document.getElementById('historyListContainer');
      if (!container) return;
      const hideMeaning = document.getElementById('hideMeaningToggle')?.checked || false;

      if (state.wordbookList.length === 0) {
        container.innerHTML = `
          <div class="py-12 text-center text-xs text-slate-400 space-y-2">
            <div class="text-3xl">🔤</div>
            <p class="font-bold">まだ単語が登録されていません</p>
            <p>長文解説の「＋単語帳へ」または「＋単語を手動追加」から登録できます</p>
          </div>
        `;
        return;
      }

      container.innerHTML = state.wordbookList.map(item => `
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border ${item.memorized ? 'border-emerald-300 dark:border-emerald-800/70 opacity-75' : 'border-slate-200 dark:border-slate-700'} flex items-start justify-between gap-3">
          <div class="space-y-1 flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <button data-action="speak-en" data-text="${escapeAttr(item.word)}" class="font-serif font-black text-sm sm:text-base text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>🔊</span>
                <span>${escapeHtml(item.word)}</span>
              </button>
              ${item.memorized ? '<span class="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">✓ 覚えた！</span>' : ''}
            </div>
            <div data-action="unblur" class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer ${hideMeaning ? 'blur-sm select-none' : ''}" title="タップで表示">
              ${escapeHtml(item.meaning)}
            </div>
            ${item.example ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 italic font-serif">"${escapeHtml(item.example)}"</p>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button data-action="toggle-memorized" data-id="${escapeAttr(item.id)}" class="text-[11px] px-2.5 py-1 rounded-lg font-bold border ${item.memorized ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}">
              ${item.memorized ? '覚えた' : '未暗記'}
            </button>
            <button data-action="delete-word" data-id="${escapeAttr(item.id)}" class="text-slate-400 hover:text-rose-500 text-xs font-bold px-1.5 py-1">🗑️</button>
          </div>
        </div>
      `).join('');
    }

export function renderNotesHistoryList() {
      const container = document.getElementById('historyListContainer');
      if (!container) return;

      if (state.englishHistory.length === 0) {
        container.innerHTML = `
          <div class="py-12 text-center text-xs text-slate-400 space-y-2">
            <div class="text-3xl">📓</div>
            <p class="font-bold">まだ復習ノートに記録がありません</p>
            <p>長文解説・4択クイズ・英作文添削の「📁 マイノートに保存」から保存できます</p>
          </div>
        `;
        return;
      }

      const typeBadges = {
        reading: '<span class="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">📖 長文読解</span>',
        quiz: '<span class="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">🎯 4択クイズ</span>',
        writing: '<span class="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-bold">✍️ 英作文添削</span>'
      };

      container.innerHTML = state.englishHistory.map(item => {
        const dateStr = item.savedAt ? new Date(item.savedAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            <div data-action="restore-history-item" data-id="${escapeAttr(item.id)}" class="space-y-1 flex-1 min-w-0 cursor-pointer">
              <div class="flex items-center gap-2">
                ${typeBadges[item.type] || ''}
                <span class="text-[10px] text-slate-400">${escapeHtml(dateStr)}</span>
              </div>
              <p class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(item.title)}</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(item.summary)}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button data-action="restore-history-item" data-id="${escapeAttr(item.id)}" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-xl">開く</button>
              <button data-action="delete-history-item" data-id="${escapeAttr(item.id)}" class="text-slate-400 hover:text-rose-500 text-xs font-bold px-1.5 py-1">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }

export function restoreHistoryItem(id) {
      const item = state.englishHistory.find(h => h.id === id);
      if (!item || !item.payload) return;
      closeHistoryModal();

      if (item.type === 'reading') {
        switchMode('reading');
        state.lastLessonData = { ...item.payload, _twinQuizConsumed: false };
        state.lastPassageEn = item.payload.passage_en || '';
        renderEnglishResult(item.payload);
        document.getElementById('resultSection').classList.remove('hidden');
      } else if (item.type === 'quiz') {
        switchMode('quiz');
        state.currentQuizData = item.payload;
        state.selectedChoiceIndex = -1;
        document.getElementById('quizEmptyState').classList.add('hidden');
        document.getElementById('quizActiveContainer').classList.remove('hidden');
        document.getElementById('quizTargetBadge').textContent = state.currentQuizData.targetPoint || '復習';
        document.getElementById('quizQuestionText').textContent = state.currentQuizData.questionEn || '';
        document.getElementById('quizTranslationText').textContent = `和訳: ${state.currentQuizData.translationJa || ''}`;
        document.getElementById('quizHintContent').textContent = state.currentQuizData.hint || '';
        renderEnglishQuizChoices();
        const box = document.getElementById('quizResultBox');
        if (box) {
          box.classList.add('hidden');
          box.innerHTML = '';
        }
        window.TutorUI.showToast('📁 4択問題を復習用に読み込みました。回答を選択してチェックしてください。', 'blue');
      } else if (item.type === 'writing') {
        switchMode('writing');
        state.lastWritingData = item.payload;
        document.getElementById('writingTaskInput').value = item.payload.task_ja || '';
        document.getElementById('writingStudentInput').value = item.payload.original_text || '';
        updateWordCount();
        renderWritingCorrection(item.payload);
      }
      window.TutorUI.showToast('📂 ノートから学習記録を復元しました！', 'blue');
    }

export function deleteHistoryItem(id) {
      state.englishHistory = state.englishHistory.filter(h => h.id !== id);
      persistHistory();
      renderNotesHistoryList();
    }

export function clearCurrentHistoryTab() {
      if (state.currentHistoryTab === 'wordbook') {
        if (!state.wordbookList.length) return;
        state.wordbookList = [];
        persistWordbook();
        renderWordbookList();
        window.TutorUI.showToast('🗑️ マイ単語帳を整理しました。', 'blue');
      } else {
        if (!state.englishHistory.length) return;
        state.englishHistory = [];
        persistHistory();
        renderNotesHistoryList();
        window.TutorUI.showToast('🗑️ 復習ノート履歴を整理しました。', 'blue');
      }
    }

