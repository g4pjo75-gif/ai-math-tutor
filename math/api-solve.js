import { callGeminiModel, computeRequestHash, getCachedResponse, setCachedResponse, normalizeMathExpr, isQuotaError } from '../core/index.js';
import { escapeAttr } from '../shared/actions.js';
import { safeStorage, state } from './state.js';
import { setUploadProgress } from './quiz-result.js';
import { openSettings } from './settings.js';
import { TUTOR_RESPONSE_SCHEMA, buildSystemPrompt } from './schema.js';
import { renderTutorResult } from './render.js';
import { stopSpeech } from './voice.js';
import { hideStatus, showQuotaError, showStatus } from './ui-status.js';
import { escapeHtml } from './chat-overall.js';

export async function solveProblem(overrideModelId = null, forceRefresh = false) {
      stopSpeech();
      const geminiKey = safeStorage.getItem('gemini_api_key');
      const customModel = safeStorage.getItem('custom_model_id');
      const selectedModel = overrideModelId || customModel || document.getElementById('modelSelect').value;
      const unitHint = document.getElementById('unitSelect').value;
      const userText = document.getElementById('questionInput').value.trim();

      if (!state.currentImageBase64 && !userText) {
        showStatus('⚠️ 問題の写真をアップロードするか、テキストで質問を入力してください。', 'amber');
        return;
      }

      // ④ 画像・テキストハッシュ（Fingerprint）およびマイノート照合による重複API呼び出し防止キャッシュ
      const reqFp = computeRequestHash({
            mode: 'math_solve',
            unit: unitHint,
            text: userText,
            imageBase64: state.currentImageBase64
          });

      if (!overrideModelId && !forceRefresh) {
        let cachedData = reqFp
          ? getCachedResponse(safeStorage, 'api_response_cache', reqFp)
          : null;

        // テキストのみ入力時はマイノート（tutorHistory）に同一問題があるかも照合
        if (!cachedData && !state.currentImageBase64 && userText && Array.isArray(state.tutorHistory)) {
          const normInput = normalizeMathExpr(userText);
          if (normInput && normInput.length >= 3) {
            const matchedHistory = state.tutorHistory.find(
              item => item && normalizeMathExpr(item.recognized_problem) === normInput
            );
            if (matchedHistory) {
              cachedData = matchedHistory;
            }
          }
        }

        if (cachedData) {
          state.currentModelId = selectedModel;
          state.currentProblemText = userText || '添付画像の問題';
          const renderedOk = renderTutorResult(cachedData);
          if (renderedOk) {
            showStatus('⚡ 同じ問題の解説データが保存されていたため、APIを消費せず即座に表示しました！', 'blue');
            setTimeout(() => hideStatus(), 2500);
            return;
          }
        }
      }

      if (!geminiKey) {
        openSettings();
        showStatus('🔑 先に「⚙️ 設定」からGemini APIキーを登録してください。', 'amber');
        return;
      }

      const userPrompt = userText
        ? `【生徒からの質問・問題テキスト】\n${userText}`
        : '添付された画像の問題を、写真の中の式を読み取りながら解説してください。';
      const fullPrompt = `${buildSystemPrompt(unitHint)}\n\n${userPrompt}`;

      state.currentModelId = selectedModel;
      state.currentProblemText = userText || '添付画像の問題';

      showStatus('⏳ AI先生が問題を解いています...（最大30秒）', 'blue');
      document.getElementById('solveBtn').disabled = true;
      document.getElementById('solveBtnText').classList.add('hidden');
      document.getElementById('solveBtnSpinner').classList.remove('hidden');
      setUploadProgress(10, 'AIサーバーに送信中…');

      try {
        let resultData;
        try {
          resultData = await callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { schema: TUTOR_RESPONSE_SCHEMA });
        } catch (firstErr) {
          // 混雑・レート制限・タイムアウト時は3秒待って1回だけ自動再試行
          const retryable = firstErr.name === 'AbortError' ||
            [429, 500, 502, 503, 504].includes(firstErr.status) ||
            /high demand|overloaded|rate limit|failed to fetch/i.test(firstErr.message || '');

          if (retryable) {
            showStatus(`⚠️ <strong>${escapeHtml(selectedModel)}</strong> が混雑しています。3秒後に自動で再試行します…`, 'amber');
            await new Promise(r => setTimeout(r, 3000));
            resultData = await callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { schema: TUTOR_RESPONSE_SCHEMA, timeoutMs: 40000 });
          } else {
            throw firstErr;
          }
        }

        const renderedOk = renderTutorResult(resultData);
        if (renderedOk) {
          if (reqFp) {
            setCachedResponse(safeStorage, 'api_response_cache', reqFp, resultData, 15);
          }
          hideStatus();
        }
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(selectedModel);
        } else {
          const isTimeout = err.name === 'AbortError';
          const errMsg = isTimeout
            ? '⏱️ 時間内に応答がありませんでした（サーバー混雑）。もう一度お試しください。'
            : `❌ エラー: ${escapeHtml(err.message)}`;

          const selectEl = document.getElementById('modelSelect');
          const otherModels = [...selectEl.options]
            .map(o => o.value)
            .filter(v => v !== selectedModel)
            .slice(0, 3);

          const fallbackButtons = otherModels.map(m =>
            `<button data-action="solve" data-model="${escapeAttr(m)}" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1">🔄 ${escapeHtml(m)} で再試行</button>`
          ).join('');

          showStatus(`
            <div class="space-y-2">
              <div class="font-bold text-red-700 dark:text-red-300">${errMsg}</div>
              <div class="text-xs text-slate-600 dark:text-slate-300">「⚙️ 設定」の「モデル一覧を自動取得」を押すか、別のモデルに切り替えて再試行してください。</div>
              <div class="pt-1">${fallbackButtons}
                <button data-action="open-settings" class="bg-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg m-1">⚙️ 設定・モデル自動取得</button>
              </div>
            </div>
          `, 'red');
        }
      } finally {
        document.getElementById('solveBtn').disabled = false;
        document.getElementById('solveBtnText').classList.remove('hidden');
        document.getElementById('solveBtnSpinner').classList.add('hidden');
        setUploadProgress(0, '');
      }
    }
