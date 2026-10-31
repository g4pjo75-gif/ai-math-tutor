    // =========================================================================
    // 6. 4択 文法・語彙クイズモード (A-01 / A-02 監査基準完全準拠)
    // =========================================================================
    function shuffleQuizChoices(choices, correctIndex, feedbacks = []) {
      const items = choices.map((c, idx) => ({
        text: String(c).trim(),
        feedback: Array.isArray(feedbacks) ? String(feedbacks[idx] || '').trim() : '',
        isCorrect: idx === correctIndex
      }));
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return {
        displayChoices: items.map(it => it.text),
        displayFeedback: items.map(it => it.feedback),
        displayCorrectIndex: items.findIndex(it => it.isCorrect)
      };
    }

    function isValidQuizResponse(q) {
      if (!q || !Array.isArray(q.choices) || q.choices.length !== 4) return false;
      const cleaned = q.choices.map(c => String(c || '').trim());
      if (cleaned.some(c => !c)) return false;
      if (new Set(cleaned.map(c => c.toLowerCase())).size !== 4) return false;
      if (typeof q.correct_index !== 'number' || !Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) return false;
      return true;
    }

    function applyAndRenderEnglishQuiz(res, unitHint) {
      const shuffled = shuffleQuizChoices(res.choices, res.correct_index, res.choice_feedback);
      currentQuizData = {
        targetPoint: res.target_point || unitHint,
        questionEn: res.question_en || '',
        translationJa: res.translation_ja || '',
        hint: res.hint || '文脈と時制・品詞のつながりに注目しましょう。',
        explanation: res.explanation || '',
        displayChoices: shuffled.displayChoices,
        displayFeedback: shuffled.displayFeedback,
        displayCorrectIndex: shuffled.displayCorrectIndex
      };

      selectedChoiceIndex = -1;
      hideStatus();

      document.getElementById('quizEmptyState').classList.add('hidden');
      document.getElementById('quizActiveContainer').classList.remove('hidden');
      document.getElementById('quizResultBox').classList.add('hidden');

      document.getElementById('quizTargetBadge').textContent = currentQuizData.targetPoint;
      document.getElementById('quizQuestionText').textContent = currentQuizData.questionEn;
      document.getElementById('quizTranslationText').textContent = `和訳: ${currentQuizData.translationJa}`;
      document.getElementById('quizHintContent').textContent = currentQuizData.hint;
      document.getElementById('quizHintContent').classList.add('hidden');
      document.getElementById('quizHintIcon').textContent = '▼';

      renderEnglishQuizChoices();
    }

    async function generateEnglishQuiz(useCurrentLesson = false) {
      const unitHint = document.getElementById('unitSelect').value;

      // ① ワンショット事前生成された twin_quiz があれば API消費0・待ち時間0秒で即座に出題！
      if (useCurrentLesson && lastLessonData && lastLessonData.twin_quiz && !lastLessonData._twinQuizConsumed && isValidQuizResponse(lastLessonData.twin_quiz)) {
        lastLessonData._twinQuizConsumed = true;
        applyAndRenderEnglishQuiz(lastLessonData.twin_quiz, unitHint);
        window.TutorUI.showToast('⚡ 読解時に同時作成した4択クイズを即座に出題しました！', 'blue');
        return;
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        openSettings();
        window.TutorUI.showToast('🔑 先に設定からGemini APIキーを入力してください。', 'amber');
        return;
      }

      const modelId = getActiveModel();
      const btn = document.getElementById('generateQuizBtn');
      const btnText = document.getElementById('generateQuizBtnText');

      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = '⏳ 問題作成中…';
      showStatus('⏳ AI先生が高校英語の4択クイズを作成しています…', 'blue');

      const contextText = (useCurrentLesson && lastLessonData && lastLessonData.passage_en)
        ? `【直前に学習した英文】:\n${lastLessonData.passage_en}\nこの英文に出てくる語彙または文法事項から出題してください。`
        : `【出題単元】: ${unitHint}\n日本の高校1年生（英語コミュニケーションI / 論理・表現I）レベルの4択空所補充問題または語彙問題を1問作成してください。`;

      const prompt = `あなたは日本の高校英語教師です。以下の条件で4択クイズを1問作成し、JSONのみで出力してください。
${contextText}
【厳守ルール】:
- choices は必ず4個の異なる英語の選択肢にしてください（重複禁止）。
- correct_index は 0〜3 の整数。
- choice_feedback は choices と同じ順番で4個作成し、それぞれの選択肢がなぜ正解・不正解なのかを日本語で分かりやすく説明してください。`;

      try {
        let res = await window.TutorCore.callGeminiModel({
          modelId,
          apiKey,
          promptText: prompt,
          schema: ENGLISH_QUIZ_SCHEMA,
          temperature: 0.65,
          timeoutMs: 25000
        });

        if (!isValidQuizResponse(res)) {
          // 1回自動再生成
          res = await window.TutorCore.callGeminiModel({
            modelId,
            apiKey,
            promptText: prompt,
            schema: ENGLISH_QUIZ_SCHEMA,
            temperature: 0.75,
            timeoutMs: 25000
          });
        }

        if (!isValidQuizResponse(res)) {
          throw new Error('有効な4択データの生成に失敗しました。もう一度ボタンを押してください。');
        }

        applyAndRenderEnglishQuiz(res, unitHint);
      } catch (err) {
        console.error(err);
        showStatus(`❌ クイズ作成エラー: ${err.message}`, 'red');
      } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = '新しい問題を出題';
      }
    }

    function renderEnglishQuizChoices() {
      const grid = document.getElementById('quizChoiceGrid');
      if (!grid || !currentQuizData) return;
      const labels = ['A', 'B', 'C', 'D'];

      grid.innerHTML = currentQuizData.displayChoices.map((text, idx) => {
        const isSelected = selectedChoiceIndex === idx;
        const cls = isSelected
          ? 'selected border-blue-600 bg-blue-50 text-blue-950 dark:bg-blue-950/60 dark:text-blue-100 ring-2 ring-blue-500'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60';
        return `
          <button type="button" role="radio" aria-checked="${isSelected}" onclick="selectEnglishQuizChoice(${idx})"
            class="choice-btn ${cls} border-2 rounded-2xl p-3.5 text-left flex items-center gap-3 transition">
            <span class="shrink-0 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 font-bold text-xs flex items-center justify-center">${labels[idx]}</span>
            <span class="text-sm sm:text-base font-serif font-bold flex-1 break-words">${escapeHtml(text)}</span>
            ${isSelected ? '<span class="text-blue-600 dark:text-blue-400 font-bold">✓</span>' : ''}
          </button>
        `;
      }).join('');
    }

    function selectEnglishQuizChoice(idx) {
      selectedChoiceIndex = idx;
      renderEnglishQuizChoices();
    }

    function toggleQuizHint() {
      const el = document.getElementById('quizHintContent');
      const icon = document.getElementById('quizHintIcon');
      if (!el) return;
      const isHidden = el.classList.toggle('hidden');
      if (icon) icon.textContent = isHidden ? '▼' : '▲';
    }

    function submitEnglishQuizAnswer() {
      if (!currentQuizData || selectedChoiceIndex < 0) {
        window.TutorUI.showToast('⚠️ 選択肢 (A〜D) を1つ選んでください。', 'amber');
        return;
      }

      const isCorrect = selectedChoiceIndex === currentQuizData.displayCorrectIndex;
      const chosenText = currentQuizData.displayChoices[selectedChoiceIndex];
      const correctText = currentQuizData.displayChoices[currentQuizData.displayCorrectIndex];
      const specificFeedback = currentQuizData.displayFeedback[selectedChoiceIndex] || '';

      const box = document.getElementById('quizResultBox');
      const bgClass = isCorrect
        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-100'
        : 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-100';

      box.className = `rounded-2xl p-4 space-y-3 border ${bgClass}`;
      box.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${isCorrect ? '🎉 ⭕' : '💡 ❌'}</span>
            <span class="font-black text-sm sm:text-base">${isCorrect ? '正解！素晴らしいです！' : '惜しい！解説を確認しましょう'}</span>
          </div>
          <span class="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60">あなたの回答: ${escapeHtml(chosenText)}</span>
        </div>

        <div class="p-3 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-current/15 text-xs sm:text-sm space-y-1.5">
          <div class="font-bold">【選んだ選択肢の解説】</div>
          <p>${escapeHtml(specificFeedback || currentQuizData.explanation)}</p>
          ${currentQuizData.explanation && specificFeedback !== currentQuizData.explanation ? `<p class="text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700">${escapeHtml(currentQuizData.explanation)}</p>` : ''}
        </div>

        <div class="p-3 rounded-xl ${isCorrect ? 'bg-emerald-100/70 dark:bg-emerald-900/40' : 'bg-amber-100/70 dark:bg-amber-900/40'} text-xs sm:text-sm font-bold flex items-center justify-between">
          <span>🎯 正解： <span class="font-serif text-base underline ml-1">${escapeHtml(correctText)}</span></span>
          <button onclick="speakQuizFullSentence('${escapeJsString(correctText)}')" class="text-xs bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg shadow-sm">🔊 正解の英文を聞く</button>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button onclick="saveQuizRecordToHistory(${isCorrect})" class="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">
            📁 この問題をマイノートに保存
          </button>
          <button onclick="addWordDirect('${escapeJsString(correctText)}', '${escapeJsString(currentQuizData.translationJa)}', '${escapeJsString(currentQuizData.questionEn)}')"
            class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">
            🔤 正解表現を単語帳に登録
          </button>
          <button onclick="generateEnglishQuiz(false)" class="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition ml-auto">
            🎲 次の問題へ
          </button>
        </div>
      `;
      box.classList.remove('hidden');

      // 正解の英文を読み上げ
      speakQuizFullSentence(correctText);
    }

    function speakQuizQuestion() {
      if (!currentQuizData) return;
      const text = currentQuizData.questionEn.replace(/\(\s*\)|_{2,}/g, ' blank ');
      speakEnglishText(text);
    }

    function speakQuizFullSentence(correctChoice) {
      if (!currentQuizData) return;
      const filled = currentQuizData.questionEn.replace(/\(\s*\)|（\s*）|_{2,}/, ` ${correctChoice} `);
      speakEnglishText(filled);
    }

