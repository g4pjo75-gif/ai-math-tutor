// server/src/validate.js — /v1/solve 요청 검증·클램프 (순수 함수)
export const LIMITS = {
  promptChars: 40000,
  imageBase64Chars: 5_600_000, // 약 4MB 원본
  schemaJsonChars: 32000,
  maxOutputTokens: 32768,
  timeoutMs: 120000
};

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function validateSolveBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_request' };
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) return { ok: false, error: 'invalid_prompt' };
  if (prompt.length > LIMITS.promptChars) return { ok: false, error: 'prompt_too_large' };

  let image = null;
  if (body.image != null) {
    image = String(body.image).trim();
    if (image) {
      if (image.length > LIMITS.imageBase64Chars) return { ok: false, error: 'image_too_large' };
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(image)) return { ok: false, error: 'invalid_image' };
    } else {
      image = null;
    }
  }

  let schema = null;
  if (body.schema != null) {
    if (typeof body.schema !== 'object' || Array.isArray(body.schema)) {
      return { ok: false, error: 'invalid_schema' };
    }
    if (JSON.stringify(body.schema).length > LIMITS.schemaJsonChars) {
      return { ok: false, error: 'schema_too_large' };
    }
    schema = body.schema;
  }

  const val = {
    prompt,
    image,
    schema,
    rawText: body.rawText === true,
    temperature: clamp(body.temperature, 0, 1, 0.35),
    maxOutputTokens: Math.round(clamp(body.maxOutputTokens, 1, LIMITS.maxOutputTokens, 32768)),
    timeoutMs: Math.round(clamp(body.timeoutMs, 5000, LIMITS.timeoutMs, 30000))
  };

  return {
    ok: true,
    ...val,
    value: val
  };
}
