    function toggleQuizHint() {
      const content = document.getElementById('quizHintContent');
      const icon = document.getElementById('quizHintIcon');
      const isHidden = content.classList.toggle('hidden');
      icon.textContent = isHidden ? '▼' : '▲';
    }

    function closeQuizSection() {
      const quizSec = document.getElementById('quizSection');
      if (quizSec) quizSec.classList.add('hidden');
    }

    // 3. 生徒の答えを採点（② 1次判定はローカルJS正規化でAPI消費0、不一致時のみAI精密採点）
    async function submitStudentAnswer() {
      if (!currentQuizData) return;
      const inputEl = document.getElementById('studentAnswerInput');
      const studentAns = (inputEl.value || '').trim();

      if (!studentAns) {
        showStatus('⚠️ 答えを入力してから「採点する」を押してください。', 'amber');
        inputEl.focus();
        return;
      }

      // ② 1次ローカルJS正規化判定（空白・全角半角・不等号・因数順序を吸収して即時正解判定）
      const correctChoiceText = (currentQuizData.displayChoices && currentQuizData.displayCorrectIndex >= 0)
        ? currentQuizData.displayChoices[currentQuizData.displayCorrectIndex]
        : '';
      const referenceCandidates = [
        currentQuizData.answer,
        correctChoiceText,
        ...(Array.isArray(currentQuizData.acceptedAnswers) ? currentQuizData.acceptedAnswers : [])
      ].filter(Boolean);

      if (window.TutorCore && window.TutorCore.isLocalMathMatch(studentAns, referenceCandidates)) {
        const localJudge = {
          is_correct: true,
          judgement_title: '正解！素晴らしい！（⚡即時判定）',
          comment: currentQuizData.explanation || '素晴らしい！自分の力で正確に答えを導き出せましたね。',
          correct_answer: currentQuizData.answer || correctChoiceText,
          speech_ja: currentQuizData.speechCorrect || '大正解です！自分の力でしっかり解けましたね。素晴らしいです。'
        };
        renderQuizResult(localJudge, studentAns);
        return;
      }

      const geminiKey = safeStorage.getItem('gemini_api_key');
      const selectedModel = safeStorage.getItem('custom_model_id') || document.getElementById('modelSelect').value;

      if (!geminiKey) {
        openSettings();
        showStatus('🔑 先に「⚙️ 設定」からGemini APIキーを登録してください。', 'amber');
        return;
      }

      const btn = document.getElementById('submitAnswerBtn');
      const btnText = document.getElementById('submitAnswerBtnText');
      const btnSpinner = document.getElementById('submitAnswerBtnSpinner');

      if (btn) {
        btn.disabled = true;
        if (btnText) btnText.classList.add('hidden');
        if (btnSpinner) btnSpinner.classList.remove('hidden');
      }

      const JUDGE_SCHEMA = {
        type: 'OBJECT',
        properties: {
          is_correct: { type: 'BOOLEAN' },
          judgement_title: { type: 'STRING' },
          comment: { type: 'STRING' },
          correct_answer: { type: 'STRING' },
          speech_ja: { type: 'STRING' }
        },
        required: ['is_correct', 'judgement_title', 'comment', 'correct_answer', 'speech_ja']
      };

      const prompt = `あなたは高校数学の採点担当プロ講師です。生徒が解いた答えを厳密かつ優しく採点してください。
【出題された問題】
${currentQuizData.problem}

【基準正解】
${currentQuizData.answer}

【生徒が入力した答え】
${studentAns}

【採点ルール】
- 数学的に同値であれば、表記方法の些細な違い（空白の有無、全角半角、<= と ≦、(x+1)(x+2) と (x+2)(x+1) など）はすべて「正解(is_correct: true)」にしてください。
- 正解の場合は、生徒を褒めるあたたかいコメント（1〜2文）と短い音声台本を作成してください。
- 不正解の場合は、いきなり答えを全部バラすのではなく、生徒がどこでつまずいたのか（符号ミス、不等号の向き、計算ミスなど）の「気づきのヒント」をやさしく説明してください。
- 数式は必ずLaTeX形式（$ ... $）で記述し、バックスラッシュは2重エスケープ（\\\\leqq, \\\\ge）してください。`;

      try {
        const judge = await callGeminiModel(selectedModel, geminiKey, prompt, null, {
          schema: JUDGE_SCHEMA,
          temperature: 0.2,
          timeoutMs: 25000
        });

        renderQuizResult(judge, studentAns);
      } catch (err) {
        if (isQuotaError(err)) {
          showQuotaError(selectedModel);
        } else {
          showStatus(`❌ 採点エラー: ${escapeHtml(err.message)}`, 'red');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          if (btnText) btnText.classList.remove('hidden');
          if (btnSpinner) btnSpinner.classList.add('hidden');
        }
      }
    }

    function renderQuizResult(judge, studentAns) {
      const box = document.getElementById('quizResultBox');
      if (!box) return;

      const isCorrect = Boolean(judge.is_correct);
      const bgClass = isCorrect
        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100'
        : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100';

      box.className = `rounded-xl p-4 space-y-3 border shadow-sm ${bgClass}`;

      const correctAnsText = formatChoiceMath(judge.correct_answer || currentQuizData?.answer || '');

      box.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${isCorrect ? '🎉 ⭕' : '💡 ❌'}</span>
            <span class="font-bold text-base sm:text-lg">${escapeHtml(judge.judgement_title || (isCorrect ? '正解！素晴らしい！' : '惜しい！もう一歩です'))}</span>
          </div>
        </div>

        <div class="text-xs sm:text-sm leading-relaxed p-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-current/20">
          <div class="font-bold mb-1">【先生からの講評】</div>
          <div id="quizJudgeComment"></div>
        </div>

        ${correctAnsText ? `
        <div class="text-xs sm:text-sm p-3 rounded-lg ${isCorrect ? 'bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-950 dark:text-emerald-100 border border-emerald-300/60 dark:border-emerald-700/60' : 'bg-amber-100/70 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 border border-amber-300/60 dark:border-amber-700/60'}">
          <span class="font-bold">🎯 正解・模範解答：</span>
          <span id="quizCorrectAnswer" class="font-bold ml-1"></span>
        </div>
        ` : ''}

        <div class="flex flex-wrap items-center gap-2 pt-1">
          ${isCorrect ? `
          <button onclick="saveQuizToHistory()" class="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition flex items-center gap-1.5">
            📁 この成果をマイノートに記録
          </button>
          ` : `
          <button onclick="document.getElementById('studentAnswerInput').focus()" class="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">
            ✏️ もう一度解き直す
          </button>
          <button onclick="showQuizFullSolution()" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">
            📖 完全なステップ解説を見る
          </button>
          `}
        </div>
      `;

      box.classList.remove('hidden');

      const commentEl = document.getElementById('quizJudgeComment');
      if (commentEl) {
        commentEl.textContent = sanitizeMathString(judge.comment || '');
        renderMathIn(commentEl);
      }

      const correctAnsEl = document.getElementById('quizCorrectAnswer');
      if (correctAnsEl) {
        correctAnsEl.textContent = correctAnsText;
        renderMathIn(correctAnsEl);
      }

      if (judge.speech_ja) {
        speakJapanese(judge.speech_ja);
      }
    }

    function showQuizFullSolution() {
      if (!currentQuizData || !currentQuizData.problem) return;
      const questionInput = document.getElementById('questionInput');
      if (questionInput) {
        questionInput.value = currentQuizData.problem;
      }
      clearImage();
      closeQuizSection();
      solveProblem();
    }

    function saveQuizToHistory() {
      if (!currentQuizData) return;
      const unitHint = document.getElementById('unitSelect').value;
      const studentAnsText = quizInputMode === 'choice' && currentQuizData.displayChoices && selectedChoiceIndex >= 0
        ? currentQuizData.displayChoices[selectedChoiceIndex]
        : (document.getElementById('studentAnswerInput')?.value || '');

      const data = {
        unitHint: unitHint,
        problem_label: '類題チャレンジ (正解)',
        recognized_problem: currentQuizData.problem,
        key_point: currentQuizData.hint,
        steps: [
          {
            step_number: 1,
            title: '類題チャレンジ 正解達成',
            focus: '自力で解法を導き出しました！',
            why: '学んだ考え方を数字が変わった類題に正しく応用できました。',
            display_math: `生徒の解答: ${studentAnsText}\n正解: ${currentQuizData.answer}`,
            watch_out: '',
            speech_ja: '類題チャレンジ、見事に正解できましたね！素晴らしいです。'
          }
        ],
        final_answer: currentQuizData.answer,
        overall_chat: []
      };
      const savedId = saveTutorHistory(data, { attachChat: false });
      if (savedId) {
        showStatus('✅ 類題チャレンジの正解記録をマイノートに保存しました！', 'blue');
      } else {
        showStatus('⚠️ 保存容量が不足しているため、マイノートに保存できませんでした。', 'amber');
      }
    }

    // アップロード進行バー制御
    function setUploadProgress(percent, text) {
      const progress = document.getElementById('uploadProgress');
      const fill = document.getElementById('uploadProgressFill');
      const status = document.getElementById('uploadStatusText');
      const pct = document.getElementById('uploadPercent');

      if (percent <= 0 && progress) {
        progress.classList.add('hidden');
        return;
      }
      if (progress) progress.classList.remove('hidden');
      if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      if (status && text) status.textContent = text;
      if (pct) pct.textContent = `${Math.round(percent)}%`;
    }

    // セクション表示（フェードアニメーション）
    function showSectionWithFade(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('opacity-0', 'translate-y-4', 'section-fade');
      el.classList.remove('hidden', 'hidden-section');
      requestAnimationFrame(() => {
        el.classList.add('opacity-100', 'translate-y-0');
        el.classList.remove('opacity-0', 'translate-y-4');
      });
    }
