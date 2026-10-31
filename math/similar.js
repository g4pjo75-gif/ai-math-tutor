    // 類題（数字を変えた問題）生成 & 自分で解く「類題チャレンジ」AI自動採点システム
    // =========================================================================
    function buildSimilarProblemPrompt() {
      const unitHint = document.getElementById('unitSelect').value;
      const currentProb = state.currentProblems[state.currentProblemIndex] || {};
      const recognizedProblem = currentProb.recognized_problem || document.getElementById('recognizedProblem')?.dataset?.rawMath || '';
      const keyPoint = currentProb.key_point || document.getElementById('keyPoint')?.dataset?.rawMath || '';
      const currentProblem = recognizedProblem || state.currentProblemText;

      return `${buildSystemPrompt(unitHint)}

【特別指示：類題のワンショット作成＆完全解説】
以下の「元の問題」と同じ単元・同じ解法パターンで、数字・係数・定義域・条件だけを変えた「新しい類題」を1問作成し、その類題のステップ解説と twin_quiz を JSON形式で一度に出力してください。
【元の問題】
${currentProblem}
【重要な解法ポイント】
${keyPoint}`;
    }

    // 1. 類題の解説をすぐ見る（ワンショット1回呼び出しに最適化：従来の2回呼び出しを1回に削減）
    async function generateSimilarProblem() {
      const btn = document.getElementById('similarProblemBtn');
      const btnText = document.getElementById('similarProblemBtnText');
      const btnSpinner = document.getElementById('similarProblemBtnSpinner');

      if (btn) {
        btn.disabled = true;
        if (btnText) btnText.classList.add('hidden');
        if (btnSpinner) btnSpinner.classList.remove('hidden');
      }

      const geminiKey = safeStorage.getItem('gemini_api_key');
      const selectedModel = safeStorage.getItem('custom_model_id') || document.getElementById('modelSelect').value;

      if (!geminiKey) {
        openSettings();
        showStatus('🔑 先に「⚙️ 設定」からGemini APIキーを登録してください。', 'amber');
        if (btn) {
          btn.disabled = false;
          if (btnText) btnText.classList.remove('hidden');
          if (btnSpinner) btnSpinner.classList.add('hidden');
        }
        return;
      }

      try {
        stopSpeech();
        closeQuizSection();
        showStatus(`⏳ AI先生（<strong>${escapeHtml(selectedModel)}</strong>）が類題とステップ解説を同時に作成しています…`, 'blue');
        const prompt = buildSimilarProblemPrompt();
        const resultData = await callGeminiModel(selectedModel, geminiKey, prompt, null, {
          schema: TUTOR_RESPONSE_SCHEMA,
          temperature: 0.65,
          timeoutMs: 35000
        });

        clearImage();
        const renderedOk = renderTutorResult(resultData);
        if (renderedOk) {
          const firstProb = state.currentProblems[0];
          const questionInput = document.getElementById('questionInput');
          if (questionInput && firstProb?.recognized_problem) {
            questionInput.value = sanitizeMathString(firstProb.recognized_problem);
          }
          hideStatus();
        }
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(selectedModel);
        } else {
          const isTimeout = err.name === 'AbortError';
          const errMsg = isTimeout
            ? '⏱️ 類題生成がタイムアウトしました。もう一度お試しください。'
            : `❌ 類題生成エラー: ${escapeHtml(err.message)}`;
          showStatus(errMsg, 'red');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          if (btnText) btnText.classList.remove('hidden');
          if (btnSpinner) btnSpinner.classList.add('hidden');
        }
      }
    }
