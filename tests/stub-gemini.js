// tests/stub-gemini.js
// Gemini API Mock / Stub for offline testing and CI verification
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const FIXTURE_FILES = {
  'math-solve-2problems': 'math-solve-2problems.json',
  'math-quiz': 'math-quiz.json',
  'math-judge': 'math-judge.json',
  'math-simplify': 'math-simplify.json',
  'math-overall-chat': 'math-overall-chat.json',
  'math-step-chat': 'math-step-chat.json',
  'english-reading': 'english-reading.json',
  'english-quiz': 'english-quiz.json',
  'english-writing': 'english-writing.json'
};

const FIXTURES = {};
for (const [key, filename] of Object.entries(FIXTURE_FILES)) {
  const filePath = path.join(FIXTURES_DIR, filename);
  if (fs.existsSync(filePath)) {
    FIXTURES[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
}

const counters = {
  total: 0,
  byFixture: {}
};

function reset() {
  counters.total = 0;
  counters.byFixture = {};
}

function envelope(fixture) {
  return {
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify(fixture) }] }
    }],
    usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 900, totalTokenCount: 2700 }
  };
}

/**
 * Identify fixture based on request URL and payload schema properties
 * @param {string|Request} urlOrReq
 * @param {object} [options]
 * @returns {string} fixture key
 */
function pickFixture(urlOrReq, options = {}) {
  const url = typeof urlOrReq === 'string' ? urlOrReq : urlOrReq?.url || '';
  const method = (options.method || (typeof urlOrReq === 'object' ? urlOrReq.method : 'GET') || 'GET').toUpperCase();

  // 0. GET models request
  if (url.includes('/v1beta/models') && method === 'GET') {
    return 'models';
  }

  // Parse body
  let body = options.body;
  if (!body && typeof urlOrReq === 'object' && urlOrReq.body) {
    body = urlOrReq.body;
  }
  let parsed = null;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch (_) {}
  } else if (typeof body === 'object' && body !== null) {
    parsed = body;
  }

  // Allow passing raw schema or properties directly in tests
  let props = parsed?.generationConfig?.responseSchema?.properties;
  if (!props && parsed?.properties) {
    props = parsed.properties;
  }
  if (!props && parsed && typeof parsed === 'object') {
    props = parsed;
  }
  props = props || {};

  // Schema matching precedence table (docs/RESTRUCTURE_PLAN_v2.2.md 4.0-B)
  if (props.problems) {
    return 'math-solve-2problems';
  }
  if (props.passage_en) {
    return 'english-reading';
  }
  if (props.score) {
    return 'english-writing';
  }
  if (props.method_name) {
    return 'math-overall-chat';
  }
  if (props.is_correct) {
    return 'math-judge';
  }
  // Math quiz: characterized by wrong_hint or problem + choices
  if (props.wrong_hint || (props.problem && props.choices)) {
    return 'math-quiz';
  }
  // English quiz: characterized by question_en without wrong_hint
  if (props.question_en) {
    return 'english-quiz';
  }
  if (props.display_math) {
    return 'math-simplify';
  }
  if (props.answer && props.speech_ja) {
    return 'math-step-chat';
  }

  const keys = Object.keys(props).join(',');
  throw new Error('stub: unhandled schema [' + keys + ']');
}

const originalFetch = globalThis.fetch;

function install() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async function stubbedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('generativelanguage.googleapis.com')) {
      if (typeof previousFetch === 'function') {
        return previousFetch.apply(this, arguments);
      }
      throw new Error(`fetch unhandled non-gemini url: ${url}`);
    }

    const fixtureKey = pickFixture(input, init);
    counters.total++;
    counters.byFixture[fixtureKey] = (counters.byFixture[fixtureKey] || 0) + 1;

    if (fixtureKey === 'models') {
      const modelsData = {
        models: [{
          name: 'models/gemini-3.8-flash',
          displayName: 'Gemini 3.8 Flash',
          supportedGenerationMethods: ['generateContent']
        }]
      };
      return new Response(JSON.stringify(modelsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (fixtureKey === 'math-judge') {
      const judgeData = FIXTURES['math-judge'] || {
        is_correct: true,
        judgement_title: '正解',
        comment: 'よくできました。',
        correct_answer: '$x=3,\\ 4$',
        speech_ja: '正解です。'
      };
      return new Response(JSON.stringify(envelope(judgeData)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const fixtureData = FIXTURES[fixtureKey];
    if (!fixtureData) {
      throw new Error(`stub: missing fixture data for key [${fixtureKey}]`);
    }

    return new Response(JSON.stringify(envelope(fixtureData)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  return function uninstall() {
    globalThis.fetch = previousFetch;
  };
}

module.exports = {
  FIXTURES,
  get fixtures() {
    return Object.values(FIXTURES);
  },
  pickFixture,
  envelope,
  install,
  reset,
  counters
};
