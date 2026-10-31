// tests/core.test.js — Phase 5 L1: core 순수 모듈 단위 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const stub = require('./stub-gemini.js');

const load = () => import('../core/index.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); return true; },
    raw: m
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ------------------------------------------------------------------ parseJson
test('parseJson: plain / fenced / prefixed / array', async () => {
  const { parseJson } = await load();
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(parseJson('前置き\n{"a":3}\n後置き'), { a: 3 });
  assert.deepEqual(parseJson('[1,2,3]'), [1, 2, 3]);
  assert.deepEqual(parseJson('```\n[{"b":1}]\n```'), [{ b: 1 }]);
});

test('parseJson: garbage throws', async () => {
  const { parseJson } = await load();
  assert.throws(() => parseJson('no json here'), /JSONデータを抽出できません/);
  assert.throws(() => parseJson(''), /JSONデータを抽出できません/);
});

// --------------------------------------------------------- computeRequestHash
test('computeRequestHash: deterministic and sensitive', async () => {
  const { computeRequestHash } = await load();
  const base = { mode: 'math_solve', unit: 'math1', text: 'x^2-1', imageBase64: '' };
  const a = computeRequestHash(base);
  const b = computeRequestHash({ ...base });
  assert.equal(a, b);
  assert.match(a, /^fp_[0-9a-f]+_[0-9a-f]+_\d+$/);
  assert.notEqual(a, computeRequestHash({ ...base, text: 'x^2-2' }));
  assert.notEqual(a, computeRequestHash({ ...base, unit: 'mathA' }));
  assert.notEqual(a, computeRequestHash({ ...base, mode: 'eng_reading' }));
  assert.notEqual(a, computeRequestHash({ ...base, imageBase64: 'AAAA' }));
});

// ------------------------------------------------------------------- cache
test('cache: set/get roundtrip', async () => {
  const { setCachedResponse, getCachedResponse } = await load();
  const storage = fakeStorage();
  setCachedResponse(storage, 'c', 'fp1', { ok: 1 });
  assert.deepEqual(getCachedResponse(storage, 'c', 'fp1'), { ok: 1 });
  assert.equal(getCachedResponse(storage, 'c', 'fp2'), null);
  assert.equal(getCachedResponse(null, 'c', 'fp1'), null);
});

test('cache: TTL / schema version / corrupt data', async () => {
  const { setCachedResponse, getCachedResponse, CACHE_SCHEMA_VERSION } = await load();
  const storage = fakeStorage();
  setCachedResponse(storage, 'c', 'fp1', { ok: 1 });
  assert.equal(getCachedResponse(storage, 'c', 'fp1', -1), null, 'TTL 만료');

  storage.raw.set('old', JSON.stringify([{ v: CACHE_SCHEMA_VERSION - 1, fp: 'x', savedAt: Date.now(), data: 1 }]));
  assert.equal(getCachedResponse(storage, 'old', 'x'), null, '구버전 스키마 무시');

  storage.raw.set('broken', '{not json');
  assert.equal(getCachedResponse(storage, 'broken', 'x'), null);
});

test('cache: maxEntries trim and dedupe', async () => {
  const { setCachedResponse, getCachedResponse } = await load();
  const storage = fakeStorage();
  for (let i = 0; i < 5; i++) setCachedResponse(storage, 'c', 'fp' + i, { i }, 3);
  const list = JSON.parse(storage.raw.get('c'));
  assert.equal(list.length, 3);
  assert.equal(list[0].fp, 'fp4');
  setCachedResponse(storage, 'c', 'fp4', { i: 99 }, 3);
  assert.deepEqual(getCachedResponse(storage, 'c', 'fp4'), { i: 99 });
  assert.equal(JSON.parse(storage.raw.get('c')).filter(x => x.fp === 'fp4').length, 1);
});

// -------------------------------------------------------------- isQuotaError
test('isQuotaError: detects quota-family messages', async () => {
  const { isQuotaError } = await load();
  for (const m of ['Quota exceeded', 'RATE LIMIT', 'RESOURCE_EXHAUSTED', 'billing issue', 'limit: 0']) {
    assert.equal(isQuotaError(new Error(m)), true, m);
  }
  assert.equal(isQuotaError(new Error('network down')), false);
  assert.equal(isQuotaError(null), false);
});

// ----------------------------------------------------------- normalizeMathExpr
test('normalizeMathExpr: width / latex / inequality / prefix', async () => {
  const { normalizeMathExpr } = await load();
  assert.equal(normalizeMathExpr('１２＋３'), '12+3');
  assert.equal(normalizeMathExpr('\\frac{1}{2}'), '1/2');
  assert.equal(normalizeMathExpr('\\sqrt{3}'), 'sqrt(3)');
  assert.equal(normalizeMathExpr('x≦3'), 'x<=3');
  assert.equal(normalizeMathExpr('x＝２'), 'x=2');
  assert.equal(normalizeMathExpr('答え: x = 2'), 'x=2');
  assert.equal(normalizeMathExpr('  $x^2$  '), 'x^2');
  assert.equal(normalizeMathExpr(null), '');
  assert.equal(normalizeMathExpr('(x+2)(2x-1)'), normalizeMathExpr('(2x-1)(x+2)'));
});

// ----------------------------------------------------------- isLocalMathMatch
test('isLocalMathMatch: solution sets and inequalities', async () => {
  const { isLocalMathMatch } = await load();
  assert.equal(isLocalMathMatch('x=2,3', ['x=3,2']), true);
  assert.equal(isLocalMathMatch('2,3', ['x=2,3']), true);
  assert.equal(isLocalMathMatch('3>=y>=-3', ['-3<=y<=3']), true);
  assert.equal(isLocalMathMatch('x=5', ['x=2,3']), false);
  assert.equal(isLocalMathMatch('', ['x=2']), false);
});

// ------------------------------------------------------------- transport (stub)
test('callGeminiModel: structured request returns parsed fixture', async () => {
  const { callGeminiModel } = await load();
  stub.reset();
  const uninstall = stub.install();
  try {
    const schema = { type: 'object', properties: { problems: { type: 'array' } } };
    const data = await callGeminiModel('gemini-3.8-flash', 'KEY', 'prompt', null, { schema });
    assert.ok(data && typeof data === 'object');
    assert.ok(Array.isArray(data.problems), 'fixture math-solve-2problems');
    assert.equal(stub.counters.total, 1);
  } finally {
    uninstall();
  }
});

test('callGeminiModel: sends responseSchema and omits it when rawText', async () => {
  const { callGeminiModel } = await load();
  const seen = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push(JSON.parse(init.body));
    const text = seen.length === 1 ? '{"a":1}' : 'plain text';
    return jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
  };
  try {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    await callGeminiModel('m', 'K', 'p', null, { schema });
    assert.equal(seen[0].generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(seen[0].generationConfig.responseSchema, schema);
    assert.equal(seen[0].generationConfig.maxOutputTokens, 32768);

    const text = await callGeminiModel('m', 'K', 'p', null, { rawText: true });
    assert.equal(text, 'plain text');
    assert.equal(seen[1].generationConfig.responseSchema, undefined);
    assert.equal(seen[1].generationConfig.responseMimeType, undefined);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: object form and image part', async () => {
  const { callGeminiModel } = await load();
  let body = null;
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  try {
    const out = await callGeminiModel({ modelId: 'models/gemini-3.8-flash', apiKey: 'K', promptText: 'p', imageBase64: 'IMG' });
    assert.deepEqual(out, { ok: true });
    assert.equal(body.contents[0].parts.length, 2);
    assert.equal(body.contents[0].parts[1].inline_data.data, 'IMG');
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: missing key / http error / schema fallback / empty', async () => {
  const { callGeminiModel } = await load();
  await assert.rejects(() => callGeminiModel('m', '', 'p', null, {}), /APIキー/);

  const prev = globalThis.fetch;
  let calls = 0;
  try {
    // 429
    globalThis.fetch = async () => { calls++; return jsonResponse({ error: { message: 'quota exceeded' } }, 429); };
    await assert.rejects(async () => {
      try { await callGeminiModel('m', 'K', 'p', null, {}); } catch (e) { assert.equal(e.status, 429); throw e; }
    }, /quota exceeded/);

    // 400 schema 미지원 → 1회 재시도(스키마 없이)
    calls = 0;
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      calls++;
      bodies.push(JSON.parse(init.body));
      if (calls === 1) return jsonResponse({ error: { message: 'responseSchema is not supported' } }, 400);
      return jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":1}' }] } }] });
    };
    const out = await callGeminiModel('m', 'K', 'p', null, { schema: { type: 'object' } });
    assert.deepEqual(out, { ok: 1 });
    assert.equal(calls, 2);
    assert.equal(bodies[1].generationConfig.responseSchema, undefined);

    // 빈 응답 (blockReason / finishReason)
    globalThis.fetch = async () => jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] });
    await assert.rejects(() => callGeminiModel('m', 'K', 'p', null, {}), /中断しました/);

    // 후보 자체가 없음
    globalThis.fetch = async () => jsonResponse({});
    await assert.rejects(() => callGeminiModel('m', 'K', 'p', null, {}), /空の応答/);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: timeout aborts', async () => {
  const { callGeminiModel } = await load();
  const prev = globalThis.fetch;
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  try {
    await assert.rejects(() => callGeminiModel('m', 'K', 'p', null, { timeoutMs: 20 }), (e) => e.name === 'AbortError');
  } finally {
    globalThis.fetch = prev;
  }
});

// ------------------------------------------------------- fetchAvailableModels
test('fetchAvailableModels: filters and sorts', async () => {
  const { fetchAvailableModels } = await load();
  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    models: [
      { name: 'models/gemini-3.8-pro', displayName: 'Pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-tts', supportedGenerationMethods: ['generateContent'] }
    ]
  });
  try {
    const models = await fetchAvailableModels('KEY');
    assert.deepEqual(models, [
      { id: 'gemini-3.8-flash', displayName: 'Flash' },
      { id: 'gemini-3.8-pro', displayName: 'Pro' }
    ]);
    await assert.rejects(() => fetchAvailableModels(''), /APIキー/);
  } finally {
    globalThis.fetch = prev;
  }
});

test('fetchAvailableModels: works through the offline stub', async () => {
  stub.reset();
  const uninstall = stub.install();
  try {
    const { fetchAvailableModels } = await load();
    const models = await fetchAvailableModels({ apiKey: 'KEY' });
    assert.equal(models.length, 1);
    assert.equal(models[0].id, 'gemini-3.8-flash');
    assert.equal(stub.counters.byFixture.models, 1);
  } finally {
    uninstall();
  }
});
