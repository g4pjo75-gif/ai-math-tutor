// shared/core.js
// Gemini API client, network utilities, JSON parser, and quota detector
(function (window) {
  'use strict';

  async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseJson(rawText) {
    const cleaned = String(rawText || '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');

    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      throw new Error('AIの応答からJSONデータを抽出できませんでした。');
    }
    return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
  }

  function isQuotaError(err) {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('quota') ||
      msg.includes('rate limit') ||
      msg.includes('resource_exhausted') ||
      msg.includes('billing') ||
      msg.includes('limit: 0');
  }

  async function callGeminiModel(arg1, apiKey, promptText, imageBase64, options = {}) {
    let modelId, effectiveApiKey, effectivePrompt, effectiveImage, effectiveOpts;
    if (typeof arg1 === 'object' && arg1 !== null && !apiKey) {
      modelId = arg1.modelId;
      effectiveApiKey = arg1.apiKey;
      effectivePrompt = arg1.promptText || arg1.prompt;
      effectiveImage = arg1.imageBase64 || null;
      effectiveOpts = arg1;
    } else {
      modelId = arg1;
      effectiveApiKey = apiKey;
      effectivePrompt = promptText;
      effectiveImage = imageBase64;
      effectiveOpts = options || {};
    }

    if (!effectiveApiKey) {
      throw new Error('Gemini APIキーが設定されていません。');
    }

    const cleanModelId = String(modelId || 'gemini-3.8-flash').replace(/^models\//, '').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModelId)}:generateContent`;

    const parts = [{ text: effectivePrompt || '' }];
    if (effectiveImage) {
      parts.push({
        inline_data: { mime_type: 'image/jpeg', data: effectiveImage }
      });
    }

    const temperature = effectiveOpts.temperature ?? 0.35;
    const maxOutputTokens = effectiveOpts.maxOutputTokens ?? 16384;
    const schema = effectiveOpts.schema || null;
    const useJson = !effectiveOpts.rawText && Boolean(schema);
    const timeoutMs = effectiveOpts.timeoutMs || 30000;

    const buildPayload = (useStructured) => ({
      contents: [{ role: 'user', parts }],
      generationConfig: useStructured && useJson
        ? { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema }
        : { temperature: useStructured ? temperature : 0.3, maxOutputTokens }
    });

    const send = async (useStructured) => {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': effectiveApiKey
        },
        body: JSON.stringify(buildPayload(useStructured))
      }, timeoutMs);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error?.message || `HTTP Error ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    };

    let data;
    try {
      data = await send(true);
    } catch (err) {
      // 構造化出力（responseSchema）に未対応のモデル向けフォールバック
      if (err.status === 400 && /response|schema|mime/i.test(err.message)) {
        data = await send(false);
      } else {
        throw err;
      }
    }

    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text = candidate?.content?.parts?.map(p => p.text || '').join('\n') || '';
    if (!text) {
      const blockReason = data.promptFeedback?.blockReason || finishReason;
      throw new Error(blockReason
        ? `モデルが応答を中断しました（理由: ${blockReason}）`
        : 'モデルから空の応答が返されました。');
    }

    if (effectiveOpts.rawText) {
      return text.trim();
    }

    try {
      return parseJson(text);
    } catch (parseErr) {
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('問題数が多いためAIの回答が途中で切れました（トークン上限）。');
      }
      throw parseErr;
    }
  }

  async function fetchAvailableModels(arg = {}) {
    const apiKey = typeof arg === 'string' ? arg : arg.apiKey;
    const timeoutMs = typeof arg === 'object' && arg.timeoutMs ? arg.timeoutMs : 15000;
    if (!apiKey) {
      throw new Error('Gemini APIキーが必要です。');
    }

    const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey }
    }, timeoutMs);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error?.message || `HTTP ${res.status}`);
    }

    const validModels = (data.models || [])
      .filter(m =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        m.name.includes('gemini') &&
        !m.name.includes('embedding') &&
        !m.name.includes('imagen') &&
        !m.name.includes('tts')
      )
      .map(m => ({
        id: m.name.replace(/^models\//, ''),
        displayName: m.displayName || m.name.replace(/^models\//, '')
      }));

    if (validModels.length === 0) {
      throw new Error('generateContentに対応したGeminiモデルが見つかりませんでした。');
    }

    validModels.sort((a, b) => {
      const score = id => (id.includes('flash') ? 2 : id.includes('pro') ? 1 : 0);
      return score(b.id) - score(a.id) || b.id.localeCompare(a.id);
    });

    return validModels;
  }

  // ===========================================================================
  // 4. 画像＋テキストの高速ハッシュ生成 & 重複API呼び出し防止キャッシュ
  // ===========================================================================
  function computeRequestHash({ mode = 'default', unit = '', text = '', imageBase64 = '' } = {}) {
    const img = String(imageBase64 || '');
    const imgLen = img.length;
    const imgSample = imgLen > 0
      ? `${imgLen}:${img.slice(0, 256)}:${img.slice(Math.floor(imgLen / 2), Math.floor(imgLen / 2) + 256)}:${img.slice(Math.max(0, imgLen - 256))}`
      : 'no-img';
    const raw = `${mode}|${String(unit).trim()}|${String(text).trim()}|${imgSample}`;

    let h1 = 0x811c9dc5;
    let h2 = 5381;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 = Math.imul(h2, 33) ^ ch;
    }
    return `fp_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}_${raw.length}`;
  }

  function getCachedResponse(storage, cacheKey, fingerprint) {
    if (!storage || !cacheKey || !fingerprint) return null;
    try {
      const raw = storage.getItem(cacheKey);
      if (!raw) return null;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return null;
      const hit = list.find(item => item && item.fp === fingerprint);
      return hit ? hit.data : null;
    } catch (e) {
      return null;
    }
  }

  function setCachedResponse(storage, cacheKey, fingerprint, data, maxEntries = 15) {
    if (!storage || !cacheKey || !fingerprint || !data) return;
    try {
      const raw = storage.getItem(cacheKey);
      let list = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        } catch (e) {}
      }
      list = list.filter(item => item && item.fp !== fingerprint);
      list.unshift({ fp: fingerprint, savedAt: Date.now(), data });
      if (list.length > maxEntries) {
        list = list.slice(0, maxEntries);
      }
      let ok = storage.setItem(cacheKey, JSON.stringify(list));
      if (!ok && list.length > 3) {
        list = list.slice(0, 3);
        storage.setItem(cacheKey, JSON.stringify(list));
      }
    } catch (e) {}
  }

  // ===========================================================================
  // 5. 記述式（直接入力）数学解答のローカル正規化・同値判定エンジン（API消費0）
  // ===========================================================================
  function normalizeMathExpr(input) {
    if (input === null || input === undefined) return '';
    let s = String(input);

    // 1. 全角英数字・記号を半角へ変換
    s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    s = s
      .replace(/　/g, ' ')
      .replace(/[−ー―‐–—]/g, '-')
      .replace(/[＋]/g, '+')
      .replace(/[×⋅・]/g, '*')
      .replace(/[÷／]/g, '/')
      .replace(/[＝]/g, '=')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[，、]/g, ',')
      .replace(/[．。]/g, '');

    // 2. LaTeXデリミタや装飾コマンドを除去・正規化
    s = s
      .replace(/\$\$/g, '')
      .replace(/\$/g, '')
      .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
      .replace(/\\left|\\right|\\displaystyle|\\,/g, '')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^}]*)\}/g, '$1')
      .replace(/\\\\/g, '\\');

    // 3. 不等号・複号・分数・根号の正規化
    s = s
      .replace(/\\leqq|\\leq|\\le|≦|≤|=<|<=/g, '<=')
      .replace(/\\geqq|\\geq|\\ge|≧|≥|=>|>=/g, '>=')
      .replace(/\\pm|±/g, '+-')
      .replace(/\\times|\\cdot/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');

    // 4. 空白をすべて除去し小文字化（ただし変数大文字A,B,C,D,S,R等も考慮して比較時に両方見る）
    s = s.replace(/\s+/g, '');

    // 5. 先頭の「答え:」「答:」等を除去
    s = s.replace(/^(答え?|解答|ans|answer)[:：=]/i, '');

    // 6. 単一分数の不要な外カッコ (a)/(b) で分子分母が単項数字・文字なら a/b に統一
    s = s.replace(/\(([0-9a-zA-Z]+)\)\/\(([0-9a-zA-Z]+)\)/g, '$1/$2');

    // 7. 因数分解の積の順序正規化: (x+2)(2x-1) と (2x-1)(x+2) を同一視
    const factorMatch = s.match(/^([+-]?[0-9a-zA-Z]*)((?:\([^()]+\)){2,})$/);
    if (factorMatch) {
      const prefix = factorMatch[1] === '+' ? '' : factorMatch[1];
      const factors = [...factorMatch[2].matchAll(/\([^()]+\)/g)].map(m => m[0]);
      if (factors.length >= 2) {
        factors.sort();
        s = prefix + factors.join('');
      }
    }

    return s;
  }

  function isLocalMathMatch(studentRaw, referenceList = []) {
    const stuNorm = normalizeMathExpr(studentRaw);
    if (!stuNorm) return false;

    // カンマ区切り解（例: x = 2, -3 と x = -3, 2）の比較ヘルパー
    const normalizeSolutionSet = (normStr) => {
      const withoutVar = normStr.replace(/^[a-zA-Z]=/, '');
      if (withoutVar.includes(',') && !withoutVar.includes('(')) {
        return withoutVar.split(',').map(p => p.trim()).filter(Boolean).sort().join(',');
      }
      return withoutVar;
    };

    // 連立不等号の逆向き（例: -3<=y<=3 と 3>=y>=-3）の正規化ヘルパー
    const flipDoubleInequality = (normStr) => {
      const m = normStr.match(/^([^<>]+)(>=|>)([^<>]+)(>=|>)(.+)$/);
      if (m) {
        const op1 = m[4] === '>=' ? '<=' : '<';
        const op2 = m[2] === '>=' ? '<=' : '<';
        return `${m[5]}${op1}${m[3]}${op2}${m[1]}`;
      }
      return normStr;
    };

    const stuFlipped = flipDoubleInequality(stuNorm);
    const stuSet = normalizeSolutionSet(stuNorm);

    const refs = (Array.isArray(referenceList) ? referenceList : [referenceList]).filter(Boolean);
    for (const ref of refs) {
      const refNorm = normalizeMathExpr(ref);
      if (!refNorm) continue;

      if (stuNorm === refNorm || stuFlipped === refNorm) {
        return true;
      }
      // 基準正解が「x=3」で生徒が「3」または「x=-3,2」の順不同
      const refSet = normalizeSolutionSet(refNorm);
      if (stuSet && refSet && stuSet === refSet) {
        return true;
      }
    }
    return false;
  }

  window.TutorCore = {
    fetchWithTimeout,
    parseJson,
    isQuotaError,
    callGeminiModel,
    fetchAvailableModels,
    computeRequestHash,
    getCachedResponse,
    setCachedResponse,
    normalizeMathExpr,
    isLocalMathMatch
  };
})(window);
