// core/gemini.js — Gemini 전송 계층 (DOM 비의존)
import { fetchWithTimeout } from './http.js';
import { parseJson } from './json.js';
import { callProxied, isLicenseMode } from './transport.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// 구독 모드: 모델/키는 서버가 결정하고, 클라이언트는 프록시에만 요청한다.
async function callViaProxy(prompt, image, opts = {}) {
  const useJson = !opts.rawText && Boolean(opts.schema);
  const payload = {
    prompt: prompt || '',
    schema: opts.schema || null,
    rawText: Boolean(opts.rawText),
    temperature: opts.temperature ?? (useJson ? 0.35 : 0.3),
    maxOutputTokens: opts.maxOutputTokens ?? 32768,
    timeoutMs: opts.timeoutMs || 30000
  };
  if (image) payload.image = image;

  const res = await callProxied(payload);
  const data = res.data;
  const usage = res.usage || { in: 0, out: 0 };
  if (!opts.withMeta) return data;
  return { data, usage, cached: res.cached === true, quota: res.quota || null };
}

/**
 * 호출 형식 두 가지를 모두 받는다.
 *   1) callGeminiModel(modelId, apiKey, promptText, imageBase64, options)
 *   2) callGeminiModel({ modelId, apiKey, promptText, imageBase64, schema, ... })
 * schema는 **반드시 호출자가 넘긴다**(core는 앱의 스키마를 모른다).
 */
export async function callGeminiModel(arg1, apiKey, promptText, imageBase64, options = {}) {
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

  if (isLicenseMode()) {
    return callViaProxy(effectivePrompt, effectiveImage, effectiveOpts);
  }

  if (!effectiveApiKey) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const cleanModelId = String(modelId || 'gemini-3.8-flash').replace(/^models\//, '').trim();
  const url = `${ENDPOINT}/${encodeURIComponent(cleanModelId)}:generateContent`;

  const parts = [{ text: effectivePrompt || '' }];
  if (effectiveImage) {
    parts.push({
      inline_data: { mime_type: 'image/jpeg', data: effectiveImage }
    });
  }

  const temperature = effectiveOpts.temperature ?? 0.35;
  const maxOutputTokens = effectiveOpts.maxOutputTokens ?? 32768;
  const schema = effectiveOpts.schema || null;
  const useJson = !effectiveOpts.rawText && Boolean(schema);
  const timeoutMs = effectiveOpts.timeoutMs || 30000;

  const thinkingLevel = effectiveOpts.thinkingLevel || null;

  const buildPayload = (useStructured, useThinking) => {
    const cfg = useStructured && useJson
      ? { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema }
      : { temperature: useStructured ? temperature : 0.3, maxOutputTokens };
    if (useThinking && thinkingLevel) cfg.thinkingConfig = { thinkingLevel };
    return { contents: [{ role: 'user', parts }], generationConfig: cfg };
  };

  const send = async (useStructured, useThinking) => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': effectiveApiKey
      },
      body: JSON.stringify(buildPayload(useStructured, useThinking))
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
    data = await send(true, true);
  } catch (err) {
    const msg = (err && err.message) || '';
    if (err.status === 400 && /thinking/i.test(msg)) {
      // thinkingLevel 미지원 모델: 스키마는 유지하고 thinking만 끈다
      data = await send(true, false);
    } else if (err.status === 400 && /response|schema|mime/i.test(msg)) {
      // 구조화 출력(responseSchema) 미지원 모델 폴백
      data = await send(false, true);
    } else {
      throw err;
    }
  }

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.map(p => p.text || '').join('\n') || '';
  if (!text) {
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('AIの回答が途中で切れました（思考・出力トークン上限）。もう一度試すか、入力内容を絞ってください。');
    }
    const blockReason = data.promptFeedback?.blockReason || finishReason;
    throw new Error(blockReason
      ? `モデルが応答を中断しました（理由: ${blockReason}）`
      : 'モデルから空の応答が返されました。');
  }

  const usage = {
    in: data.usageMetadata?.promptTokenCount || 0,
    out: data.usageMetadata?.candidatesTokenCount || 0
  };
  const withMeta = Boolean(effectiveOpts.withMeta);

  if (effectiveOpts.rawText) {
    const outText = text.trim();
    return withMeta ? { data: outText, usage } : outText;
  }

  try {
    const parsed = parseJson(text);
    return withMeta ? { data: parsed, usage } : parsed;
  } catch (parseErr) {
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('問題数が多いためAIの回答が途中で切れました（思考・出力トークン上限）。入力内容を小さく分割して試してください。');
    }
    throw parseErr;
  }
}

// 모델 목록은 BYOK 전용이다(프록시 모드는 서버가 모델을 고정한다).
export async function fetchAvailableModels(arg = {}) {
  const apiKey = typeof arg === 'string' ? arg : arg.apiKey;
  const timeoutMs = typeof arg === 'object' && arg.timeoutMs ? arg.timeoutMs : 15000;
  if (!apiKey) {
    throw new Error('Gemini APIキーが必要です。');
  }

  const res = await fetchWithTimeout(`${ENDPOINT}`, {
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
