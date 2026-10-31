    // =========================================================================
    // 1. ストレージ・音声エンジンの初期化
    // =========================================================================
    const sharedStore = window.TutorStorage
      ? window.TutorStorage.create({ prefix: 'tutor_', legacyPrefixes: ['amt_'] })
      : null;
    const engStore = window.TutorStorage
      ? window.TutorStorage.create({ prefix: 'aet_', legacyPrefixes: [''] })
      : null;

    // 英語音声 (en-US)
    const englishSpeech = window.TutorSpeech
      ? window.TutorSpeech.create({
          lang: 'en-US',
          defaultRate: 0.95,
          voicePriority: [/samantha|ava|daniel|alex/i, /google us english/i, /natural|online/i]
        })
      : null;

    // 日本語音声 (解説読み上げ補助用 ja-JP)
    const japaneseSpeech = window.TutorSpeech
      ? window.TutorSpeech.create({
          lang: 'ja-JP',
          defaultRate: 1.0,
          voicePriority: [/kyoko|otoya|hattori/i, /natural|online/i, /google/i]
        })
      : null;

    // アプリ状態
    let currentMode = 'reading'; // 'reading' | 'quiz' | 'writing'
    let currentImageBase64 = null;
    let lastLessonData = null;
    let lastPassageEn = '';
    let currentQuizData = null;
    let selectedChoiceIndex = -1;
    let lastWritingData = null;

    let wordbookList = []; // { id, word, meaning, example, memorized, savedAt }
    let englishHistory = []; // { id, type, title, summary, payload, savedAt }
    let currentHistoryTab = 'wordbook'; // 'wordbook' | 'notes'

    // =========================================================================
    // 2. Gemini 構造化出力スキーマ定義
    // =========================================================================
    const ENGLISH_READING_SCHEMA = {
      type: 'OBJECT',
      properties: {
        passage_en: { type: 'STRING', description: '認識された英文全文または問題文' },
        translation_ja: { type: 'STRING', description: '自然で分かりやすい日本語全訳' },
        sentence_breakdown: {
          type: 'ARRAY',
          description: '1文ごとの構文(SVOC)・スラッシュリーディング解説',
          items: {
            type: 'OBJECT',
            properties: {
              en: { type: 'STRING' },
              ja: { type: 'STRING' },
              structure_note: { type: 'STRING' }
            },
            required: ['en', 'ja']
          }
        },
        vocabulary: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              word: { type: 'STRING' },
              meaning: { type: 'STRING' },
              example: { type: 'STRING' }
            },
            required: ['word', 'meaning']
          }
        },
        grammar_points: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              explanation: { type: 'STRING' }
            },
            required: ['title', 'explanation']
          }
        },
        quick_check: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            answer: { type: 'STRING' }
          }
        },
        twin_quiz: {
          type: 'OBJECT',
          description: '本文の文法・語彙を確認する4択の類題（ワンショット事前生成）',
          properties: {
            target_point: { type: 'STRING' },
            question_en: { type: 'STRING' },
            translation_ja: { type: 'STRING' },
            hint: { type: 'STRING' },
            choices: { type: 'ARRAY', items: { type: 'STRING' } },
            correct_index: { type: 'INTEGER' },
            choice_feedback: { type: 'ARRAY', items: { type: 'STRING' } },
            explanation: { type: 'STRING' }
          },
          required: ['question_en', 'translation_ja', 'choices', 'correct_index', 'choice_feedback', 'explanation']
        }
      },
      required: ['passage_en', 'translation_ja', 'twin_quiz']
    };

    const ENGLISH_QUIZ_SCHEMA = {
      type: 'OBJECT',
      properties: {
        target_point: { type: 'STRING', description: '出題単元・文法ポイント名' },
        question_en: { type: 'STRING', description: '英語の4択問題文（空所補充など）' },
        translation_ja: { type: 'STRING', description: '問題文の日本語訳' },
        hint: { type: 'STRING', description: '解くための着眼点ヒント（答えは言わない）' },
        choices: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '必ず4つの異なる選択肢'
        },
        correct_index: { type: 'INTEGER', description: '正解のインデックス (0〜3)' },
        choice_feedback: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '各選択肢(0〜3)がなぜ正解/不正解なのかの解説'
        },
        explanation: { type: 'STRING', description: '全体のまとめ解説' }
      },
      required: ['question_en', 'translation_ja', 'choices', 'correct_index', 'choice_feedback', 'explanation']
    };

    const WRITING_CORRECTION_SCHEMA = {
      type: 'OBJECT',
      properties: {
        score: { type: 'INTEGER', description: '100点満点の評価スコア' },
        original_text: { type: 'STRING', description: '生徒が入力した元の英文' },
        corrected_text: { type: 'STRING', description: '文法・語法を正しく直した自然な英文' },
        natural_alternative: { type: 'STRING', description: 'さらにネイティブらしい別表現' },
        translation_ja: { type: 'STRING', description: '添削後の英文の日本語訳' },
        grammar_fixes: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              before: { type: 'STRING' },
              after: { type: 'STRING' },
              reason_ja: { type: 'STRING' }
            },
            required: ['before', 'after', 'reason_ja']
          }
        },
        praise_and_advice: { type: 'STRING', description: '生徒を褒めつつ伸ばす温かいアドバイス' }
      },
      required: ['score', 'corrected_text', 'grammar_fixes', 'praise_and_advice']
    };

    // =========================================================================
    // 3. 初期化 & 共通設定
    // =========================================================================
    window.addEventListener('DOMContentLoaded', () => {
      if (window.TutorUI) {
        window.TutorUI.initDarkMode({ storage: sharedStore, key: 'dark_mode' });
        window.TutorUI.initTheme({ storage: sharedStore, key: 'ui_theme' });
        window.TutorUI.updateSafeArea();
        window.TutorUI.bindBackdropClose('settingsModal', 'settingsModalContent');
        window.TutorUI.bindBackdropClose('historyModal', 'historyModalContent');
      }

      // セッションでPIN解錠済みならスキップ
      if (sessionStorage.getItem('aet_unlocked') === '1') {
        document.getElementById('pinModal').style.display = 'none';
      }

      // モデル選択の復元
      initModelDropdown();

      // 音声速度復元
      const savedRate = engStore ? engStore.getItem('speech_rate') : null;
      if (savedRate && document.getElementById('speechRateSelect')) {
        document.getElementById('speechRateSelect').value = savedRate;
      }

      // 単語帳と履歴の読み込み
      loadWordbookAndHistory();
      checkApiKeyBanner();

      // Service Worker 登録
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('./sw.js').catch((e) => {
          console.warn('English SW registration error:', e);
        });
      }
    });

    function initModelDropdown() {
      const selectEl = document.getElementById('modelSelect');
      if (!selectEl) return;
      const customModel = (engStore && engStore.getItem('custom_model_id')) || (sharedStore && sharedStore.getItem('custom_model_id')) || '';
      selectEl.innerHTML = '<option value="gemini-3.8-flash" selected>gemini-3.8-flash (標準・高速)</option>';
      if (customModel && customModel !== 'gemini-3.8-flash') {
        const opt = document.createElement('option');
        opt.value = customModel;
        opt.textContent = `${customModel} (カスタム)`;
        selectEl.prepend(opt);
        selectEl.value = customModel;
      }
    }

    function onModelChange() {
      const val = document.getElementById('modelSelect').value;
      if (engStore) engStore.setItem('selected_model', val);
    }

    function getActiveModel() {
      const custom = (engStore && engStore.getItem('custom_model_id')) || '';
      if (custom) return custom;
      return document.getElementById('modelSelect')?.value || 'gemini-3.8-flash';
    }

    function getApiKey() {
      return (sharedStore && sharedStore.getItem('gemini_api_key')) || '';
    }

    function checkApiKeyBanner() {
      const banner = document.getElementById('apiWarningBanner');
      if (!banner) return;
      if (!getApiKey()) banner.classList.remove('hidden');
      else banner.classList.add('hidden');
    }

    function unlockApp() {
      const input = document.getElementById('pinInput').value.trim();
      const savedPin = (sharedStore ? (sharedStore.getItem('app_pin') || sharedStore.getItem('pin')) : null) || '1234';
      if (input === savedPin) {
        document.getElementById('pinModal').style.display = 'none';
        sessionStorage.setItem('aet_unlocked', '1');
      } else {
        document.getElementById('pinError').classList.remove('hidden');
      }
    }

    function toggleDarkMode() {
      if (window.TutorUI) {
        window.TutorUI.toggleDarkMode({ storage: sharedStore, key: 'dark_mode' });
      }
    }

    function changeTheme(theme) {
      if (window.TutorUI && typeof window.TutorUI.applyTheme === 'function') {
        window.TutorUI.applyTheme(theme, { storage: sharedStore, key: 'ui_theme' });
      }
    }

    function openSettings() {
      document.getElementById('geminiKeyInput').value = getApiKey();
      document.getElementById('customModelInput').value = (engStore && engStore.getItem('custom_model_id')) || '';
      document.getElementById('newPinInput').value = (sharedStore && (sharedStore.getItem('app_pin') || sharedStore.getItem('pin'))) || '1234';
      window.TutorUI.openModal('settingsModal');
    }

    function closeSettings() {
      window.TutorUI.closeModal('settingsModal');
    }

    function saveSettings() {
      const key = document.getElementById('geminiKeyInput').value.trim();
      const customModel = document.getElementById('customModelInput').value.trim();
      const pin = document.getElementById('newPinInput').value.trim() || '1234';
      const rate = document.getElementById('speechRateSelect').value;

      if (sharedStore) {
        sharedStore.setItem('gemini_api_key', key);
        sharedStore.setItem('app_pin', pin);
        sharedStore.setItem('pin', pin);
      }
      if (engStore) {
        engStore.setItem('custom_model_id', customModel);
        engStore.setItem('speech_rate', rate);
      }

      initModelDropdown();
      checkApiKeyBanner();
      closeSettings();
      window.TutorUI.showToast('✅ 設定を保存しました。', 'green');
    }

    // =========================================================================
    // 4. モード切替 (長文読解 / 4択クイズ / 英作文添削)
    // =========================================================================
    function switchMode(mode) {
      currentMode = mode;
      stopAllSpeech();
      hideStatus();

      // P3-1: 他モードへの切り替え時は前回のクイズ状態をクリアし、誤提出・不整合を防止
      if (mode !== 'quiz' && currentQuizData) {
        currentQuizData = null;
        selectedChoiceIndex = -1;
        const emptyState = document.getElementById('quizEmptyState');
        const activeContainer = document.getElementById('quizActiveContainer');
        const resultBox = document.getElementById('quizResultBox');
        if (emptyState) emptyState.classList.remove('hidden');
        if (activeContainer) activeContainer.classList.add('hidden');
        if (resultBox) {
          resultBox.classList.add('hidden');
          resultBox.innerHTML = '';
        }
      }

      const panels = {
        reading: document.getElementById('panelReading'),
        quiz: document.getElementById('panelQuiz'),
        writing: document.getElementById('panelWriting')
      };

      Object.keys(panels).forEach((k) => {
        if (panels[k]) {
          if (k === mode) panels[k].classList.remove('hidden');
          else panels[k].classList.add('hidden');
        }
      });

      ['reading', 'quiz', 'writing'].forEach((m) => {
        const btn = document.getElementById(`modeBtn-${m}`);
        if (!btn) return;
        if (m === mode) {
          btn.className = 'mode-btn bg-blue-600 text-white p-3 rounded-2xl text-left shadow-sm transition border-2 border-blue-600';
        } else {
          btn.className = 'mode-btn bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 p-3 rounded-2xl text-left shadow-sm transition border-2 border-slate-200 dark:border-slate-800';
        }
      });
    }

    function showStatus(msg, color = 'blue') {
      const box = document.getElementById('statusBox');
      if (!box) return;
      const styles = {
        blue: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-100',
        amber: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-100',
        red: 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-100'
      };
      box.className = `rounded-2xl p-4 text-xs sm:text-sm font-bold border transition ${styles[color] || styles.blue}`;
      box.textContent = msg;
      box.classList.remove('hidden');
    }

    function hideStatus() {
      const box = document.getElementById('statusBox');
      if (box) box.classList.add('hidden');
    }

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
                  <button onclick="speakEnglishText('${escapeJsString(item.en)}')" class="shrink-0 text-[11px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-lg font-bold">🔊</button>
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
            <button onclick="saveAllLessonWords()" class="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1 rounded-xl shadow-sm transition">
              ＋ すべての単語をマイ単語帳に一括登録
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${vocabItems.map((v, i) => `
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2">
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <button onclick="speakEnglishText('${escapeJsString(v.word)}')" class="font-bold text-blue-700 dark:text-blue-400 text-sm hover:underline flex items-center gap-1 text-left">
                      <span>🔊</span>
                      <span>${escapeHtml(v.word)}</span>
                    </button>
                    <button onclick="addWordToWordbook(${i})" class="text-[11px] bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
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
            <button onclick="speakEnglishText('${escapeJsString(data.passage_en || '')}')" class="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">🔊 全文読み上げ</button>
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

    // =========================================================================
    // 7. 英作文 AI添削モード (Writing Correction Mode)
    // =========================================================================
    function updateWordCount() {
      const text = (document.getElementById('writingStudentInput')?.value || '').trim();
      const words = text ? text.split(/\s+/).length : 0;
      const el = document.getElementById('writingWordCount');
      if (el) el.textContent = `${words} word${words === 1 ? '' : 's'}`;
    }

    async function generateWritingPrompt() {
      const apiKey = getApiKey();
      if (!apiKey) {
        openSettings();
        window.TutorUI.showToast('🔑 先に設定からGemini APIキーを入力してください。', 'amber');
        return;
      }

      const unitHint = document.getElementById('unitSelect').value;
      const modelId = getActiveModel();
      const btn = document.getElementById('genPromptBtn');
      if (btn) btn.disabled = true;

      try {
        const res = await window.TutorCore.callGeminiModel({
          modelId,
          apiKey,
          promptText: `日本の高校1年生が英作文の練習をするための和文課題を1つ作成してください。
【単元テーマ】: ${unitHint}
1行目に課題の日本語文、2行目に「ヒント: 使える英単語2〜3個」のみを簡潔に出力してください。`,
          rawText: true,
          temperature: 0.7,
          timeoutMs: 20000
        });

        const lines = res.split(/\n+/).map(l => l.trim()).filter(Boolean);
        document.getElementById('writingTaskInput').value = (lines[0] || res).replace(/^(課題|和文|問題)[:：]\s*/, '');
        const hintEl = document.getElementById('writingTaskHint');
        if (lines[1] && hintEl) {
          hintEl.textContent = `💡 ${lines.slice(1).join(' / ')}`;
          hintEl.classList.remove('hidden');
        }
        window.TutorUI.showToast('🎲 練習課題を作成しました！英文を書いてみましょう。', 'blue');
      } catch (e) {
        window.TutorUI.showToast('❌ 課題の作成に失敗しました。', 'red');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function submitWritingForCorrection() {
      const studentText = (document.getElementById('writingStudentInput')?.value || '').trim();
      if (!studentText) {
        window.TutorUI.showToast('⚠️ 添削するあなたの英文を入力してください。', 'amber');
        return;
      }

      const taskJa = (document.getElementById('writingTaskInput')?.value || '').trim();
      const unitHint = document.getElementById('unitSelect').value;

      // ④ 同一英作文の重複API呼び出し防止キャッシュ
      const reqFp = window.TutorCore
        ? window.TutorCore.computeRequestHash({
            mode: 'eng_writing',
            unit: `${unitHint}|${taskJa}`,
            text: studentText
          })
        : null;

      if (reqFp && window.TutorCore && engStore) {
        const cachedData = window.TutorCore.getCachedResponse(engStore, 'api_cache', reqFp);
        if (cachedData) {
          lastWritingData = cachedData;
          hideStatus();
          renderWritingCorrection(lastWritingData);
          window.TutorUI.showToast('⚡ 同じ英作文の添削記録が見つかったため、APIを消費せず即座に表示しました！', 'blue');
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
      const btn = document.getElementById('checkWritingBtn');

      if (btn) btn.disabled = true;
      showStatus('⏳ AI英語先生があなたの英作文を丁寧に添削しています…', 'blue');

      const prompt = `あなたは日本の高校生に英作文を指導する優しいAI英語教師です。
生徒が書いた英文を添削し、文法・スペル・語法の修正点と、より自然なネイティブ表現をJSONスキーマで出力してください。
【単元ヒント】: ${unitHint}
【課題の日本語（もしあれば）】: ${taskJa || '自由英作文'}
【生徒の英作文】: ${studentText}`;

      try {
        const data = await window.TutorCore.callGeminiModel({
          modelId,
          apiKey,
          promptText: prompt,
          schema: WRITING_CORRECTION_SCHEMA,
          temperature: 0.35,
          timeoutMs: 30000
        });

        lastWritingData = { ...data, task_ja: taskJa, original_text: data.original_text || studentText };
        if (reqFp && window.TutorCore && engStore) {
          window.TutorCore.setCachedResponse(engStore, 'api_cache', reqFp, lastWritingData, 15);
        }
        hideStatus();
        renderWritingCorrection(lastWritingData);
        window.TutorUI.showToast('✨ 英作文の添削が完了しました！', 'green');
      } catch (err) {
        console.error(err);
        showStatus(`❌ 添削エラー: ${err.message}`, 'red');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function renderWritingCorrection(data) {
      const box = document.getElementById('writingResultSection');
      if (!box) return;

      const fixes = Array.isArray(data.grammar_fixes) ? data.grammar_fixes : [];
      const fixesHtml = fixes.length > 0
        ? fixes.map(f => `
          <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-serif">
              <span class="line-through text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded">${escapeHtml(f.before)}</span>
              <span>➔</span>
              <span class="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">${escapeHtml(f.after)}</span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300">💡 ${escapeHtml(f.reason_ja)}</p>
          </div>
        `).join('')
        : '<p class="text-xs text-emerald-700 dark:text-emerald-300 font-bold">🎉 文法・語法のミスはありません！完璧な英文です！</p>';

      box.innerHTML = `
        <div class="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/70 border-2 border-blue-200 dark:border-blue-900/60 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-700">
            <div class="flex items-center gap-2">
              <span class="text-2xl">🏆</span>
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-400 font-bold">AI添削スコア</div>
                <div class="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">${Number(data.score || 90)} <span class="text-xs font-normal">/ 100点</span></div>
              </div>
            </div>
            <button onclick="saveWritingToHistory()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">
              📁 添削結果をマイノートに保存
            </button>
          </div>

          <!-- Corrected Sentence -->
          <div class="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-900 dark:text-emerald-200">✅ 添削後の正しい英文 (Corrected)</span>
              <button onclick="speakEnglishText('${escapeJsString(data.corrected_text || '')}')" class="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold">🔊 発音を聞く</button>
            </div>
            <p class="text-base sm:text-lg font-serif font-bold text-emerald-950 dark:text-emerald-100">${escapeHtml(data.corrected_text || '')}</p>
            ${data.translation_ja ? `<p class="text-xs text-slate-600 dark:text-slate-300">意味: ${escapeHtml(data.translation_ja)}</p>` : ''}
          </div>

          <!-- Native Alternative -->
          ${data.natural_alternative ? `
          <div class="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-900 dark:text-blue-200">🌟 さらに自然なネイティブ表現 (Level Up!)</span>
              <button onclick="speakEnglishText('${escapeJsString(data.natural_alternative)}')" class="text-xs text-blue-600 dark:text-blue-400 font-bold">🔊 発音</button>
            </div>
            <p class="text-sm font-serif font-bold text-slate-900 dark:text-white">${escapeHtml(data.natural_alternative)}</p>
          </div>` : ''}

          <!-- Detailed Fixes -->
          <div class="space-y-2">
            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">🔍 修正ポイントの解説</div>
            <div class="space-y-2">${fixesHtml}</div>
          </div>

          <!-- Teacher's Comment -->
          <div class="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
            <span class="font-bold">👨‍🏫 先生からのアドバイス：</span> ${escapeHtml(data.praise_and_advice || '')}
          </div>
        </div>
      `;
      box.classList.remove('hidden');
    }

    // =========================================================================
    // 8. マイ単語帳 & 復習ノート (Wordbook & Study History)
    // =========================================================================
    function loadWordbookAndHistory() {
      if (!engStore) return;
      try {
        const wb = JSON.parse(engStore.getItem('wordbook') || '[]');
        wordbookList = Array.isArray(wb) ? wb : [];
      } catch (e) {
        wordbookList = [];
      }
      try {
        const hist = JSON.parse(engStore.getItem('history') || '[]');
        englishHistory = Array.isArray(hist) ? hist : [];
      } catch (e) {
        englishHistory = [];
      }
      updateWordbookBadges();
    }

    function persistWordbook() {
      if (!engStore) return false;
      if (wordbookList.length > 300) wordbookList = wordbookList.slice(0, 300);
      const ok = engStore.setItem('wordbook', JSON.stringify(wordbookList));
      updateWordbookBadges();
      return ok;
    }

    function persistHistory() {
      if (!engStore) return false;
      if (englishHistory.length > 80) englishHistory = englishHistory.slice(0, 80);
      const ok = engStore.setItem('history', JSON.stringify(englishHistory));
      updateWordbookBadges();
      return ok;
    }

    function updateWordbookBadges() {
      const badge = document.getElementById('wordbookBadge');
      if (badge) badge.textContent = String(wordbookList.length);
      const wbLabel = document.getElementById('wordbookCountLabel');
      if (wbLabel) wbLabel.textContent = String(wordbookList.length);
      const notesLabel = document.getElementById('notesCountLabel');
      if (notesLabel) notesLabel.textContent = String(englishHistory.length);
    }

    function addWordDirect(word, meaning, example = '') {
      const cleanWord = String(word || '').trim();
      if (!cleanWord) return;
      const exists = wordbookList.some(w => w.word.toLowerCase() === cleanWord.toLowerCase());
      if (exists) {
        window.TutorUI.showToast(`ℹ️ 「${cleanWord}」は既にマイ単語帳に登録されています。`, 'blue');
        return;
      }
      wordbookList.unshift({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        word: cleanWord,
        meaning: String(meaning || '').trim(),
        example: String(example || '').trim(),
        memorized: false,
        savedAt: new Date().toISOString()
      });
      if (persistWordbook()) {
        window.TutorUI.showToast(`🔤 「${cleanWord}」をマイ単語帳に保存しました！`, 'green');
      } else {
        window.TutorUI.showToast('⚠️ 保存容量の上限に達しています。', 'amber');
      }
    }

    function addWordToWordbook(idx) {
      if (!lastLessonData || !Array.isArray(lastLessonData.vocabulary)) return;
      const v = lastLessonData.vocabulary[idx];
      if (!v) return;
      addWordDirect(v.word, v.meaning, v.example || '');
    }

    function saveAllLessonWords() {
      if (!lastLessonData || !Array.isArray(lastLessonData.vocabulary)) return;
      let addedCount = 0;
      lastLessonData.vocabulary.forEach(v => {
        const cleanWord = String(v.word || '').trim();
        if (!cleanWord) return;
        if (!wordbookList.some(w => w.word.toLowerCase() === cleanWord.toLowerCase())) {
          wordbookList.unshift({
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            word: cleanWord,
            meaning: String(v.meaning || '').trim(),
            example: String(v.example || '').trim(),
            memorized: false,
            savedAt: new Date().toISOString()
          });
          addedCount++;
        }
      });
      persistWordbook();
      window.TutorUI.showToast(`🔤 新しく ${addedCount} 個の単語をマイ単語帳に一括登録しました！`, 'green');
    }

    function openAddCustomWord() {
      document.getElementById('customWordForm').classList.remove('hidden');
      document.getElementById('customWordInput').focus();
    }

    function saveCustomWord() {
      const w = document.getElementById('customWordInput').value.trim();
      const m = document.getElementById('customMeaningInput').value.trim();
      const ex = document.getElementById('customExampleInput').value.trim();
      if (!w || !m) {
        window.TutorUI.showToast('⚠️ 英単語と日本語の意味を入力してください。', 'amber');
        return;
      }
      addWordDirect(w, m, ex);
      document.getElementById('customWordInput').value = '';
      document.getElementById('customMeaningInput').value = '';
      document.getElementById('customExampleInput').value = '';
      document.getElementById('customWordForm').classList.add('hidden');
      renderWordbookList();
    }

    function toggleWordMemorized(id) {
      const item = wordbookList.find(w => w.id === id);
      if (item) {
        item.memorized = !item.memorized;
        persistWordbook();
        renderWordbookList();
      }
    }

    function deleteWordItem(id) {
      wordbookList = wordbookList.filter(w => w.id !== id);
      persistWordbook();
      renderWordbookList();
    }

    // 学習履歴の保存（長文解説・4択クイズ・英作文）
    function saveCurrentLessonToHistory() {
      if (!lastLessonData) return;
      const { _twinQuizConsumed, ...persistPayload } = lastLessonData;
      const entry = {
        id: Date.now().toString(),
        type: 'reading',
        title: (lastLessonData.passage_en || '長文読解').slice(0, 48),
        summary: (lastLessonData.translation_ja || '').slice(0, 70),
        payload: persistPayload,
        savedAt: new Date().toISOString()
      };
      englishHistory.unshift(entry);
      if (persistHistory()) {
        window.TutorUI.showToast('📁 長文解説を復習ノートに保存しました！', 'green');
      } else {
        window.TutorUI.showToast('⚠️ 保存容量が不足しています。', 'amber');
      }
    }

    function saveQuizRecordToHistory(isCorrect) {
      if (!currentQuizData) return;
      const correctText = currentQuizData.displayChoices[currentQuizData.displayCorrectIndex];
      const entry = {
        id: Date.now().toString(),
        type: 'quiz',
        title: `[4択${isCorrect ? '正解⭕' : '復習❌'}] ${currentQuizData.questionEn.slice(0, 42)}`,
        summary: `正解: ${correctText} ｜ ${currentQuizData.translationJa}`,
        payload: currentQuizData,
        savedAt: new Date().toISOString()
      };
      englishHistory.unshift(entry);
      if (persistHistory()) {
        window.TutorUI.showToast('📁 クイズ記録を復習ノートに保存しました！', 'green');
      }
    }

    function saveWritingToHistory() {
      if (!lastWritingData) return;
      const entry = {
        id: Date.now().toString(),
        type: 'writing',
        title: `[英作文添削 ${lastWritingData.score}点] ${lastWritingData.corrected_text.slice(0, 42)}`,
        summary: `元文: ${lastWritingData.original_text}`,
        payload: lastWritingData,
        savedAt: new Date().toISOString()
      };
      englishHistory.unshift(entry);
      if (persistHistory()) {
        window.TutorUI.showToast('📁 英作文の添削結果を復習ノートに保存しました！', 'green');
      }
    }

    function openHistoryModal(defaultTab = 'wordbook') {
      loadWordbookAndHistory();
      window.TutorUI.openModal('historyModal');
      switchHistoryTab(defaultTab);
    }

    function closeHistoryModal() {
      window.TutorUI.closeModal('historyModal');
    }

    function switchHistoryTab(tab) {
      currentHistoryTab = tab;
      const wbBtn = document.getElementById('tabBtnWordbook');
      const notesBtn = document.getElementById('tabBtnNotes');
      const wbControls = document.getElementById('wordbookControls');

      if (tab === 'wordbook') {
        wbBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-blue-600 text-white';
        notesBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
        wbControls.classList.remove('hidden');
        renderWordbookList();
      } else {
        notesBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-blue-600 text-white';
        wbBtn.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
        wbControls.classList.add('hidden');
        document.getElementById('customWordForm').classList.add('hidden');
        renderNotesHistoryList();
      }
    }

    function renderWordbookList() {
      const container = document.getElementById('historyListContainer');
      if (!container) return;
      const hideMeaning = document.getElementById('hideMeaningToggle')?.checked || false;

      if (wordbookList.length === 0) {
        container.innerHTML = `
          <div class="py-12 text-center text-xs text-slate-400 space-y-2">
            <div class="text-3xl">🔤</div>
            <p class="font-bold">まだ単語が登録されていません</p>
            <p>長文解説の「＋単語帳へ」または「＋単語を手動追加」から登録できます</p>
          </div>
        `;
        return;
      }

      container.innerHTML = wordbookList.map(item => `
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border ${item.memorized ? 'border-emerald-300 dark:border-emerald-800/70 opacity-75' : 'border-slate-200 dark:border-slate-700'} flex items-start justify-between gap-3">
          <div class="space-y-1 flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick="speakEnglishText('${escapeJsString(item.word)}')" class="font-serif font-black text-sm sm:text-base text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>🔊</span>
                <span>${escapeHtml(item.word)}</span>
              </button>
              ${item.memorized ? '<span class="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">✓ 覚えた！</span>' : ''}
            </div>
            <div onclick="this.classList.remove('blur-sm')" class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer ${hideMeaning ? 'blur-sm select-none' : ''}" title="タップで表示">
              ${escapeHtml(item.meaning)}
            </div>
            ${item.example ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 italic font-serif">"${escapeHtml(item.example)}"</p>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="toggleWordMemorized('${escapeJsString(item.id)}')" class="text-[11px] px-2.5 py-1 rounded-lg font-bold border ${item.memorized ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}">
              ${item.memorized ? '覚えた' : '未暗記'}
            </button>
            <button onclick="deleteWordItem('${escapeJsString(item.id)}')" class="text-slate-400 hover:text-rose-500 text-xs font-bold px-1.5 py-1">🗑️</button>
          </div>
        </div>
      `).join('');
    }

    function renderNotesHistoryList() {
      const container = document.getElementById('historyListContainer');
      if (!container) return;

      if (englishHistory.length === 0) {
        container.innerHTML = `
          <div class="py-12 text-center text-xs text-slate-400 space-y-2">
            <div class="text-3xl">📓</div>
            <p class="font-bold">まだ復習ノートに記録がありません</p>
            <p>長文解説・4択クイズ・英作文添削の「📁 マイノートに保存」から保存できます</p>
          </div>
        `;
        return;
      }

      const typeBadges = {
        reading: '<span class="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">📖 長文読解</span>',
        quiz: '<span class="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">🎯 4択クイズ</span>',
        writing: '<span class="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-bold">✍️ 英作文添削</span>'
      };

      container.innerHTML = englishHistory.map(item => {
        const dateStr = item.savedAt ? new Date(item.savedAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            <div onclick="restoreHistoryItem('${escapeJsString(item.id)}')" class="space-y-1 flex-1 min-w-0 cursor-pointer">
              <div class="flex items-center gap-2">
                ${typeBadges[item.type] || ''}
                <span class="text-[10px] text-slate-400">${escapeHtml(dateStr)}</span>
              </div>
              <p class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${escapeHtml(item.title)}</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(item.summary)}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button onclick="restoreHistoryItem('${escapeJsString(item.id)}')" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-xl">開く</button>
              <button onclick="deleteHistoryItem('${escapeJsString(item.id)}')" class="text-slate-400 hover:text-rose-500 text-xs font-bold px-1.5 py-1">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function restoreHistoryItem(id) {
      const item = englishHistory.find(h => h.id === id);
      if (!item || !item.payload) return;
      closeHistoryModal();

      if (item.type === 'reading') {
        switchMode('reading');
        lastLessonData = { ...item.payload, _twinQuizConsumed: false };
        lastPassageEn = item.payload.passage_en || '';
        renderEnglishResult(item.payload);
        document.getElementById('resultSection').classList.remove('hidden');
      } else if (item.type === 'quiz') {
        switchMode('quiz');
        currentQuizData = item.payload;
        selectedChoiceIndex = -1;
        document.getElementById('quizEmptyState').classList.add('hidden');
        document.getElementById('quizActiveContainer').classList.remove('hidden');
        document.getElementById('quizTargetBadge').textContent = currentQuizData.targetPoint || '復習';
        document.getElementById('quizQuestionText').textContent = currentQuizData.questionEn || '';
        document.getElementById('quizTranslationText').textContent = `和訳: ${currentQuizData.translationJa || ''}`;
        document.getElementById('quizHintContent').textContent = currentQuizData.hint || '';
        renderEnglishQuizChoices();
        const box = document.getElementById('quizResultBox');
        if (box) {
          box.classList.add('hidden');
          box.innerHTML = '';
        }
        window.TutorUI.showToast('📁 4択問題を復習用に読み込みました。回答を選択してチェックしてください。', 'blue');
      } else if (item.type === 'writing') {
        switchMode('writing');
        lastWritingData = item.payload;
        document.getElementById('writingTaskInput').value = item.payload.task_ja || '';
        document.getElementById('writingStudentInput').value = item.payload.original_text || '';
        updateWordCount();
        renderWritingCorrection(item.payload);
      }
      window.TutorUI.showToast('📂 ノートから学習記録を復元しました！', 'blue');
    }

    function deleteHistoryItem(id) {
      englishHistory = englishHistory.filter(h => h.id !== id);
      persistHistory();
      renderNotesHistoryList();
    }

    function clearCurrentHistoryTab() {
      if (currentHistoryTab === 'wordbook') {
        if (!wordbookList.length) return;
        wordbookList = [];
        persistWordbook();
        renderWordbookList();
        window.TutorUI.showToast('🗑️ マイ単語帳を整理しました。', 'blue');
      } else {
        if (!englishHistory.length) return;
        englishHistory = [];
        persistHistory();
        renderNotesHistoryList();
        window.TutorUI.showToast('🗑️ 復習ノート履歴を整理しました。', 'blue');
      }
    }

    // =========================================================================
    // 9. 音声読み上げユーティリティ (en-US ネイティブ発音)
    // =========================================================================
    function getSpeechRate() {
      return parseFloat(document.getElementById('speechRateSelect')?.value || '0.95');
    }

    function speakEnglishText(text) {
      if (!englishSpeech || !text) return;
      if (japaneseSpeech) japaneseSpeech.stop();
      englishSpeech.speak(text, { rate: getSpeechRate() });
    }

    function playEnglishSpeech() {
      if (!lastPassageEn) {
        window.TutorUI.showToast('⚠️ 読み上げる英文がありません。', 'amber');
        return;
      }
      speakEnglishText(lastPassageEn);
    }

    function stopAllSpeech() {
      if (englishSpeech) englishSpeech.stop();
      if (japaneseSpeech) japaneseSpeech.stop();
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeJsString(str) {
      return String(str || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, ' ');
    }
