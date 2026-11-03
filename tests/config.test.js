// tests/config.test.js — 환경별 API base 결정 검증 (Phase 7-6-0)
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../shared/config.js');

test('resolveApiBase: localhost maps to staging', async () => {
  const { resolveApiBase, STAGING_API_BASE } = await load();
  assert.equal(resolveApiBase('localhost'), STAGING_API_BASE);
  assert.equal(resolveApiBase('LOCALHOST'), STAGING_API_BASE);
});

test('resolveApiBase: 127.0.0.1 maps to staging', async () => {
  const { resolveApiBase, STAGING_API_BASE } = await load();
  assert.equal(resolveApiBase('127.0.0.1'), STAGING_API_BASE);
});

test('resolveApiBase: staging hosts and pages.dev map to staging', async () => {
  const { resolveApiBase, STAGING_API_BASE } = await load();
  assert.equal(resolveApiBase('ai-math-tutor-staging.g4pjo75.workers.dev'), STAGING_API_BASE);
  assert.equal(resolveApiBase('preview.ai-math-tutor.pages.dev'), STAGING_API_BASE);
  assert.equal(resolveApiBase('my-branch.pages.dev'), STAGING_API_BASE);
});

test('resolveApiBase: production hosts map to production', async () => {
  const { resolveApiBase, PROD_API_BASE } = await load();
  assert.equal(resolveApiBase('g4pjo75-gif.github.io'), PROD_API_BASE);
  assert.equal(resolveApiBase('ai-math-tutor.com'), PROD_API_BASE);
  assert.equal(resolveApiBase(''), PROD_API_BASE);
  assert.equal(resolveApiBase(null), PROD_API_BASE);
});
