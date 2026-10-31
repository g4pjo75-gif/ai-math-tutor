import { escapeAttr } from '../shared/actions.js';
import { safeStorage, state } from './state.js';
import { openSettings } from './settings.js';
import { callGeminiModel, isQuotaError } from '../core/index.js';
import { renderMathIn, sanitizeMathString } from './render.js';
import { speakJapanese, stopSpeech } from './voice.js';
import { showQuotaError, showStatus, showToast } from './ui-status.js';
import { escapeHtml } from './chat-overall.js';

    // =========================================================================
    // 9. ステップ別フォローアップ質問インラインチャット (Step Q&A)
    // =========================================================================
export function toggleStepChat(stepIdx) {
      const panel = document.getElementById(`step-chat-panel-${stepIdx}`);
      if (!panel) return;
      const isHidden = panel.classList.toggle('hidden');
      if (!isHidden) {
        stopSpeech();
        // iOS: 自動フォーカスはキーボードを即座に出して入力欄を隠すため、スクロールのみ行う
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

export function openStepChatWithQuote(stepIdx, partKey) {
      const panel = document.getElementById(`step-chat-panel-${stepIdx}`);
      if (!panel) return;
      panel.classList.remove('hidden');

      const quoteEl = document.getElementById(`step-chat-quote-${stepIdx}`);
      const step = state.currentSteps[stepIdx] || {};

      let quoteText = '';
      if (partKey === 'focus') quoteText = `【着眼点】${step.focus || ''}`;
      else if (partKey === 'why') quoteText = `【理由】${step.why || ''}`;
      else if (partKey === 'math') quoteText = `【計算式】${step.display_math || ''}`;
      else if (partKey === 'watch') quoteText = `【注意点】${step.watch_out || ''}`;

      const chatKey = `${state.currentProblemIndex}:${stepIdx}`;
      state.stepQuotes[chatKey] = quoteText;

      if (quoteEl && quoteText) {
        quoteEl.textContent = `引用: ${quoteText.slice(0, 80)}${quoteText.length > 80 ? '…' : ''}`;
        quoteEl.classList.remove('hidden');
      }

      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const inputEl = document.getElementById(`step-chat-input-${stepIdx}`);
      if (inputEl) {
        inputEl.value = `この部分について教えてください: `;
      }
    }

export function renderStepChatLogs(stepIdx) {
      const logsEl = document.getElementById(`step-chat-logs-${stepIdx}`);
      if (!logsEl) return;

      const chatKey = `${state.currentProblemIndex}:${stepIdx}`;
      const messages = state.stepChats[chatKey] || [];

      if (messages.length === 0) {
        logsEl.innerHTML = `
          <div class="text-[11px] text-slate-400 dark:text-slate-500 py-1 text-center">
            このステップで疑問に思ったことを何でも質問してください。AI先生がピンポイントでお答えします。
          </div>
        `;
        return;
      }

      logsEl.innerHTML = messages.map(msg => {
        const isUser = msg.role === 'user';
        return `
          <div class="flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1">
            <span class="text-[10px] text-slate-400 font-bold">${isUser ? 'あなた' : '👨‍🏫 先生の回答'}</span>
            <div class="max-w-[90%] p-2.5 rounded-xl leading-relaxed ${isUser
              ? 'bg-emerald-600 text-white rounded-br-none'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none shadow-sm'}">
              <div class="step-chat-text">${escapeHtml(msg.text)}</div>
            </div>
            ${msg.speech_ja ? `
            <button data-action="speak-ja" data-text="${escapeAttr(msg.speech_ja)}" class="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1">
              <span>🔊 声で聞く</span>
            </button>` : ''}
          </div>
        `;
      }).join('');

      // 数式描画
      logsEl.querySelectorAll('.step-chat-text').forEach(el => renderMathIn(el));
      logsEl.scrollTop = logsEl.scrollHeight;
    }

export function sendQuickQuestion(stepIdx, text) {
      const inputEl = document.getElementById(`step-chat-input-${stepIdx}`);
      if (inputEl) inputEl.value = text;
      sendStepQuestion(stepIdx);
    }

export async function sendStepQuestion(stepIdx) {
      const inputEl = document.getElementById(`step-chat-input-${stepIdx}`);
      if (!inputEl) return;
      const question = (inputEl.value || '').trim();
      if (!question) return;

      const reqProblemIndex = state.currentProblemIndex;
      const reqStepIdx = stepIdx;
      const chatKey = `${reqProblemIndex}:${reqStepIdx}`;
      if (state.stepChatBusy[chatKey]) return;

      if (!state.stepChats[chatKey]) state.stepChats[chatKey] = [];
      const userTurnCount = state.stepChats[chatKey].filter(m => m.role === 'user').length;
      if (userTurnCount >= 6) {
        showToast('⚠️ このステップへの質問は上限（6回）に達しました。次のステップに進むか、新しい問題で質問してください。', 'amber');
        inputEl.disabled = true;
        inputEl.placeholder = 'このステップの質問上限に達しました';
        const sendBtn = document.getElementById(`step-chat-btn-${reqStepIdx}`);
        if (sendBtn) sendBtn.disabled = true;
        return;
      }

      const geminiKey = safeStorage.getItem('gemini_api_key');
      const selectedModel = safeStorage.getItem('custom_model_id') || document.getElementById('modelSelect').value;

      if (!geminiKey) {
        openSettings();
        showStatus('🔑 先に「⚙️ 設定」からGemini APIキーを登録してください。', 'amber');
        return;
      }

      const reqProb = state.currentProblems[reqProblemIndex] || {};
      const probSteps = Array.isArray(reqProb.steps) && reqProb.steps.length ? reqProb.steps : state.currentSteps;
      const step = probSteps[reqStepIdx] || {};
      const probText = reqProb.recognized_problem || (reqProblemIndex === state.currentProblemIndex ? state.currentProblemText : '') || '';
      const unitHint = document.getElementById('unitSelect').value;

      state.stepChats[chatKey].push({ role: 'user', text: question, createdAt: Date.now() });

      inputEl.value = '';
      if (reqProblemIndex === state.currentProblemIndex) {
        renderStepChatLogs(reqStepIdx);
      }

      const btn = document.getElementById(`step-chat-btn-${reqStepIdx}`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '考え中…';
      }
      state.stepChatBusy[chatKey] = true;

      // 過去2ターンの会話コンテキスト
      const pastMessages = state.stepChats[chatKey].slice(-4).map(m => `${m.role === 'user' ? '生徒' : '先生'}: ${m.text}`).join('\n');
      const activeQuote = state.stepQuotes[chatKey] ? `【生徒が疑問に思ってハイライトした部分】\n${state.stepQuotes[chatKey]}\n\n` : '';

      const prompt = `あなたは日本の高校1年生に数学を教える優しい先生です。生徒が以下の【該当ステップ】の一部について質問しています。問題全体を最初から解き直すのではなく、このステップの疑問点に対してピンポイントで、中学生でも分かるように優しく答えてください。

【元の問題】${probText}
【単元】${unitHint}
【該当ステップ${step.step_number || reqStepIdx + 1}】
タイトル: ${step.title || ''}
着眼点: ${step.focus || ''}
なぜこのやり方: ${step.why || ''}
数式・黒板: ${step.display_math || ''}
つまずきやすい点: ${step.watch_out || ''}

${activeQuote}【これまでの会話】
${pastMessages}

【生徒の質問】
${question}

【回答ルール】
- 該当ステップの疑問点にだけ焦点を当て、3〜5文で分かりやすく回答。
- 数式は必ずLaTeX形式（$...$）で記述。
- 音声台本 speech_ja にはLaTeX記号を入れず、読み言葉で100〜160文字。
- 出力はJSONのみ。`;

      const FOLLOWUP_SCHEMA = {
        type: 'OBJECT',
        properties: {
          answer: { type: 'STRING' },
          speech_ja: { type: 'STRING' }
        },
        required: ['answer', 'speech_ja']
      };

      try {
        const res = await callGeminiModel(selectedModel, geminiKey, prompt, null, {
          schema: FOLLOWUP_SCHEMA,
          temperature: 0.4,
          timeoutMs: 25000
        });

        state.stepChats[chatKey].push({
          role: 'assistant',
          text: sanitizeMathString(res.answer || ''),
          speech_ja: res.speech_ja || '',
          createdAt: Date.now()
        });

        // step.followups に保存（ノート保存・復元と同期）
        step.followups = state.stepChats[chatKey].slice(-8);
        if (state.currentProblems[reqProblemIndex] && state.currentProblems[reqProblemIndex].steps && state.currentProblems[reqProblemIndex].steps[reqStepIdx]) {
          state.currentProblems[reqProblemIndex].steps[reqStepIdx].followups = step.followups;
        }

        delete state.stepQuotes[chatKey];

        if (reqProblemIndex === state.currentProblemIndex) {
          const quoteEl = document.getElementById(`step-chat-quote-${reqStepIdx}`);
          if (quoteEl) quoteEl.classList.add('hidden');

          renderStepChatLogs(reqStepIdx);
          if (res.speech_ja) {
            speakJapanese(res.speech_ja);
          }
        } else {
          showToast('別の問題のステップ回答が届きました。タブを切り替えると確認できます。', 'blue');
        }
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(selectedModel);
        } else {
          showStatus(`❌ 質問エラー: ${escapeHtml(err.message)}`, 'red');
        }
      } finally {
        state.stepChatBusy[chatKey] = false;
        if (reqProblemIndex === state.currentProblemIndex) {
          const curBtn = document.getElementById(`step-chat-btn-${reqStepIdx}`);
          if (curBtn) {
            curBtn.disabled = false;
            curBtn.textContent = '送信 🚀';
          }
        }
      }
    }

    // =========================================================================
