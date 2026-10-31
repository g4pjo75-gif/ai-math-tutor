import { state } from './state.js';
import { closeQuizSection, showSectionWithFade } from './quiz-result.js';
import { playAllSteps, stopSpeech } from './voice.js';
import { showStatus } from './ui-status.js';
import { renderVisual } from './visual.js';
import { renderStepChatLogs } from './chat-step.js';
import { escapeHtml, renderOverallChatLogs } from './chat-overall.js';


    // =========================================================================
    // 6. KaTeX 数式レンダリング & 不等号(leqq/geqq) 自動修復
    // =========================================================================
export function sanitizeMathString(rawStr) {
      if (!rawStr) return '';
      let s = String(rawStr);
      // JSONエスケープ脱落で壊れた 1leqqxleqq4 -> 1 \leqq x \leqq 4 の復元
      s = s.replace(/([0-9a-zA-Z_])(leqq|geqq|leq|geq)([^a-zA-Z])/g, '$1 \\$2 $3');
      s = s.replace(/([^a-zA-Z0-9_\\])(leqq|geqq|leq|geq)([0-9a-zA-Z_])/g, '$1 \\$2 $3');
      s = s.replace(/(^|[^\\a-zA-Z])(leqq|geqq)([^a-zA-Z]|$)/g, '$1\\$2$3');
      s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
      return s;
    }

export function renderMathIn(el) {
      if (!el) return;
      if (typeof el === 'object' && el.textContent) {
        const cleaned = sanitizeMathString(el.textContent);
        // P0-1: KaTeXレンダリング前の生LaTeX文字列を data-raw-math に保持
        el.dataset.rawMath = cleaned;
        el.textContent = cleaned;
      }
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          macros: {
            "\\leqq": "\\le",
            "\\geqq": "\\ge"
          },
          throwOnError: false
        });
      }
    }

export function normalizeTutorResult(data) {
      if (!data) return [];
      const mapProblem = (p, i) => ({
        problem_label: p.problem_label || `問題 (${i + 1})`,
        recognized_problem: p.recognized_problem || '',
        key_point: p.key_point || '',
        steps: Array.isArray(p.steps) ? p.steps.map(s => ({
          step_number: s.step_number || 1,
          title: s.title || '',
          focus: s.focus || '',
          why: s.why || '',
          display_math: s.display_math || '',
          watch_out: s.watch_out || '',
          speech_ja: s.speech_ja || '',
          visual: s.visual || null,
          followups: Array.isArray(s.followups) ? s.followups : []
        })) : [],
        final_answer: p.final_answer || '',
        twin_quiz: p.twin_quiz || null,
        overall_chat: Array.isArray(p.overall_chat) ? p.overall_chat : [],
        _twinQuizConsumed: false
      });

      // 1. data.problems 配列の場合
      if (Array.isArray(data.problems) && data.problems.length > 0) {
        return data.problems.map(mapProblem);
      }
      // 2. data 自体が配列の場合
      if (Array.isArray(data) && data.length > 0) {
        return data.map(mapProblem);
      }
      // 3. 単一オブジェクト（下位互換）
      if (data.recognized_problem || data.steps) {
        return [mapProblem(data, 0)];
      }
      return [];
    }

export function renderProblemTabs() {
      const tabBar = document.getElementById('problemTabBar');
      if (!tabBar) return;

      if (!state.currentProblems || state.currentProblems.length <= 1) {
        tabBar.classList.add('hidden');
        tabBar.innerHTML = '';
        const badge = document.getElementById('currentProblemBadge');
        if (badge) badge.classList.add('hidden');
        return;
      }

      tabBar.classList.remove('hidden');
      tabBar.innerHTML = '';

      state.currentProblems.forEach((prob, idx) => {
        const label = prob.problem_label || `問題 (${idx + 1})`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `problem-tab-${idx}`;
        btn.onclick = () => switchProblemTab(idx);

        const isActive = idx === state.currentProblemIndex;
        btn.className = isActive
          ? 'bg-emerald-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5 shrink-0 transition'
          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-1.5 shrink-0 transition';

        btn.innerHTML = `<span>📖</span> <span>${escapeHtml(label)} を表示</span>`;
        tabBar.appendChild(btn);
      });
    }

export function switchProblemTab(index) {
      if (index < 0 || index >= state.currentProblems.length) return;
      stopSpeech();
      closeQuizSection();
      state.currentQuizData = null;
      state.currentProblemIndex = index;
      renderProblemTabs();
      displayCurrentProblem(true);
    }

