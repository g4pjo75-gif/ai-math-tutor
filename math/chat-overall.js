import { escapeAttr } from '../shared/actions.js';
import { safeStorage, state } from './state.js';
import { openSettings } from './settings.js';
import { callGeminiModel, isQuotaError } from '../core/index.js';
import { renderMathIn, sanitizeMathString } from './render.js';
import { speakJapanese } from './voice.js';
import { showQuotaError, showStatus, showToast } from './ui-status.js';

    // 問題全体の解法・別解についての質問チャット (Alternative Solutions & Overall Q&A)
    // =========================================================================
export function renderOverallChatLogs() {
      const container = document.getElementById('overallChatLogs');
      if (!container) return;

      const logs = state.overallChats[state.currentProblemIndex] || [];
      if (logs.length === 0) {
        container.innerHTML = `
          <div class="text-center py-3 text-slate-400 dark:text-slate-500 space-y-1">
            <p class="font-bold">まだ解法についての質問はありません。</p>
            <p class="text-[11px]">上のクイックボタンを押すか、下の入力欄から「解法Aではなく解法B（因数分解/解の公式/判別式など）で解いて」と自由に聞いてみましょう！</p>
          </div>
        `;
        return;
      }

      container.innerHTML = logs.map(msg => {
        const isUser = msg.role === 'user';
        if (isUser) {
          return `
            <div class="flex flex-col items-end space-y-1">
              <span class="text-[10px] text-slate-400 font-bold">あなた</span>
              <div class="max-w-[90%] p-3 rounded-2xl rounded-br-none bg-emerald-600 text-white shadow-sm leading-relaxed">
                <div>${escapeHtml(msg.text)}</div>
              </div>
            </div>
          `;
        }

        const methodName = msg.method_name
          ? `<span class="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full inline-block">💡 ${escapeHtml(msg.method_name)}</span>`
          : '';
        const comparisonNote = msg.comparison_note ? `
          <div class="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-200 text-xs space-y-0.5">
            <div class="font-bold text-amber-800 dark:text-amber-300">⚖️ 解法比較・使い分けのコツ:</div>
            <div class="overall-chat-math">${escapeHtml(msg.comparison_note)}</div>
          </div>
        ` : '';
        const speechBtn = msg.speech_ja ? `
          <button data-action="speak-ja" data-text="${escapeAttr(msg.speech_ja)}" class="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 mt-1">
            <span>🔊 声で解説を聞く</span>
          </button>
        ` : '';

        return `
          <div class="flex flex-col items-start space-y-1">
            <span class="text-[10px] text-slate-400 font-bold">👨‍🏫 AI先生の回答</span>
            <div class="max-w-[95%] p-3.5 rounded-2xl rounded-bl-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2 leading-relaxed">
              ${methodName}
              <div class="overall-chat-math leading-relaxed">${escapeHtml(msg.text)}</div>
              ${comparisonNote}
              ${speechBtn}
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.overall-chat-math').forEach(el => renderMathIn(el));
      container.scrollTop = container.scrollHeight;
    }

export function sendOverallQuickQuestion(text) {
      const inputEl = document.getElementById('overallChatInput');
      if (inputEl) inputEl.value = text;
      sendOverallQuestion(text);
    }

export async function sendOverallQuestion(directQuestion = null) {
      const inputEl = document.getElementById('overallChatInput');
      const question = (directQuestion || inputEl?.value || '').trim();
      if (!question) return;

      if (state.overallChatBusy) return;

      const reqIndex = state.currentProblemIndex;
      const currentProb = state.currentProblems[reqIndex] || {};
      const currentProblem = currentProb.recognized_problem || (reqIndex === state.currentProblemIndex ? state.currentProblemText : '') || '';
      if (!currentProblem) {
        showStatus('⚠️ 先に問題を解析してください。', 'amber');
        return;
      }

      const geminiKey = safeStorage.getItem('gemini_api_key');
      const selectedModel = safeStorage.getItem('custom_model_id') || document.getElementById('modelSelect').value;

      if (!geminiKey) {
        openSettings();
        showStatus('🔑 先に「⚙️ 設定」からGemini APIキーを登録してください。', 'amber');
        return;
      }

      if (!state.overallChats[reqIndex]) {
        state.overallChats[reqIndex] = [];
      }

      state.overallChats[reqIndex].push({
        role: 'user',
        text: question,
        createdAt: Date.now()
      });

      if (inputEl) inputEl.value = '';
      if (reqIndex === state.currentProblemIndex) {
        renderOverallChatLogs();
      }

      const btn = document.getElementById('overallChatBtn');
      const btnText = document.getElementById('overallChatBtnText');
      const btnSpinner = document.getElementById('overallChatBtnSpinner');
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = '解説を作成中…';
      if (btnSpinner) btnSpinner.classList.remove('hidden');
      state.overallChatBusy = true;

      const unitHint = document.getElementById('unitSelect').value;
      const probSteps = Array.isArray(currentProb.steps) && currentProb.steps.length ? currentProb.steps : state.currentSteps;
      const originalStepsSummary = probSteps.map(s => `・ステップ${s.step_number} (${s.title}): ${s.why || ''} 黒板式: ${s.display_math || ''}`).join('\n');
      const pastChatContext = state.overallChats[reqIndex].slice(-4).map(m => `${m.role === 'user' ? '生徒' : '先生'}: ${m.text}`).join('\n');

      const prompt = `あなたは日本の高校1年生を教えるあたたかくて優秀なプロ数学教師です。
生徒が以下の問題について、AIが最初に行った解法（解法A）とは「別の解法（解法B、別解）」や、問題全体の解き方についての質問をしています。
生徒の要望に寄り添い、別の解き方の途中式や考え方、または解法同士の使い分けのコツを丁寧に解説してください。

【対象の問題】
${currentProblem}

【単元ヒント】
${unitHint}

【着眼点】
${currentProb.key_point || ''}

【AI先生が最初に行った解法（解法A）の概要】
${originalStepsSummary}

【最終的な答え】
${currentProb.final_answer || ''}

【これまでの対話履歴】
${pastChatContext}

【生徒からの質問・別解の依頼】
${question}

【指導・回答ルール】
1. 生徒が「別の解き方（別解）」「別のアプローチ（公式、因数分解、幾何的、グラフなど）」を求めている場合は、その解き方（解法B）の方針・途中式・考え方を省略せずにわかりやすく説明してください。
2. method_name には別解のタイトル（例: 「別解：解の公式を使った解法」「別解：グラフと対称性を利用した幾何的解法」など）を簡潔に記載。
3. answer には解法の完全な説明と途中式を記述。数式は必ずLaTeX形式（$...$ または $$...$$）で記述し、バックスラッシュは2重エスケープ（\\\\leqq, \\\\frac など）してください。
4. comparison_note には「元の解法Aと今回の解法Bのメリット・デメリット、試験での使い分けのコツ」を2〜3文でアドバイスしてください。
5. speech_ja には音声で読み上げるための自然な台本（LaTeX禁止・日本語読み言葉）を120〜180文字で作成してください。
6. 出力は指定のJSON形式のみ。`;

      const OVERALL_CHAT_SCHEMA = {
        type: 'OBJECT',
        properties: {
          method_name: { type: 'STRING' },
          answer: { type: 'STRING' },
          comparison_note: { type: 'STRING' },
          speech_ja: { type: 'STRING' }
        },
        required: ['method_name', 'answer', 'comparison_note', 'speech_ja']
      };

      try {
        const res = await callGeminiModel(selectedModel, geminiKey, prompt, null, {
          schema: OVERALL_CHAT_SCHEMA,
          temperature: 0.5,
          timeoutMs: 35000
        });

        const assistantMsg = {
          role: 'assistant',
          text: sanitizeMathString(res.answer || ''),
          method_name: sanitizeMathString(res.method_name || '別解・解法解説'),
          comparison_note: sanitizeMathString(res.comparison_note || ''),
          speech_ja: res.speech_ja || '',
          createdAt: Date.now()
        };

        if (!state.overallChats[reqIndex]) state.overallChats[reqIndex] = [];
        state.overallChats[reqIndex].push(assistantMsg);

        // currentProblems および tutorHistory と同期
        if (state.currentProblems[reqIndex]) {
          state.currentProblems[reqIndex].overall_chat = state.overallChats[reqIndex].slice(-10);
        }

        if (reqIndex === state.currentProblemIndex) {
          renderOverallChatLogs();
          if (assistantMsg.speech_ja) {
            speakJapanese(assistantMsg.speech_ja);
          }
        } else {
          showToast('別の問題の回答が届きました。タブを切り替えると確認できます。', 'blue');
        }
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(selectedModel);
        } else {
          showStatus(`❌ 別解解説エラー: ${escapeHtml(err.message)}`, 'red');
        }
      } finally {
        state.overallChatBusy = false;
        const curBtn = document.getElementById('overallChatBtn');
        const curBtnText = document.getElementById('overallChatBtnText');
        const curBtnSpinner = document.getElementById('overallChatBtnSpinner');
        if (curBtn) curBtn.disabled = false;
        if (curBtnText) curBtnText.textContent = '質問する 🚀';
        if (curBtnSpinner) curBtnSpinner.classList.add('hidden');
      }
    }

export function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
