const test = require('node:test');
const assert = require('node:assert/strict');

const loadSchema = () => import('../math/schema.js');

test('schema: TUTOR_RESPONSE_SCHEMA has_more_problems field and required', async () => {
  const { TUTOR_RESPONSE_SCHEMA } = await loadSchema();
  assert.ok(TUTOR_RESPONSE_SCHEMA.properties.has_more_problems);
  assert.equal(TUTOR_RESPONSE_SCHEMA.properties.has_more_problems.type, 'BOOLEAN');
  assert.ok(TUTOR_RESPONSE_SCHEMA.required.includes('has_more_problems'));
  assert.ok(TUTOR_RESPONSE_SCHEMA.propertyOrdering.includes('has_more_problems'));
});

test('schema: buildSystemPrompt contains 2-problem limit rules', async () => {
  const { buildSystemPrompt } = await loadSchema();
  const prompt = buildSystemPrompt('2次関数');
  assert.ok(prompt.includes('最大2問'));
  assert.ok(prompt.includes('has_more_problems'));
  assert.ok(!prompt.includes('絶対に1つだけを選んで省略しない'));
});
