    // 6-2. 「もっとやさしく」：そのステップだけを、よりかみくだいて再生成
    // =========================================================================
    function buildSimplifyPrompt(step) {
      return `あなたは日本の高校1年生に数学を教える、とてもやさしい先生です。
生徒から「このステップがまだ難しい」と言われました。同じ内容を、もっとやさしく、かみくだいて説明し直してください。

【問題】${state.currentProblemText}
【ステップ】${step.title || ''}
【今の説明】${step.display_math || ''}
${step.why ? `【今の意図】${step.why}` : ''}

【やさしくするコツ】
- 難しい言葉を、中学生でもわかる言葉に置き換える。
  例：平方完成 → 「式を (x+□)^2 の形に作り変えること」
- 数字や具体例を1つ入れる。
- 計算は1行ずつ、絶対に省略しない。
- 「なぜそうなるか」を身近な例えで説明する。
- 文章は短く。音声台本は120〜200文字。
- focus / why / watch_out も、やさしい言葉にする。
- speech_ja にLaTeX記号は入れない。読み言葉にする。

【出力形式】JSONのみ。
{
  "title": "やさしい見出し",
  "focus": "どこを見るか（やさしい言葉で1文）",
  "why": "なぜこのやり方か（やさしい言葉で1〜2文）",
  "display_math": "黒板の説明（数式は $...$）",
  "watch_out": "つまずきポイント（なければ空文字）",
  "speech_ja": "音声台本。LaTeX禁止。120〜200文字"
}`;
    }

    async function simplifyStep(idx) {
      const step = state.currentSteps[idx];
      if (!step) return;

      const key = safeStorage.getItem('gemini_api_key');
      if (!key) {
        openSettings();
        showStatus('🔑 先に「⚙️ 設定」からGemini APIキーを登録してください。', 'amber');
        return;
      }

      const model = state.currentModelId || safeStorage.getItem('custom_model_id') || document.getElementById('modelSelect').value;
      const btn = document.getElementById(`simplify-btn-${idx}`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ 考え中…';
      }

      stopSpeech();

      try {
        const data = await callGeminiModel(model, key, buildSimplifyPrompt(step), null, {
          schema: SIMPLIFY_RESPONSE_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 4096,
          timeoutMs: 30000
        });

        const existingVisual = step.visual;
        const newVisual = (data.visual && data.visual.type && data.visual.type !== 'none')
          ? data.visual
          : (existingVisual && existingVisual.type !== 'none' ? existingVisual : null);

        state.currentSteps[idx] = {
          ...step,
          title: data.title || step.title,
          focus: data.focus || step.focus,
          why: data.why || step.why,
          display_math: data.display_math || step.display_math,
          watch_out: (data.watch_out ?? step.watch_out) || '',
          visual: newVisual,
          speech_ja: data.speech_ja || step.speech_ja,
          followups: []
        };
        if (state.currentProblems[state.currentProblemIndex]) {
          state.currentProblems[state.currentProblemIndex].steps = state.currentSteps;
        }

        // 質問履歴をリセットして古い文脈との混線を防止
        const chatKey = `${state.currentProblemIndex}:${idx}`;
        state.stepChats[chatKey] = [];
        delete stepQuotes[chatKey];

        renderStepCards();
        highlightStepCard(idx);

        const simplified = state.currentSteps[idx];
        setTimeout(() => {
          highlightStepCard(idx);
          speakJapanese(simplified.speech_ja || simplified.title || '', () => highlightStepCard(-1));
        }, 350);
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(model);
        } else {
          showStatus(`❌ やさしい説明の生成に失敗しました: ${escapeHtml(err.message)}`, 'red');
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = '🪄 もっとやさしく';
        }
      }
    }
