// core/gemini.js — Gemini 전송 계층 (DOM 비의존)
import { fetchWithTimeout } from './http.js';
import { parseJson } from './json.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

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
    // 구조화 출력(responseSchema) 미지원 모델 폴백
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
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('AIの回答が途中で切れました（思考・出力トークン上限）。もう一度試すか、入力内容を絞ってください。');
    }
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
      throw new Error('問題数が多いためAIの回答が途中で切れました（思考・出力トークン上限）。入力内容を小さく分割して試してください。');
    }
    throw parseErr;
  }
}

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
