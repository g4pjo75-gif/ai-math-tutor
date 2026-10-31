    async function fetchWithTimeout(url, options, timeoutMs = 25000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
      } finally {
        clearTimeout(timer);
      }
    }

    function parseTutorJson(rawText) {
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');

      let startIdx = -1;
      let endIdx = -1;

      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        endIdx = cleaned.lastIndexOf('}');
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        endIdx = cleaned.lastIndexOf(']');
      }

      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error('AIの応答からJSONデータを抽出できませんでした。');
      }
      return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    }

    async function callGeminiModel(modelId, apiKey, promptText, imageBase64, options = {}) {
      const cleanModelId = String(modelId).replace(/^models\//, '').trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModelId)}:generateContent`;

      const parts = [{ text: promptText }];
      if (imageBase64) {
        parts.push({
          inline_data: { mime_type: 'image/jpeg', data: imageBase64 }
        });
      }

      const temperature = options.temperature ?? 0.35;
      const maxOutputTokens = options.maxOutputTokens ?? 32768;
      const schema = options.schema || TUTOR_RESPONSE_SCHEMA;
      const useJson = !options.rawText;

      const buildPayload = (useStructured) => ({
        contents: [{ role: 'user', parts }],
        generationConfig: useStructured && useJson
          ? { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema }
          : { temperature: useStructured ? temperature : 0.3, maxOutputTokens }
      });

      const send = async (useStructured) => {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(buildPayload(useStructured))
        }, options.timeoutMs || 30000);

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(data.error?.message || `HTTP Error ${res.status}`);
          err.status = res.status;
          throw err;
        }
        return data;
      };

      let data;
      try {
        data = await send(true);
      } catch (err) {
        // 構造化出力（responseSchema）に未対応のモデル向けフォールバック
        if (err.status === 400 && /response|schema|mime/i.test(err.message)) {
          data = await send(false);
        } else {
          throw err;
        }
      }

      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const text = candidate?.content?.parts?.map(p => p.text || '').join('\n') || '';
      if (!text) {
        if (finishReason === 'MAX_TOKENS') {
          throw new Error('AIの回答が途中で切れました（思考・出力トークン上限）。もう一度試すか、入力内容を絞ってください。');
        }
        const blockReason = data.promptFeedback?.blockReason || finishReason;
        throw new Error(blockReason
          ? `モデルが応答を中断しました（理由: ${blockReason}）`
          : 'モデルから空の応答が返されました。');
      }
      if (options.rawText) {
        return text.trim();
      }
      try {
        return parseTutorJson(text);
      } catch (parseErr) {
        if (finishReason === 'MAX_TOKENS') {
          throw new Error('問題数が多いためAIの回答が途中で切れました（トークン上限）。写真を1〜2問ずつ切り取ってアップロードしてください。');
        }
        throw parseErr;
      }
    }

    async function solveProblem(overrideModelId = null, forceRefresh = false) {
      stopSpeech();
      const geminiKey = safeStorage.getItem('gemini_api_key');
      const customModel = safeStorage.getItem('custom_model_id');
      const selectedModel = overrideModelId || customModel || document.getElementById('modelSelect').value;
      const unitHint = document.getElementById('unitSelect').value;
      const userText = document.getElementById('questionInput').value.trim();

      if (!currentImageBase64 && !userText) {
        showStatus('⚠️ 問題の写真をアップロードするか、テキストで質問を入力してください。', 'amber');
        return;
      }

      // ④ 画像・テキストハッシュ（Fingerprint）およびマイノート照合による重複API呼び出し防止キャッシュ
      const reqFp = window.TutorCore
        ? window.TutorCore.computeRequestHash({
            mode: 'math_solve',
            unit: unitHint,
            text: userText,
            imageBase64: currentImageBase64
          })
        : null;

      if (!overrideModelId && !forceRefresh) {
        let cachedData = reqFp && window.TutorCore
          ? window.TutorCore.getCachedResponse(safeStorage, 'api_response_cache', reqFp)
          : null;

        // テキストのみ入力時はマイノート（tutorHistory）に同一問題があるかも照合
        if (!cachedData && !currentImageBase64 && userText && window.TutorCore && Array.isArray(tutorHistory)) {
          const normInput = window.TutorCore.normalizeMathExpr(userText);
          if (normInput && normInput.length >= 3) {
            const matchedHistory = tutorHistory.find(
              item => item && window.TutorCore.normalizeMathExpr(item.recognized_problem) === normInput
            );
            if (matchedHistory) {
              cachedData = matchedHistory;
            }
          }
        }

        if (cachedData) {
          currentModelId = selectedModel;
          currentProblemText = userText || '添付画像の問題';
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

      currentModelId = selectedModel;
      currentProblemText = userText || '添付画像の問題';

      showStatus('⏳ AI先生が問題を解いています...（最大30秒）', 'blue');
      document.getElementById('solveBtn').disabled = true;
      document.getElementById('solveBtnText').classList.add('hidden');
      document.getElementById('solveBtnSpinner').classList.remove('hidden');
      setUploadProgress(10, 'AIサーバーに送信中…');

      try {
        let resultData;
        try {
          resultData = await callGeminiModel(selectedModel, geminiKey, fullPrompt, currentImageBase64);
        } catch (firstErr) {
          // 混雑・レート制限・タイムアウト時は3秒待って1回だけ自動再試行
          const retryable = firstErr.name === 'AbortError' ||
            [429, 500, 502, 503, 504].includes(firstErr.status) ||
            /high demand|overloaded|rate limit|failed to fetch/i.test(firstErr.message || '');

          if (retryable) {
            showStatus(`⚠️ <strong>${escapeHtml(selectedModel)}</strong> が混雑しています。3秒後に自動で再試行します…`, 'amber');
            await new Promise(r => setTimeout(r, 3000));
            resultData = await callGeminiModel(selectedModel, geminiKey, fullPrompt, currentImageBase64, { timeoutMs: 40000 });
          } else {
            throw firstErr;
          }
        }

        const renderedOk = renderTutorResult(resultData);
        if (renderedOk) {
          if (reqFp && window.TutorCore) {
            window.TutorCore.setCachedResponse(safeStorage, 'api_response_cache', reqFp, resultData, 15);
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
