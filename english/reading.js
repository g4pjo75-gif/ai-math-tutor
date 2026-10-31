    // =========================================================================
    // 5. 写真アップロード & 長文読解・文法解説
    // =========================================================================
    function handleImageUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onerror = () => {
        window.TutorUI.showToast('❌ 画像の読み込みに失敗しました。', 'red');
      };
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => {
          window.TutorUI.showToast('❌ 画像形式を認識できませんでした。', 'red');
        };
        img.onload = () => {
          const maxDim = 1280;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          currentImageBase64 = dataUrl.split(',')[1];

          document.getElementById('uploadPrompt').classList.add('hidden');
          const preview = document.getElementById('imagePreview');
          preview.src = dataUrl;
          preview.classList.remove('hidden');
          document.getElementById('clearImageBtn').classList.remove('hidden');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }

    function clearImage() {
      currentImageBase64 = null;
      document.getElementById('uploadPrompt').classList.remove('hidden');
      const preview = document.getElementById('imagePreview');
      preview.src = '';
      preview.classList.add('hidden');
      document.getElementById('clearImageBtn').classList.add('hidden');
    }

    async function analyzeEnglishProblem() {
      const userText = document.getElementById('questionInput').value.trim();
      if (!currentImageBase64 && !userText) {
        window.TutorUI.showToast('⚠️ 写真を撮影するか、英文・質問を入力してください。', 'amber');
        return;
      }

      const unitHint = document.getElementById('unitSelect').value;

      // ④ 画像・テキストハッシュ（Fingerprint）による重複API呼び出し防止キャッシュ
      const reqFp = window.TutorCore
        ? window.TutorCore.computeRequestHash({
            mode: 'eng_reading',
            unit: unitHint,
            text: userText,
            imageBase64: currentImageBase64
          })
        : null;

      if (reqFp && window.TutorCore && engStore) {
        const cachedData = window.TutorCore.getCachedResponse(engStore, 'api_cache', reqFp);
        if (cachedData) {
          lastLessonData = { ...cachedData, _twinQuizConsumed: false };
          lastPassageEn = cachedData.passage_en || '';
          hideStatus();
          renderEnglishResult(cachedData);
          document.getElementById('resultSection').classList.remove('hidden');
          document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
          window.TutorUI.showToast('⚡ 同じ問題の解説データが保存されていたため、APIを消費せず即座に表示しました！', 'blue');
          return;
        }
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        openSettings();
        window.TutorUI.showToast('🔑 先に設定からGemini APIキーを入力してください。', 'amber');
        return;
      }

      const modelId = getActiveModel();
      const solveBtn = document.getElementById('solveBtn');
      const solveBtnText = document.getElementById('solveBtnText');

      solveBtn.disabled = true;
      solveBtnText.textContent = '⏳ AI英語先生が解析中…';
      showStatus(`⏳ AI英語先生（${modelId}）が英文・構文・重要単語を解析しています…（最大25秒）`, 'blue');

      const prompt = `あなたは日本の高校1年生に英語を教える親切で優秀なAI家庭教師です。
添付された画像または入力テキストを解析し、以下のJSONスキーマに従って分かりやすく解説してください。
【単元ヒント】: ${unitHint}
【指導ルール】:
- passage_en には英語の本文のみを正確に書き起こしてください（日本語を混ぜない）。
- sentence_breakdown には1文ずつの英文(en)、和訳(ja)、SVOCや修飾関係のポイント(structure_note)を入れてください。
- vocabulary には高校生が覚えるべき重要英単語・熟語を4〜8個選び、意味と短い英語例文を入れてください。
- grammar_points には本文に含まれる重要な文法・構文の解説を入れてください。
- twin_quiz には本文の重要表現または文法事項を使った4択の類題（choicesは必ず4個すべて異なる英語の選択肢、correct_indexは0〜3）を1問作成してください。`;

      try {
        const data = await window.TutorCore.callGeminiModel({
          modelId,
          apiKey,
          promptText: `${prompt}\n\n【生徒の入力・質問】: ${userText || '画像の問題・英文を解説してください'}`,
          imageBase64: currentImageBase64,
          schema: ENGLISH_READING_SCHEMA,
          temperature: 0.35,
          timeoutMs: 35000
        });

        lastLessonData = { ...data, _twinQuizConsumed: false };
        lastPassageEn = data.passage_en || '';
        if (reqFp && window.TutorCore && engStore) {
          window.TutorCore.setCachedResponse(engStore, 'api_cache', reqFp, data, 15);
        }
        hideStatus();

        renderEnglishResult(data);
        document.getElementById('resultSection').classList.remove('hidden');
        document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.TutorUI.showToast('✨ 英語の解説が完成しました！', 'green');
      } catch (err) {
        console.error(err);
        showStatus(`❌ エラーが発生しました: ${err.message || '通信エラー'}`, 'red');
      } finally {
        solveBtn.disabled = false;
        solveBtnText.textContent = 'AI先生に英語を解説してもらう';
      }
    }

    function renderEnglishResult(data) {
      const container = document.getElementById('resultContent');
      if (!container) return;

      const breakdownHtml = Array.isArray(data.sentence_breakdown) && data.sentence_breakdown.length > 0
        ? `
        <div class="space-y-2.5">
          <div class="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <span>🔍</span>
            <span>1文ごとの構文・スラッシュ解説 (Sentence Breakdown)</span>
          </div>
          <div class="space-y-2 sentence-breakdown-list">
            ${data.sentence_breakdown.map((item, idx) => `
              <div class="breakdown-item p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                  <p class="font-serif font-bold text-slate-900 dark:text-white text-xs sm:text-sm"><span class="text-blue-600 dark:text-blue-400 mr-1">(${idx + 1})</span>${escapeHtml(item.en)}</p>
                  <button data-action="speak-en" data-text="${escapeAttr(item.en)}" class="shrink-0 text-[11px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-lg font-bold">🔊</button>
                </div>
                <p class="text-xs text-slate-700 dark:text-slate-300">${escapeHtml(item.ja)}</p>
                ${item.structure_note ? `<p class="text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg">💡 ${escapeHtml(item.structure_note)}</p>` : ''}
              </div>
            `).join('')}
          </div>
        </div>`
        : '';

      const vocabItems = Array.isArray(data.vocabulary) ? data.vocabulary : [];
      const vocabHtml = vocabItems.length > 0
        ? `
        <div class="space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>🔤</span>
              <span>重要英単語・イディオム (${vocabItems.length}語)</span>
            </div>
            <button data-action="save-all-words" class="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1 rounded-xl shadow-sm transition">
              ＋ すべての単語をマイ単語帳に一括登録
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${vocabItems.map((v, i) => `
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2">
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <button data-action="speak-en" data-text="${escapeAttr(v.word)}" class="font-bold text-blue-700 dark:text-blue-400 text-sm hover:underline flex items-center gap-1 text-left">
                      <span>🔊</span>
                      <span>${escapeHtml(v.word)}</span>
                    </button>
                    <button data-action="add-word-index" data-idx="${i}" class="text-[11px] bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                      ＋ 単語帳へ
                    </button>
                  </div>
                  <p class="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">${escapeHtml(v.meaning)}</p>
                  ${v.example ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic font-serif">"${escapeHtml(v.example)}"</p>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>`
        : '';

      const grammarItems = Array.isArray(data.grammar_points) ? data.grammar_points : [];
      const grammarHtml = grammarItems.length > 0
        ? `
        <div class="space-y-2.5">
          <div class="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <span>🧩</span>
            <span>重要文法・構文のポイント (Grammar Focus)</span>
          </div>
          <div class="space-y-2">
            ${grammarItems.map(g => `
              <div class="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 space-y-1">
                <div class="font-bold text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                  <span>📌</span>
                  <span>${escapeHtml(g.title)}</span>
                </div>
                <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(g.explanation)}</p>
              </div>
            `).join('')}
          </div>
        </div>`
        : '';

      container.innerHTML = `
        <!-- 英文本文 -->
        <div class="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-blue-900 dark:text-blue-200">📖 英文 (Passage)</span>
            <button data-action="speak-en" data-text="${escapeAttr(data.passage_en || '')}" class="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">🔊 全文読み上げ</button>
          </div>
          <p class="text-sm sm:text-base font-serif leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">${escapeHtml(data.passage_en || '')}</p>
        </div>

        <!-- 日本語全訳 -->
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
          <div class="font-bold text-xs text-slate-800 dark:text-slate-200">🇯🇵 日本語全訳 (Translation)</div>
          <p class="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">${escapeHtml(data.translation_ja || '')}</p>
        </div>

        ${breakdownHtml}
        ${vocabHtml}
        ${grammarHtml}

        ${data.quick_check && data.quick_check.question ? `
        <div class="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
          <div class="font-bold text-xs text-amber-900 dark:text-amber-200">🎯 ワンポイント確認クイズ</div>
          <p class="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-bold">${escapeHtml(data.quick_check.question)}</p>
          <details class="text-xs text-amber-800 dark:text-amber-300 cursor-pointer pt-1">
            <summary class="font-bold">答えを見る</summary>
            <p class="mt-1.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800">${escapeHtml(data.quick_check.answer)}</p>
          </details>
        </div>` : ''}
      `;
    }

