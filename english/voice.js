import { englishSpeech, japaneseSpeech, state } from './state.js';

    // =========================================================================
    // 9. 音声読み上げユーティリティ (en-US ネイティブ発音)
    // =========================================================================
export function getSpeechRate() {
      return parseFloat(document.getElementById('speechRateSelect')?.value || '0.95');
    }

export function speakEnglishText(text) {
      if (!englishSpeech || !text) return;
      if (japaneseSpeech) japaneseSpeech.stop();
      englishSpeech.speak(text, { rate: getSpeechRate() });
    }

export function playEnglishSpeech() {
      if (!state.lastPassageEn) {
        window.TutorUI.showToast('⚠️ 読み上げる英文がありません。', 'amber');
        return;
      }
      speakEnglishText(state.lastPassageEn);
    }

export function stopAllSpeech() {
      if (englishSpeech) englishSpeech.stop();
      if (japaneseSpeech) japaneseSpeech.stop();
    }

export function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

