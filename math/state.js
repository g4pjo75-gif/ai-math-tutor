    // =========================================================================
    // 1. 安全ストレージラッパー (sharedStore + mathStore による共有キー連携)
    // =========================================================================
export const sharedStore = window.TutorStorage
      ? window.TutorStorage.create({ prefix: 'tutor_', legacyPrefixes: ['amt_'] })
      : null;
export const mathStore = window.TutorStorage
      ? window.TutorStorage.create({ prefix: 'amt_', legacyPrefixes: [''] })
      : null;

    // 共通キー（数学・英語・保護者画面で共有）
export const COMMON_STORAGE_KEYS = new Set(['gemini_api_key', 'app_pin', 'dark_mode', 'ui_theme']);

export const memoryFallback = {};
export const safeStorage = {
      getItem(key) {
        if (COMMON_STORAGE_KEYS.has(key) && sharedStore) {
          const sharedVal = sharedStore.getItem(key);
          if (sharedVal !== null && sharedVal !== undefined) return sharedVal;
        }
        if (mathStore) {
          return mathStore.getItem(key);
        }
        try {
          const prefixed = `amt_${key}`;
          const val = localStorage.getItem(prefixed) ?? localStorage.getItem(key);
          if (val !== null && val !== undefined) return val;
          return memoryFallback[prefixed] ?? memoryFallback[key] ?? null;
        } catch (e) {
          return memoryFallback[`amt_${key}`] ?? memoryFallback[key] ?? null;
        }
      },
      setItem(key, val) {
        let ok = true;
        const strVal = String(val);
        if (COMMON_STORAGE_KEYS.has(key) && sharedStore) {
          sharedStore.setItem(key, strVal);
        }
        if (mathStore) {
          ok = mathStore.setItem(key, strVal);
        } else {
          memoryFallback[`amt_${key}`] = strVal;
          try {
            localStorage.setItem(`amt_${key}`, strVal);
          } catch (e) {
            console.warn('localStorage.setItem failed:', e);
            ok = false;
          }
        }
        return ok;
      },
      removeItem(key) {
        if (COMMON_STORAGE_KEYS.has(key) && sharedStore) {
          sharedStore.removeItem(key);
        }
        if (mathStore) {
          mathStore.removeItem(key);
        } else {
          delete memoryFallback[`amt_${key}`];
          delete memoryFallback[key];
          try {
            localStorage.removeItem(`amt_${key}`);
            localStorage.removeItem(key);
          } catch (e) {}
        }
      }
    };

    // グローバル状態

    // 埋め込み API キー（空のデフォルト）
export const EMBEDDED_GEMINI_API_KEY = '';

    // ==== Phase 4-B: 공유 가변 상태 (ESM import 바인딩은 재할당 불가) ====
export const state = {
      currentImageBase64: null,
      currentProblems: [], // 認識されたすべての問題（小問リスト）
      currentProblemIndex: 0, // 現在表示中の問題インデックス
      currentQuizData: null, // 自分で解く類題データ { problem, answer, hint, choices, displayCorrectIndex ... }
      quizInputMode: 'choice', // 'choice' (4択) または 'text' (直接入力)
      selectedChoiceIndex: -1, // 選択中の4択インデックス (0~3)
      stepChats: {}, // ステップ別フォローアップ会話 { `${problemIndex}:${stepIndex}`: [ {role, text, speech_ja} ] }
      stepChatBusy: {}, // ステップ別質問送信中フラグ
      overallChats: {}, // 問題全体の解法・別解フォローアップ会話 { [problemIndex]: [ {role, text, method_name, comparison_note, speech_ja, createdAt} ] }
      overallChatBusy: false, // 全体質問送信中フラグ
      currentSteps: [],
      isPlayingQueue: false,
      autoPlayTimer: null, // 自動再生用タイマーID（タブ切替時の重複防止）
      toastTimer: null, // トースト表示用タイマーID
      currentModelId: null, // 「もっとやさしく」再生成で使う
      currentProblemText: '', // 同上（問題文のコンテキスト）
      tutorHistory: [], // マイノート（過去の解説記録）
    };
