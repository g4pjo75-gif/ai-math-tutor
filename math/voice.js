
    function highlightStepCard(activeIndex) {
      state.currentSteps.forEach((_, idx) => {
        const el = document.getElementById(`step-card-${idx}`);
        const speechEl = document.getElementById(`step-speech-${idx}`);
        const detailsEl = document.getElementById(`step-speech-details-${idx}`);
        if (!el) return;
        if (idx === activeIndex) {
          el.classList.add('step-active');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (detailsEl) detailsEl.open = true;
          if (speechEl) {
            speechEl.classList.add('bg-amber-100', 'dark:bg-amber-950/60', 'p-2', 'rounded-lg', 'font-medium', 'text-amber-950', 'dark:text-amber-100', 'border', 'border-amber-300', 'dark:border-amber-700');
          }
        } else {
          el.classList.remove('step-active');
          if (speechEl) {
            speechEl.classList.remove('bg-amber-100', 'dark:bg-amber-950/60', 'p-2', 'rounded-lg', 'font-medium', 'text-amber-950', 'dark:text-amber-100', 'border', 'border-amber-300', 'dark:border-amber-700');
          }
        }
      });
    }

    // ===== 音声（端末内蔵 高品質日本語音声 Web Speech API）=====
    let speechToken = 0;
    let chunkWatchdogTimer = null;

    function initVoiceSelect() {
      if (!('speechSynthesis' in window)) return;
      populateVoiceSelect();
      window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
      [300, 1000, 2500, 5000].forEach(ms => setTimeout(populateVoiceSelect, ms));
    }

    function populateVoiceSelect() {
      const sel = document.getElementById('voiceSelect');
      if (!sel || !('speechSynthesis' in window)) return;

      const voices = window.speechSynthesis.getVoices();
      const jaVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('ja'));

      let optionsHtml = '<option value="" selected>自動（端末推奨・Kyoko等）</option>';
      if (jaVoices.length > 0) {
        optionsHtml += jaVoices.map(v =>
          `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)}（${escapeHtml(v.lang || '')}）</option>`
        ).join('');
      }

      sel.innerHTML = optionsHtml;
      const saved = safeStorage.getItem('preferred_voice_uri') || '';
      if (saved && [...sel.options].some(o => o.value === saved)) {
        sel.value = saved;
      }
    }

    function onVoiceChange() {
      const val = document.getElementById('voiceSelect').value;
      safeStorage.setItem('preferred_voice_uri', val);
      testVoice();
    }

    function onSpeechRateChange() {
      const val = document.getElementById('speechRate')?.value || '0.95';
      safeStorage.setItem('speech_rate', val);
    }

    function getSelectedVoice() {
      if (!('speechSynthesis' in window)) return null;
      const voices = window.speechSynthesis.getVoices();
      const saved = safeStorage.getItem('preferred_voice_uri');
      if (saved) {
        const found = voices.find(v => v.voiceURI === saved || v.name === saved);
        if (found) return found;
      }

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      // iOS Safariでは手動選択がなければnullを返し、lang='ja-JP'で標準音声(Kyoko等)に自動マッピング
      if (isIOS && !saved) return null;

      const jaVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('ja'));
      if (!jaVoices.length) return null;

      return jaVoices.find(v => /kyoko|otoya|hattori/i.test(v.name)) ||
        jaVoices.find(v => /natural|online/i.test(v.name)) ||
        jaVoices.find(v => /google/i.test(v.name)) ||
        jaVoices[0] || null;
    }

    function testVoice() {
      speakJapanese('こんにちは。今日も一緒に、数学をがんばりましょう。');
    }

    // 読み上げ前に記号（*, #, $, \, _ 等）を除去または日本語読みに置換
    function cleanTextForSpeech(text) {
      return String(text || '')
        .replace(/[*#$\\_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // 文章を句読点・疑問符・感嘆符・改行単位で分割し、順次キューに入れる
    function splitSpeech(text) {
      const clean = cleanTextForSpeech(text);
      if (!clean) return [];

      const lines = clean.split(/\n+/);
      const sentences = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.match(/[^。！？!?\n]+[。！？!?\n]?/g) || [trimmed];
        for (const p of parts) {
          const s = p.trim();
          if (s) sentences.push(s);
        }
      }

      const chunks = [];
      for (const s of sentences) {
        let remaining = s;
        while (remaining.length > 70) {
          let cut = remaining.lastIndexOf('、', 60);
          if (cut < 20) cut = 60;
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

    // メイン音声読み上げ関数（単一エンジン・重複なし・iOS onend 欠落対策 watchdog 付き）
    function speakJapanese(text, onEndCallback) {
      if (!('speechSynthesis' in window)) {
        if (onEndCallback) onEndCallback();
        return;
      }

      const token = ++speechToken;
      if (chunkWatchdogTimer) {
        clearTimeout(chunkWatchdogTimer);
        chunkWatchdogTimer = null;
      }
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch (e) {}

      const chunks = splitSpeech(text);
      if (!chunks.length) {
        if (onEndCallback) onEndCallback();
        return;
      }

      const rate = parseFloat(document.getElementById('speechRate')?.value || '0.95');
      const voice = getSelectedVoice();
      let idx = 0;

      const speakNextChunk = () => {
        if (token !== speechToken) return;
        if (idx >= chunks.length) {
          if (onEndCallback) onEndCallback();
          return;
        }

        const chunk = chunks[idx++];
        const utter = new SpeechSynthesisUtterance(chunk.text);
        utter.lang = 'ja-JP';
        utter.rate = rate;
        utter.pitch = 1.0;
        if (voice) utter.voice = voice;

        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (chunkWatchdogTimer) {
            clearTimeout(chunkWatchdogTimer);
            chunkWatchdogTimer = null;
          }
          if (token !== speechToken) return;
          setTimeout(speakNextChunk, chunk.pauseMs || 150);
        };

        // P1-12: iOS Safari 等で onend が発火しない場合の Watchdog タイマー
        const estimatedMs = Math.max(4000, Math.ceil((chunk.text.length * 260) / Math.max(0.5, rate)) + 2000);
        chunkWatchdogTimer = setTimeout(finish, estimatedMs);

        utter.onend = finish;
        utter.onerror = (e) => {
          console.warn('WebSpeech chunk error:', e);
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

    function playSingleStep(idx) {
      state.isPlayingQueue = false;
      const step = state.currentSteps[idx];
      if (!step) return;
      highlightStepCard(idx);
      speakJapanese(step.speech_ja || step.title || '', () => {
        highlightStepCard(-1);
      });
    }

    function playAllSteps(startIndex = 0) {
      if (!state.currentSteps.length) return;
      state.isPlayingQueue = true;

      function next(i) {
        if (!state.isPlayingQueue || i >= state.currentSteps.length) {
          highlightStepCard(-1);
          state.isPlayingQueue = false;
          return;
        }
        highlightStepCard(i);
        const lead = i === startIndex && startIndex === 0 ? 'では、一緒に見ていきましょう。' : '';
        speakJapanese(`${lead}${state.currentSteps[i].speech_ja || ''}`, () => next(i + 1));
      }
      next(startIndex);
    }

    function stopSpeech() {
      state.isPlayingQueue = false;
      speechToken++;
      if (state.autoPlayTimer) {
        clearTimeout(state.autoPlayTimer);
        state.autoPlayTimer = null;
      }
      if (chunkWatchdogTimer) {
        clearTimeout(chunkWatchdogTimer);
        chunkWatchdogTimer = null;
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
      highlightStepCard(-1);
    }

