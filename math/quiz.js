
    // =========================================================================
    // 8. 4択クイズ (Choice Quiz) & 直接入力切替・記号パレット
    // =========================================================================
    function setQuizInputMode(mode, { persist = true } = {}) {
      quizInputMode = mode;
      if (persist) {
        safeStorage.setItem('quiz_input_mode', mode);
      }

      const choiceBtn = document.getElementById('quizModeChoiceBtn');
      const textBtn = document.getElementById('quizModeTextBtn');
      const choiceContainer = document.getElementById('quizChoiceContainer');
      const textContainer = document.getElementById('quizDirectInputContainer');

      if (mode === 'choice') {
        if (choiceBtn) {
          choiceBtn.className = 'px-3 py-1.5 rounded-lg transition bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm font-bold';
        }
        if (textBtn) {
          textBtn.className = 'px-3 py-1.5 rounded-lg transition text-slate-600 dark:text-slate-400 font-normal';
        }
        if (choiceContainer) choiceContainer.classList.remove('hidden');
        if (textContainer) textContainer.classList.add('hidden');
      } else {
        if (choiceBtn) {
          choiceBtn.className = 'px-3 py-1.5 rounded-lg transition text-slate-600 dark:text-slate-400 font-normal';
        }
        if (textBtn) {
          textBtn.className = 'px-3 py-1.5 rounded-lg transition bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm font-bold';
        }
        if (choiceContainer) choiceContainer.classList.add('hidden');
        if (textContainer) textContainer.classList.remove('hidden');
        const inputEl = document.getElementById('studentAnswerInput');
        if (inputEl) inputEl.focus();
      }
    }

    function insertMathSymbol(sym) {
      const inputEl = document.getElementById('studentAnswerInput');
      if (!inputEl) return;
      const start = inputEl.selectionStart || 0;
      const end = inputEl.selectionEnd || 0;
      const text = inputEl.value;
      inputEl.value = text.slice(0, start) + sym + text.slice(end);
      inputEl.focus();
      const nextPos = start + sym.length;
      inputEl.setSelectionRange(nextPos, nextPos);
    }

    function shuffleChoices(choices, correctIndex, choiceFeedback = []) {
      const indexed = choices.map((c, i) => ({
        text: c,
        feedback: Array.isArray(choiceFeedback) ? (choiceFeedback[i] || '') : '',
        isCorrect: i === correctIndex
      }));
      for (let i = indexed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
      }
      return {
        shuffled: indexed.map(item => item.text),
        shuffledFeedback: indexed.map(item => item.feedback),
        newCorrectIndex: indexed.findIndex(item => item.isCorrect)
      };
    }

    function formatChoiceMath(text) {
      if (!text) return '';
      let str = sanitizeMathString(text).trim();
      // 多桁の指数（x^10など）を正規化
      str = str.replace(/\^([0-9a-zA-Z]{2,})/g, '^{$1}');
      if (str.includes('$') || str.includes('\\(')) {
        return str;
      }
      // 指数(^)、添字(_)、LaTeXコマンド(\)、不等号(≦, ≧)、根号(√)、または数式英字を含む場合は自動で $...$ で囲む
      if (/[\^\\_\u2264\u2265\u221a\u2266\u2267]/.test(str) || (/^[0-9a-zA-Z\s\+\-\*\/\(\)\=,\.±]+$/.test(str) && /[a-zA-Z]/.test(str))) {
        return `$${str}$`;
      }
      return str;
    }

    function renderQuizChoiceButtons() {
      const grid = document.getElementById('quizChoiceGrid');
      if (!grid || !currentQuizData || !currentQuizData.displayChoices) return;

      const labels = ['ア', 'イ', 'ウ', 'エ'];
      grid.innerHTML = currentQuizData.displayChoices.map((choiceText, idx) => {
        const isSelected = selectedChoiceIndex === idx;
        const selectedClass = isSelected
          ? 'selected border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100 ring-2 ring-emerald-500'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60';

        return `
          <button type="button" role="radio" aria-checked="${isSelected}" data-action="select-choice" data-idx="${idx}"
            class="choice-btn ${selectedClass} border-2 rounded-xl p-3 text-left flex items-start gap-2.5 transition">
            <span class="shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 font-bold text-xs flex items-center justify-center">${labels[idx]}</span>
            <span id="quiz-choice-text-${idx}" class="text-sm font-medium leading-relaxed min-w-0 flex-1 break-words"></span>
            ${isSelected ? '<span class="text-emerald-600 font-bold ml-auto">✓</span>' : ''}
          </button>
        `;
      }).join('');

      currentQuizData.displayChoices.forEach((choiceText, idx) => {
        const el = document.getElementById(`quiz-choice-text-${idx}`);
        if (el) {
          el.textContent = formatChoiceMath(choiceText);
          renderMathIn(el);
        }
      });
    }

    function selectQuizChoice(idx) {
      selectedChoiceIndex = idx;
      renderQuizChoiceButtons();
    }

    // 4択ローカル即時採点（通信なし・待ち時間0秒）
    function submitChoiceAnswer() {
      if (!currentQuizData || selectedChoiceIndex < 0) {
        showStatus('⚠️ 選択肢を1つ選んでから決定ボタンを押してください。', 'amber');
        return;
      }

      const isCorrect = selectedChoiceIndex === currentQuizData.displayCorrectIndex;
      const chosenText = currentQuizData.displayChoices[selectedChoiceIndex];
      const correctText = currentQuizData.displayChoices[currentQuizData.displayCorrectIndex];
      const feedback = (currentQuizData.choiceFeedback && currentQuizData.choiceFeedback[selectedChoiceIndex]) || '';

      const comment = isCorrect
        ? (currentQuizData.explanation || '素晴らしい！正しく解法を理解できています。')
        : (feedback || currentQuizData.wrongHint || '惜しい！もう一度計算や符号を確認してみましょう。');

      const judge = {
        is_correct: isCorrect,
        judgement_title: isCorrect ? '正解！素晴らしい！' : '惜しい！もう一歩です',
        comment: comment,
        correct_answer: correctText,
        speech_ja: isCorrect
          ? (currentQuizData.speechCorrect || '正解です！素晴らしいですね。')
          : (currentQuizData.speechWrong || '惜しいです。ヒントを見て再挑戦してみましょう。')
      };

      renderQuizResult(judge, chosenText);
    }

    // 2. 自分で解く「類題チャレンジ」出題（ワンショット事前取得データがあればAPI消費0で即時出題）
    function isValidQuizObject(q) {
      if (!q || !Array.isArray(q.choices) || q.choices.length !== 4) return false;
      const cleaned = q.choices.map(c => sanitizeMathString(c).trim());
      if (cleaned.some(c => !c)) return false;
      if (new Set(cleaned).size !== 4) return false;
      if (typeof q.correct_index !== 'number' || !Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) return false;
      return true;
    }

    function applyAndRenderQuizData(quizRes) {
      const valid = isValidQuizObject(quizRes);
      const rawChoices = valid ? quizRes.choices.map(c => formatChoiceMath(c)) : [];
      const correctIdx = valid ? quizRes.correct_index : 0;
      const rawFeedback = (valid && Array.isArray(quizRes.choice_feedback))
        ? quizRes.choice_feedback.map(f => sanitizeMathString(f))
        : [];
      const acceptedAnswers = Array.isArray(quizRes?.accepted_answers)
        ? quizRes.accepted_answers.map(a => sanitizeMathString(a).trim()).filter(Boolean)
        : [];

      if (!valid) {
        currentQuizData = {
          problem: sanitizeMathString(quizRes?.problem || '類題の生成に失敗しました。もう一度お試しください。'),
          answer: formatChoiceMath(quizRes?.answer || ''),
          acceptedAnswers: acceptedAnswers,
          hint: sanitizeMathString(quizRes?.hint || ''),
          explanation: sanitizeMathString(quizRes?.explanation || ''),
          wrongHint: sanitizeMathString(quizRes?.wrong_hint || ''),
          choiceFeedback: [],
          speechCorrect: quizRes?.speech_ja_correct || '正解です！素晴らしい！',
          speechWrong: quizRes?.speech_ja_wrong || '惜しい！もう一歩です。',
          rawChoices: [],
          displayChoices: [],
          displayCorrectIndex: -1
        };
        setQuizInputMode('text', { persist: false });
      } else {
        const shuffledData = shuffleChoices(rawChoices, correctIdx, rawFeedback);
        currentQuizData = {
          problem: sanitizeMathString(quizRes.problem || ''),
          answer: formatChoiceMath(quizRes.answer || ''),
          acceptedAnswers: acceptedAnswers,
          hint: sanitizeMathString(quizRes.hint || ''),
          explanation: sanitizeMathString(quizRes.explanation || ''),
          wrongHint: sanitizeMathString(quizRes.wrong_hint || ''),
          choiceFeedback: shuffledData.shuffledFeedback,
          speechCorrect: quizRes.speech_ja_correct || '正解です！素晴らしい！',
          speechWrong: quizRes.speech_ja_wrong || '惜しい！もう一歩です。',
          rawChoices: rawChoices,
          displayChoices: shuffledData.shuffled,
          displayCorrectIndex: shuffledData.newCorrectIndex
        };
        setQuizInputMode(safeStorage.getItem('quiz_input_mode') || 'choice');
      }

      selectedChoiceIndex = -1;

      const probEl = document.getElementById('quizProblemText');
      probEl.textContent = currentQuizData.problem;
      renderMathIn(probEl);

      const hintEl = document.getElementById('quizHintContent');
      hintEl.textContent = currentQuizData.hint;
      renderMathIn(hintEl);
      hintEl.classList.add('hidden');
      document.getElementById('quizHintIcon').textContent = '▼';

      renderQuizChoiceButtons();
      setQuizInputMode(quizInputMode, { persist: false });

      document.getElementById('studentAnswerInput').value = '';
      const resultBox = document.getElementById('quizResultBox');
      resultBox.classList.add('hidden');
      resultBox.innerHTML = '';

      const quizSec = document.getElementById('quizSection');
      quizSec.classList.remove('hidden');
      quizSec.scrollIntoView({ behavior: 'smooth', block: 'start' });

      speakJapanese('では、数字を変えた類題に挑戦してみましょう！4つの選択肢から選ぶか、自分で答えを入力してくださいね。');
    }

    async function startQuizChallenge() {
      const currentProb = currentProblems[currentProblemIndex] || {};

      // ① ワンショット統合済み twin_quiz があれば API呼び出し0回・待ち時間0秒で即時表示！
      if (currentProb.twin_quiz && !currentProb._twinQuizConsumed && isValidQuizObject(currentProb.twin_quiz)) {
        currentProb._twinQuizConsumed = true;
        applyAndRenderQuizData(currentProb.twin_quiz);
        return;
      }

      const btn = document.getElementById('quizChallengeBtn');
      const btnText = document.getElementById('quizChallengeBtnText');
      const btnSpinner = document.getElementById('quizChallengeBtnSpinner');

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

      const unitHint = document.getElementById('unitSelect').value;
      const currentProblem = currentProb.recognized_problem || document.getElementById('recognizedProblem')?.dataset?.rawMath || currentProblemText || '';
      const keyPoint = currentProb.key_point || document.getElementById('keyPoint')?.dataset?.rawMath || '';

      // v1.6 4択クイズ生成スキーマ (choices, correct_index, choice_feedback, accepted_answers)
      const QUIZ_GEN_SCHEMA = {
        type: 'OBJECT',
        properties: {
          problem: { type: 'STRING' },
          choices: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          correct_index: { type: 'INTEGER' },
          answer: { type: 'STRING' },
          accepted_answers: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          hint: { type: 'STRING' },
          explanation: { type: 'STRING' },
          wrong_hint: { type: 'STRING' },
          choice_feedback: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          speech_ja_correct: { type: 'STRING' },
          speech_ja_wrong: { type: 'STRING' }
        },
        required: ['problem', 'choices', 'correct_index', 'answer', 'hint', 'explanation']
      };

      const prompt = `あなたは日本の高校1年生を教えるプロ数学教師です。
生徒が自力で解くための「4択の類題（数字・条件だけを変えた同じ解法パターンの双子問題）」を1問出題してください。
問題文、4つの選択肢(必ず1つが正解、3つがよくある間違い)、正解番号(0〜3)、着眼点のヒント、正解の理由、誤答ごとの違いの理由、および記述式採点用の別表記リスト(accepted_answers)を作成してください。

【元の問題】
${currentProblem}

【単元ヒント】
${unitHint}

【重要ポイント】
${keyPoint}

【4択作成ルール（最重要）】
- 選択肢(choices)は必ず4個（重複禁止、すべて異なる選択肢）。
- 誤答は「符号ミス」「不等号の向き(≦と<)」「定義域の端の取り違え」「計算ミス」など高校生がよくやる間違い。
- correct_index は choices 内の正解のインデックス (0, 1, 2, 3 のいずれか)。
- accepted_answers には、直接入力で正解と認める表記ゆれ（例: "(x+1)(x+2)" と "(x+2)(x+1)"、"x=2,-3" と "2,-3" など）を2〜3個入れてください。
- choice_feedback はそれぞれの選択肢がなぜ違うかを1〜2文で記述（正解の選択肢は「正解」）。
- 数式は必ずLaTeX形式（$...$ または $$...$$）で記述し、バックスラッシュは2重化（\\\\leqq, \\\\ge, \\\\frac）してください。
- 出力は必ず指定のJSONスキーマのみ。`;

      try {
        let quizRes = await callGeminiModel(selectedModel, geminiKey, prompt, null, {
          schema: QUIZ_GEN_SCHEMA,
          temperature: 0.6,
          timeoutMs: 30000
        });

        if (!isValidQuizObject(quizRes)) {
          try {
            quizRes = await callGeminiModel(selectedModel, geminiKey, prompt, null, {
              schema: QUIZ_GEN_SCHEMA,
              temperature: 0.7,
              timeoutMs: 30000
            });
          } catch (retryErr) {}
        }

        applyAndRenderQuizData(quizRes);
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(selectedModel);
        } else {
          showStatus(`❌ 類題出題エラー: ${escapeHtml(err.message)}`, 'red');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          if (btnText) btnText.classList.remove('hidden');
          if (btnSpinner) btnSpinner.classList.add('hidden');
        }
      }
    }

