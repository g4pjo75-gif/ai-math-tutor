// server/test/validate.test.js — /v1/solve 입력 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSolveBody, LIMITS } from '../src/validate.js';

test('기본값: temperature .35, tokens 32768, timeout 30000', () => {
  const r = validateSolveBody({ prompt: 'x^2 を因数分解して' });
  assert.equal(r.ok, true);
  assert.equal(r.value.temperature, 0.35);
  assert.equal(r.value.maxOutputTokens, 32768);
  assert.equal(r.value.timeoutMs, 30000);
  assert.equal(r.value.image, null);
  assert.equal(r.value.schema, null);
});

test('클램프: 범위를 벗어난 값은 잘라낸다', () => {
  const r = validateSolveBody({
    prompt: 'p',
    temperature: 9,
    maxOutputTokens: 999999,
    timeoutMs: 1
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.temperature, 1);
  assert.equal(r.value.maxOutputTokens, LIMITS.maxOutputTokens);
  assert.equal(r.value.timeoutMs, 5000);
});

test('prompt 없음/공백 → invalid_prompt', () => {
  assert.equal(validateSolveBody({}).ok, false);
  assert.equal(validateSolveBody({ prompt: '   ' }).error, 'invalid_prompt');
  assert.equal(validateSolveBody(null).error, 'invalid_request');
});

test('prompt 길이 초과 → prompt_too_large', () => {
  const r = validateSolveBody({ prompt: 'a'.repeat(LIMITS.promptChars + 1) });
  assert.equal(r.error, 'prompt_too_large');
});

test('image: 빈 문자열은 null, 잘못된 문자는 거부', () => {
  assert.equal(validateSolveBody({ prompt: 'p', image: '   ' }).value.image, null);
  assert.equal(validateSolveBody({ prompt: 'p', image: '!!!' }).error, 'invalid_image');
  assert.equal(validateSolveBody({ prompt: 'p', image: 'AAAA' }).value.image, 'AAAA');
});

test('image 크기 초과 → image_too_large', () => {
  const r = validateSolveBody({ prompt: 'p', image: 'A'.repeat(LIMITS.imageBase64Chars + 1) });
  assert.equal(r.error, 'image_too_large');
});

test('schema: 배열/원시값 거부, 크기 초과 거부', () => {
  assert.equal(validateSolveBody({ prompt: 'p', schema: [] }).error, 'invalid_schema');
  assert.equal(validateSolveBody({ prompt: 'p', schema: 'x' }).error, 'invalid_schema');
  const big = { type: 'object', description: 'a'.repeat(LIMITS.schemaJsonChars) };
  assert.equal(validateSolveBody({ prompt: 'p', schema: big }).error, 'schema_too_large');
  assert.equal(validateSolveBody({ prompt: 'p', schema: { type: 'object' } }).ok, true);
});

test('rawText는 true일 때만 true', () => {
  assert.equal(validateSolveBody({ prompt: 'p', rawText: true }).value.rawText, true);
  assert.equal(validateSolveBody({ prompt: 'p', rawText: 'yes' }).value.rawText, false);
});
