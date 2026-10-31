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
