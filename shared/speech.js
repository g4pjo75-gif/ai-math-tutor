// shared/speech.js
// Multi-language Text-to-Speech engine with sentence chunking and iOS watchdog
  'use strict';

  function cleanTextForSpeech(text) {
    return String(text || '')
      .replace(/[*#$\\_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitSpeechChunks(text, lang = 'ja-JP') {
    const clean = cleanTextForSpeech(text);
    if (!clean) return [];

    const isJa = lang.toLowerCase().startsWith('ja');
    const lines = clean.split(/\n+/);
    const sentences = [];

    const regex = isJa
      ? /[^。！？!?\n]+[。！？!?\n]?/g
      : /[^.!?\n]+[.!?\n]?/g;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.match(regex) || [trimmed];
      for (const p of parts) {
        const s = p.trim();
        if (s) sentences.push(s);
      }
    }

    const chunks = [];
    const maxLen = isJa ? 70 : 120;
    const cutDelim = isJa ? '、' : ', ';

    for (const s of sentences) {
      let remaining = s;
      while (remaining.length > maxLen) {
        let cut = isJa
          ? remaining.lastIndexOf('、', maxLen - 10)
          : remaining.lastIndexOf(' ', maxLen - 10);
        if (cut < 20) cut = maxLen - 10;
        chunks.push({ text: remaining.slice(0, cut + 1).trim(), pauseMs: 150 });
        remaining = remaining.slice(cut + 1).trim();
      }
      if (remaining) {
        const isQuestion = /[？?]$/.test(remaining);
        chunks.push({ text: remaining, pauseMs: isQuestion ? 450 : 150 });
      }
    }

    return chunks;
  }

  export const TutorSpeech = {
    create({
      lang = 'ja-JP',
      defaultRate = 0.95,
      voicePriority = [/kyoko|otoya|hattori/i, /natural|online/i, /google/i],
      onVoicesChanged = null
    } = {}) {
      let speechToken = 0;
      let watchdogTimer = null;

      if ('speechSynthesis' in window && typeof onVoicesChanged === 'function') {
        window.speechSynthesis.onvoiceschanged = onVoicesChanged;
      }

      function getVoices() {
        if (!('speechSynthesis' in window)) return [];
        const prefix = lang.slice(0, 2).toLowerCase();
        return window.speechSynthesis.getVoices().filter((v) =>
          (v.lang || '').toLowerCase().startsWith(prefix)
        );
      }

      function getSelectedVoice(preferredVoiceURI) {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices();

        if (preferredVoiceURI) {
          const found = voices.find(
            (v) => v.voiceURI === preferredVoiceURI || v.name === preferredVoiceURI
          );
          if (found) return found;
        }

        const isIOS =
          /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS && !preferredVoiceURI) {
          return null; // iOS will map default voice cleanly by lang
        }

        const matchedVoices = getVoices();
        if (!matchedVoices.length) return null;

        for (const regex of voicePriority) {
          const found = matchedVoices.find((v) => regex.test(v.name));
          if (found) return found;
        }

        return matchedVoices[0] || null;
      }

      function stop() {
        speechToken++;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        if ('speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
          } catch (e) {}
        }
      }

      function speak(text, options = {}) {
        const onEndCallback = typeof options === 'function' ? options : options.onEnd;
        const rate = (typeof options === 'object' && options.rate) ? options.rate : defaultRate;
        const preferredVoiceURI = (typeof options === 'object' && options.voiceURI) ? options.voiceURI : null;

        if (!('speechSynthesis' in window)) {
          if (onEndCallback) onEndCallback();
          return;
        }

        const token = ++speechToken;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }

        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
        } catch (e) {}

        const chunks = splitSpeechChunks(text, lang);
        if (!chunks.length) {
          if (onEndCallback) onEndCallback();
          return;
        }

        const voice = getSelectedVoice(preferredVoiceURI);
        let idx = 0;

        const speakNextChunk = () => {
          if (token !== speechToken) return;
          if (idx >= chunks.length) {
            if (onEndCallback) onEndCallback();
            return;
          }

          const chunk = chunks[idx++];
          const utter = new SpeechSynthesisUtterance(chunk.text);
          utter.lang = lang;
          utter.rate = rate;
          utter.pitch = 1.0;
          if (voice) utter.voice = voice;

          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            if (watchdogTimer) {
              clearTimeout(watchdogTimer);
              watchdogTimer = null;
            }
            if (token !== speechToken) return;
            setTimeout(speakNextChunk, chunk.pauseMs || 150);
          };

          const estimatedMs = Math.max(
            4000,
            Math.ceil((chunk.text.length * 260) / Math.max(0.5, rate)) + 2000
          );
          watchdogTimer = setTimeout(finish, estimatedMs);

          utter.onend = finish;
          utter.onerror = (e) => {
            console.warn('SpeechSynthesis error:', e);
            finish();
          };

          try {
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utter);
          } catch (err) {
            finish();
          }
        };

        speakNextChunk();
      }

      return {
        speak,
        stop,
        getVoices,
        getSelectedVoice,
        split: (t) => splitSpeechChunks(t, lang),
        clean: cleanTextForSpeech
      };
    }
  };