export function displayCurrentProblem(autoPlay = true) {
      if (state.autoPlayTimer) {
        clearTimeout(state.autoPlayTimer);
        state.autoPlayTimer = null;
      }

      const prob = state.currentProblems[state.currentProblemIndex];
      if (!prob) return;

      state.currentSteps = Array.isArray(prob.steps) ? prob.steps : [];
      state.currentProblemText = prob.recognized_problem || '';

      // ステップ別Q&A履歴の復元 (Hydrate)
      state.currentSteps.forEach((step, sIdx) => {
        const cKey = `${state.currentProblemIndex}:${sIdx}`;
        if (Array.isArray(step.followups) && step.followups.length > 0 && !state.stepChats[cKey]) {
          state.stepChats[cKey] = [...step.followups];
        }
      });

      const badge = document.getElementById('currentProblemBadge');
      if (badge) {
        if (state.currentProblems.length > 1) {
          badge.textContent = prob.problem_label || `問題 (${state.currentProblemIndex + 1})`;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      const probEl = document.getElementById('recognizedProblem');
      probEl.textContent = prob.recognized_problem || '';
      renderMathIn(probEl);

      const keyEl = document.getElementById('keyPoint');
      keyEl.textContent = prob.key_point || '';
      renderMathIn(keyEl);

      renderStepCards();

      const finalEl = document.getElementById('finalAnswer');
      finalEl.textContent = prob.final_answer || '';
      renderMathIn(finalEl);

      // 問題全体の解法・別解Q&A履歴の復元 & 描画
      if (Array.isArray(prob.overall_chat) && prob.overall_chat.length > 0 && (!state.overallChats[state.currentProblemIndex] || state.overallChats[state.currentProblemIndex].length === 0)) {
        state.overallChats[state.currentProblemIndex] = [...prob.overall_chat];
      }
      renderOverallChatLogs();

      // 類題ボタン表示テキスト更新
      const similarBtnText = document.getElementById('similarProblemBtnText');
      if (similarBtnText) {
        const label = prob.problem_label ? `${prob.problem_label} の` : '';
        similarBtnText.textContent = `📖 ${label}類題の解説を見る`;
      }

      // ノート保存ボタン状態リセット
      const saveBtn = document.getElementById('saveToNoteBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '📁 ノートに保存';
        saveBtn.classList.replace('bg-emerald-100', 'bg-slate-100');
        saveBtn.classList.replace('text-emerald-700', 'text-slate-700');
        saveBtn.classList.replace('dark:bg-emerald-900/30', 'dark:bg-slate-800');
        saveBtn.classList.replace('dark:text-emerald-400', 'dark:text-slate-300');
      }

      if (autoPlay && state.currentSteps.length > 0) {
        state.autoPlayTimer = setTimeout(() => {
          state.autoPlayTimer = null;
          playAllSteps();
        }, 600);
      }
    }

export function renderTutorResult(data) {
      const normalized = normalizeTutorResult(data);
      if (normalized.length === 0) {
        showStatus('⚠️ AIから有効な解説データを受け取れませんでした。もう一度お試しください。', 'amber');
        return false;
      }

      closeQuizSection();
      state.currentQuizData = null;
      state.stepChats = {};
      state.stepChatBusy = {};
      state.stepQuotes = {};
      state.overallChats = {};
      state.overallChatBusy = false;
      state.currentProblems = normalized;
      state.currentProblemIndex = 0;

      showSectionWithFade('resultSection');
      renderProblemTabs();
      displayCurrentProblem(true);

      document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 類題ボタン状態リセット
      const similarBtn = document.getElementById('similarProblemBtn');
      const similarBtnSpinner = document.getElementById('similarProblemBtnSpinner');
      if (similarBtn) {
        similarBtn.disabled = false;
        if (similarBtnSpinner) similarBtnSpinner.classList.add('hidden');
      }
      return true;
    }

    // 1ステップカードの HTML（本文を先に、補足は「説明ポイント」チップで開閉）
export function stepCardHtml(step, idx) {
      const focus = String(step.focus || '').trim();
      const why = String(step.why || '').trim();
      const watch = String(step.watch_out || '').trim();

      const chips = [
        focus ? { part: 'focus', icon: '👀', label: '着眼点', title: '着眼点（どこを見る？）' } : null,
        why ? { part: 'why', icon: '🧭', label: 'なぜ？', title: 'なぜこのやり方？' } : null,
        watch ? { part: 'watch', icon: '⚠️', label: 'つまずき', title: 'ここでつまずきやすい' } : null
      ].filter(Boolean);

      return `
        <div class="flex items-start gap-2 min-w-0">
          <span class="shrink-0 bg-emerald-700 dark:bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full mt-0.5">Step ${step.step_number || idx + 1}</span>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug pt-0.5">${escapeHtml(step.title || '')}</h4>
        </div>
        <div class="flex items-stretch gap-1.5">
          <button data-action="play-step" data-idx="${idx}"
            class="flex-1 min-w-0 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition flex items-center justify-center gap-1">
            <span>🔊</span><span class="truncate">もう一度聞く</span>
          </button>
          <button data-action="simplify-step" data-idx="${idx}" id="simplify-btn-${idx}"
            class="flex-1 min-w-0 bg-fuchsia-50 hover:bg-fuchsia-100 dark:bg-fuchsia-950/60 dark:hover:bg-fuchsia-900/80 text-fuchsia-700 dark:text-fuchsia-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800 transition flex items-center justify-center gap-1">
            <span>🪄</span><span class="truncate">もっとやさしく</span>
          </button>
          <button data-action="toggle-step-chat" data-idx="${idx}" id="chat-toggle-btn-${idx}"
            class="flex-1 min-w-0 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 transition flex items-center justify-center gap-1">
            <span>❓</span><span class="truncate">質問</span>
          </button>
        </div>

        <!-- ① まず「解き方の本体」を最初に見せる -->
        <div class="relative">
          <div id="step-math-${idx}" class="text-[15px] text-slate-800 dark:text-slate-100 leading-relaxed bg-slate-50 dark:bg-slate-800/90 border border-slate-100 dark:border-slate-700 rounded-xl p-3.5 pr-11 whitespace-pre-wrap"></div>
          <button type="button" data-action="step-quote" data-idx="${idx}" data-part="math" class="absolute top-2 right-2 text-[10px] text-slate-500 dark:text-slate-400 hover:underline bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">❓ この式を聞く</button>
        </div>

        <!-- グラフ・図形描画コンテナ (SVG) -->
        <div id="step-visual-${idx}" class="viz-container hidden"></div>

        <!-- ② 補足はチップで開閉（既定は閉じる） -->
        ${chips.length ? `
        <div class="flex flex-wrap items-center gap-1.5">
          ${chips.map(c => `
          <button type="button" data-action="step-detail" data-idx="${idx}" data-part="${c.part}" data-title="${c.title}" aria-expanded="false" data-active="0"
            class="text-[11px] font-bold px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-emerald-500 transition data-[active=1]:bg-emerald-600 data-[active=1]:text-white data-[active=1]:border-emerald-600">
            <span>${c.icon}</span> ${c.label}
          </button>`).join('')}
        </div>
        <div id="step-detail-${idx}" class="hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3" data-part="">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span data-detail-title class="text-[11px] font-bold text-slate-700 dark:text-slate-200"></span>
            <button type="button" data-action="step-quote" data-idx="${idx}" data-part="focus" class="shrink-0 text-[10px] text-slate-500 dark:text-slate-400 hover:underline">❓ ここを聞く</button>
          </div>
          ${focus ? `<div data-detail-part="focus"><div id="step-focus-${idx}" class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed"></div></div>` : ''}
          ${why ? `<div data-detail-part="why" class="hidden"><div id="step-why-${idx}" class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed"></div></div>` : ''}
          ${watch ? `<div data-detail-part="watch" class="hidden"><div id="step-watch-${idx}" class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed"></div></div>` : ''}
        </div>` : ''}

        <details id="step-speech-details-${idx}" class="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-1.5">
          <summary class="cursor-pointer select-none">🗣️ 音声ガイドの全文</summary>
          <p id="step-speech-${idx}" class="mt-1.5 leading-relaxed whitespace-pre-wrap"></p>
        </details>

        <!-- ステップ別フォローアップ・質問インラインチャットパネル -->
        <div id="step-chat-panel-${idx}" class="hidden step-chat-box bg-slate-50 dark:bg-slate-800/90 border-2 border-emerald-500/50 rounded-xl p-3 sm:p-4 space-y-2.5 mt-2">
          <div class="flex items-center justify-between border-b dark:border-slate-700 pb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-base">👨‍🏫</span>
              <span class="text-xs font-bold text-emerald-800 dark:text-emerald-300">Step ${step.step_number || idx + 1} の先生に質問</span>
            </div>
            <button data-action="toggle-step-chat" data-idx="${idx}" class="text-xs text-slate-400 hover:text-slate-600 font-bold p-1">✕ 閉じる</button>
          </div>

          <!-- 引用プレビュー（クリックした箇所） -->
          <div id="step-chat-quote-${idx}" class="hidden text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-l-4 border-amber-500 p-2 rounded"></div>

          <!-- クイック質問チップ群 -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] text-slate-500 font-bold">よくある質問:</span>
            <button type="button" data-action="quick-question" data-idx="${idx}" data-text="なぜこの式や変形になるのですか？もう少し噛み砕いて教えてください。" class="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-emerald-50">🧭 なぜこの式？</button>
            <button type="button" data-action="quick-question" data-idx="${idx}" data-text="符号や不等号の向き（＋・ー・≦・≧）がこうなる理由を教えてください。" class="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-emerald-50">± 符号・不等号の理由</button>
            <button type="button" data-action="quick-question" data-idx="${idx}" data-text="具体的な数字の例を1つ使ってわかりやすく説明してください。" class="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-emerald-50">💡 具体例で教えて</button>
          </div>

          <!-- 会話ログエリア -->
          <div id="step-chat-logs-${idx}" class="space-y-2 max-h-60 overflow-y-auto p-1 text-xs">
            <!-- JSで動的レンダリング -->
          </div>

          <!-- 質問入力フォーム -->
          <div class="flex gap-1.5 pt-1">
            <input type="text" id="step-chat-input-${idx}"
              placeholder="このステップで分からない部分を質問（例: なぜマイナスで割るの？）"
              class="flex-1 text-xs border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
              data-enter="step-question-send" data-idx="${idx}" />
            <button data-action="step-question-send" data-idx="${idx}" id="step-chat-btn-${idx}"
              class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 py-2 rounded-xl text-xs shadow flex items-center gap-1 shrink-0">
              <span>送信 🚀</span>
            </button>
          </div>
        </div>
      `;
    }

    // 説明ポイントのチップ開閉（同じカード内で1つだけ開く）
export function toggleStepDetail(btn) {
      const idx = btn.dataset.idx;
      const part = btn.dataset.part;
      const box = document.getElementById(`step-detail-${idx}`);
      if (!box) return;

      const isOpen = box.dataset.part === part && !box.classList.contains('hidden');
      const chips = document.querySelectorAll(`[data-action="step-detail"][data-idx="${idx}"]`);
      chips.forEach((c) => {
        const on = !isOpen && c.dataset.part === part;
        c.dataset.active = on ? '1' : '0';
        c.setAttribute('aria-expanded', String(on));
      });

      if (isOpen) {
        box.classList.add('hidden');
        box.dataset.part = '';
        return;
      }

      box.dataset.part = part;
      box.classList.remove('hidden');
      box.querySelectorAll('[data-detail-part]').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.detailPart !== part);
      });
      const title = box.querySelector('[data-detail-title]');
      if (title) title.textContent = btn.dataset.title || '';
      const quote = box.querySelector('[data-action="step-quote"]');
      if (quote) quote.dataset.part = part;
    }

export function renderStepCards() {
      const stepsContainer = document.getElementById('stepsContainer');
      stepsContainer.innerHTML = '';

      state.currentSteps.forEach((step, idx) => {
        const card = document.createElement('div');
        card.id = `step-card-${idx}`;
        card.className = 'step-card bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 space-y-2.5';
        card.innerHTML = stepCardHtml(step, idx);
        stepsContainer.appendChild(card);

        const fill = (id, value, withMath) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.textContent = value || '';
          if (withMath) renderMathIn(el);
        };
        fill(`step-focus-${idx}`, step.focus || '', true);
        fill(`step-why-${idx}`, step.why || '', true);
        fill(`step-math-${idx}`, step.display_math || '', true);
        fill(`step-watch-${idx}`, step.watch_out || '', true);
        fill(`step-speech-${idx}`, step.speech_ja || '', false);

        // v1.6 グラフ・図形 (SVG) レンダリング
        const vizEl = document.getElementById(`step-visual-${idx}`);
        if (vizEl) renderVisual(vizEl, step.visual, step);

        // v1.6 ステップ質問チャットログ復元
        renderStepChatLogs(idx);
      });
    }

    // =========================================================================
