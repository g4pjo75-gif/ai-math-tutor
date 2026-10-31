// tests/selftest.js
// Self-test for Phase 0 fixtures and Gemini stub
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const stub = require('./stub-gemini.js');

console.log('=== Running Phase 0 Baseline Selftest ===');

// 1. Check all 8 fixtures exist and are valid JSON
const EXPECTED_FIXTURE_KEYS = [
  'math-solve-2problems',
  'math-quiz',
  'math-simplify',
  'math-overall-chat',
  'math-step-chat',
  'english-reading',
  'english-quiz',
  'english-writing'
];

assert.strictEqual(stub.fixtures.length, 8, 'Expected exactly 8 fixtures loaded');
for (const key of EXPECTED_FIXTURE_KEYS) {
  assert.ok(stub.FIXTURES[key], `Fixture [${key}] must be loaded`);
}
console.log('✔ [1/4] All 8 fixture files loaded and parsed successfully.');

// 2. Validate required fields for each fixture
const REQUIRED_FIELDS = {
  'math-solve-2problems': ['problems'],
  'math-quiz': ['problem', 'choices', 'correct_index', 'answer', 'hint', 'explanation'],
  'math-simplify': ['title', 'display_math', 'speech_ja'],
  'math-overall-chat': ['method_name', 'answer', 'comparison_note', 'speech_ja'],
  'math-step-chat': ['answer', 'speech_ja'],
  'english-reading': ['passage_en', 'translation_ja', 'twin_quiz'],
  'english-quiz': ['question_en', 'translation_ja', 'choices', 'correct_index', 'choice_feedback', 'explanation'],
  'english-writing': ['score', 'corrected_text', 'grammar_fixes', 'praise_and_advice']
};

for (const [key, reqFields] of Object.entries(REQUIRED_FIELDS)) {
  const data = stub.FIXTURES[key];
  for (const field of reqFields) {
    assert.ok(data[field] !== undefined, `Fixture [${key}] must contain field [${field}]`);
  }
}

// Special check for math-solve-2problems: must contain 2 problems for tab switching test
assert.strictEqual(stub.FIXTURES['math-solve-2problems'].problems.length, 2, 'math-solve-2problems must have 2 problems');
console.log('✔ [2/4] All fixtures contain schema-required fields.');

// 3. Test pickFixture discrimination across all schemas
const TEST_SCHEMAS = [
  { expected: 'math-solve-2problems', props: { problems: {} } },
  { expected: 'english-reading', props: { passage_en: {}, translation_ja: {}, twin_quiz: {} } },
  { expected: 'english-writing', props: { score: {}, corrected_text: {}, grammar_fixes: {} } },
  { expected: 'math-overall-chat', props: { method_name: {}, answer: {}, comparison_note: {} } },
  { expected: 'math-quiz', props: { problem: {}, choices: {}, wrong_hint: {} } },
  { expected: 'english-quiz', props: { question_en: {}, choices: {}, correct_index: {} } },
  { expected: 'math-simplify', props: { title: {}, display_math: {}, speech_ja: {} } },
  { expected: 'math-step-chat', props: { answer: {}, speech_ja: {} } }
];

for (const item of TEST_SCHEMAS) {
  const reqBody = {
    contents: [{ parts: [{ text: 'test prompt' }] }],
    generationConfig: {
      responseSchema: {
        properties: item.props
      }
    }
  };
  const picked = stub.pickFixture('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=fake', {
    method: 'POST',
    body: JSON.stringify(reqBody)
  });
  assert.strictEqual(picked, item.expected, `pickFixture misclassified schema: expected [${item.expected}], got [${picked}]`);
}

// Verify unhandled schema throws error (no silent pass)
assert.throws(() => {
  stub.pickFixture('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=fake', {
    method: 'POST',
    body: JSON.stringify({ generationConfig: { responseSchema: { properties: { unknown_key: {} } } } })
  });
}, /stub: unhandled schema/, 'pickFixture must throw on unhandled schema');
console.log('✔ [3/4] pickFixture() discriminated all 8 fixtures accurately with 0 misclassifications.');

// 4. Test fetch stubbing and counter
async function testStubExecution() {
  stub.reset();
  assert.strictEqual(stub.counters.total, 0);

  const uninstall = stub.install();
  try {
    const res = await globalThis.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=fake', {
      method: 'POST',
      body: JSON.stringify({
        generationConfig: {
          responseSchema: {
            properties: { problems: {} }
          }
        }
      })
    });
    const json = await res.json();
    assert.strictEqual(stub.counters.total, 1);
    assert.strictEqual(stub.counters.byFixture['math-solve-2problems'], 1);
    assert.ok(json.candidates && json.candidates[0].content.parts[0].text, 'Envelope structure valid');
    const parsedInner = JSON.parse(json.candidates[0].content.parts[0].text);
    assert.strictEqual(parsedInner.problems.length, 2);
  } finally {
    uninstall();
  }
  console.log('✔ [4/4] Stub installation, fetch interception, envelope wrapping, and counters verified.');
}

testStubExecution().then(() => {
  console.log('\n🎉 Phase 0 Selftest PASSED completely!');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Phase 0 Selftest FAILED:', err);
  process.exit(1);
});
