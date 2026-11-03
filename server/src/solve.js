// server/src/solve.js — Gemini 프록시 + 서버 캐시 + 쿼터/레이트리밋 + 원가 기록
import { callGeminiModel } from '../../core/gemini.js';
import { getUsage, periodOf, quotaSnapshot, sha256Hex } from './license.js';
import { validateSolveBody } from './validate.js';
import { costMicroYen, DEFAULT_MODEL } from './pricing.js';
import { checkBudget } from './budget.js';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

async function fingerprint(v, model, thinkingLevel) {
  const payload = JSON.stringify({
    model,
    thinkingLevel,
    prompt: v.prompt,
    imageLen: v.image ? v.image.length : 0,
    imageHead: v.image ? v.image.slice(0, 256) : '',
    schema: v.schema || null,
    rawText: v.rawText
  });
  return sha256Hex(payload);
}

export async function solveProxy(env, license, rawBody) {
  if (!env.GEMINI_API_KEY) {
    return { status: 500, body: { ok: false, error: 'server_misconfigured' } };
  }

  const v = validateSolveBody(rawBody);
  if (!v.ok) return { status: 400, body: { ok: false, error: v.error } };

  const now = Date.now();

  // 레이트리밋: 라이선스당 60초 내 호출 수
  const perMin = Number(env.RATE_LIMIT_PER_MIN || 8);
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM usage WHERE license_id = ? AND created_at > ?'
  ).bind(license.id, now - 60000).first();
  if (((recent && recent.n) || 0) >= perMin) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } };
  }

  // 월 쿼터
  const used = await getUsage(env, license.id);
  const limit = Number(license.call_limit) || 0;
  if (used >= limit) {
    return {
      status: 402,
      body: {
        ok: false,
        error: 'quota_exceeded',
        quota: { used, limit, remaining: 0, period: periodOf() }
      }
    };
  }

  // 예산 가드 (일간/월간 시스템 원가 상한)
  const budget = await checkBudget(env, now);
  if (!budget.allowed) {
    console.error('budget_exceeded:', budget.reason);
    return { status: 503, body: { ok: false, error: 'budget_exceeded' } };
  }

  const model = env.MODEL || DEFAULT_MODEL;
  const thinkingLevel = env.THINKING_LEVEL || 'low';
  const usdJpy = Number(env.USD_JPY || 150);
  const fp = await fingerprint(v, model, thinkingLevel);

  // 서버 캐시 (히트 시 API 0회, 쿼터 미차감)
  const cached = await env.DB.prepare('SELECT payload, created_at FROM cache WHERE fp = ?')
    .bind(fp).first();
  if (cached && now - cached.created_at < CACHE_TTL_MS) {
    let data = null;
    try {
      data = JSON.parse(cached.payload);
    } catch (e) {
      data = null;
    }
    if (data !== null) {
      return {
        status: 200,
        body: {
          ok: true,
          cached: true,
          data,
          usage: { in: 0, out: 0, costYen: 0 },
          quota: await quotaSnapshot(env, license)
        }
      };
    }
  }

  let result;
  try {
    result = await callGeminiModel(model, env.GEMINI_API_KEY, v.prompt, v.image, {
      schema: v.schema,
      rawText: v.rawText,
      temperature: v.temperature,
      maxOutputTokens: v.maxOutputTokens,
      timeoutMs: v.timeoutMs,
      thinkingLevel,
      withMeta: true
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { status: 504, body: { ok: false, error: 'timeout' } };
    }
    if (err && (err.status === 429 || /quota|rate limit|resource_exhausted/i.test(err.message || ''))) {
      return { status: 429, body: { ok: false, error: 'upstream_quota' } };
    }
    return { status: 502, body: { ok: false, error: 'upstream_error' } };
  }

  const data = result.data;
  const usage = result.usage || { in: 0, out: 0 };
  const costMicro = costMicroYen(model, usage.in, usage.out, usdJpy);

  await env.DB.prepare(
    'INSERT INTO usage (license_id, period, route, tokens_in, tokens_out, created_at, model, thinking_level, cost_micro_yen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(license.id, periodOf(), 'solve', usage.in, usage.out, now, model, thinkingLevel, costMicro).run();

  try {
    await env.DB.prepare(
      'INSERT INTO cache (fp, payload, created_at) VALUES (?, ?, ?) ON CONFLICT(fp) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at'
    ).bind(fp, JSON.stringify(data), now).run();
  } catch (e) {
    // 캐시 저장 실패는 요청 실패로 취급하지 않는다
  }

  return {
    status: 200,
    body: {
      ok: true,
      cached: false,
      data,
      usage: { in: usage.in, out: usage.out, costYen: Number((costMicro / 1e6).toFixed(3)) },
      quota: await quotaSnapshot(env, license)
    }
  };
}
