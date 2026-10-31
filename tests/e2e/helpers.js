// tests/e2e/helpers.js — 공통 헬퍼 (Playwright, CJS)
const path = require('path');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

/**
 * Gemini API를 fixture로 대체한다. 반환값은 호출 기록 배열.
 * - GET  /v1beta/models  -> 모델 1개
 * - POST ...:generateContent -> schema로 fixture 선택 (stub-gemini.js 재사용)
 */
async function stubGemini(page) {
  const calls = [];
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        json: {
          models: [{
            name: 'models/gemini-3.8-flash',
            displayName: 'Gemini 3.8 Flash',
            supportedGenerationMethods: ['generateContent']
          }]
        }
      });
    }
    const body = req.postData();
    calls.push(body);
    const key = stub.pickFixture(req.url(), { method: 'POST', body });
    const fixture = stub.FIXTURES[key];
    if (!fixture) throw new Error('e2e: no fixture for ' + key);
    return route.fulfill({ json: stub.envelope(fixture) });
  });
  return calls;
}

/** 콘솔 에러/페이지 에러 수집 */
function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err && err.message || err)));
  return errors;
}

async function bootApp(page, app, { apiKey = 'TEST_KEY' } = {}) {
  await page.addInitScript((key) => {
    if (key) localStorage.setItem('tutor_gemini_api_key', key);
  }, apiKey);
  await page.goto(`/${app}/`);
  await unlock(page);
}

async function unlock(page) {
  const pin = page.locator('#pinInput');
  if (await pin.isVisible().catch(() => false)) {
    await pin.fill('1234');
    await page.click('[data-action="unlock"]');
    await page.waitForFunction(() => {
      const m = document.getElementById('pinModal');
      return !m || m.style.display === 'none';
    });
  }
}

async function solveMath(page, question) {
  await page.fill('#questionInput', question);
  await page.click('[data-action="solve"]');
  await page.locator('#resultSection').waitFor({ state: 'visible', timeout: 20000 });
}

async function analyzeEnglish(page, text) {
  await page.fill('#questionInput', text);
  await page.click('[data-action="analyze"]');
  await page.locator('#resultSection').waitFor({ state: 'visible', timeout: 20000 });
}

module.exports = { stubGemini, collectErrors, bootApp, unlock, solveMath, analyzeEnglish };
