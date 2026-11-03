// tests/e2e/errors.spec.js — Phase 7-5-C: API 오류 UX (401/402/429/504) E2E 테스트
const { test, expect } = require('@playwright/test');
const path = require('path');
const { stubGemini, collectErrors, bootApp } = require('./helpers');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

const MOCK_API_WORKER = '**/ai-math-tutor-api*.g4pjo75.workers.dev/**';

function stubWorker(page, {
  redeemStatus = 200,
  redeemBody = { ok: true, status: 'active', plan: 'standard', quota: { used: 0, limit: 300 } },
  solveStatus = 200,
  solveBody = { ok: true, data: stub.FIXTURES['math-solve-2problems'], cached: false, quota: { used: 1, limit: 300 } },
  meStatus = 200,
  meBody = { ok: true, status: 'active', plan: 'standard', quota: { used: 0, limit: 300 } }
} = {}) {
  const calls = { redeem: [], solve: [], me: [] };

  page.route(MOCK_API_WORKER, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes('/v1/redeem') && method === 'POST') {
      calls.redeem.push(req.postDataJSON ? req.postDataJSON() : {});
      return route.fulfill({
        status: redeemStatus,
        contentType: 'application/json',
        body: JSON.stringify(redeemBody)
      });
    }

    if (url.includes('/v1/solve') && method === 'POST') {
      calls.solve.push(req.postDataJSON ? req.postDataJSON() : {});
      return route.fulfill({
        status: solveStatus,
        contentType: 'application/json',
        body: JSON.stringify(solveBody)
      });
    }

    if (url.includes('/v1/me') && method === 'GET') {
      calls.me.push({});
      return route.fulfill({
        status: meStatus,
        contentType: 'application/json',
        body: JSON.stringify(meBody)
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  return calls;
}

test.describe('Phase 7-5-C: API 오류 UX (401/402/429/504)', () => {

  test('1. 수학 라이선스 + 402 license_canceled → 포털 CTA, 모델 버튼 0', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    const workerCalls = stubWorker(page, {
      solveStatus: 402,
      solveBody: { ok: false, error: 'license_canceled' }
    });

    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'device-matched-uuid');
      localStorage.setItem('tutor_license_device_id', 'device-matched-uuid');
    });

    await bootApp(page, 'math', { apiKey: '' });

    await page.fill('#questionInput', '2x + 4 = 10');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#statusBox')).toBeVisible();
    await expect(page.locator('#statusBox [data-action="license-portal"]')).toBeVisible();
    expect(await page.locator('#statusBox [data-model]').count()).toBe(0);
    const text = await page.textContent('#statusBox');
    expect(text).toContain('サブスクリプションが終了しています');
    expect(workerCalls.solve.length).toBe(1);

    const cspErrors = errors.filter(e => /Content Security Policy|CSP/i.test(e));
    expect(cspErrors).toEqual([]);
  });

  test('2. 수학 라이선스 + 429 rate_limited → 재시도 CTA, quota 문구/모델 버튼 0', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    stubWorker(page, {
      solveStatus: 429,
      solveBody: { ok: false, error: 'rate_limited' }
    });

    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'device-matched-uuid');
      localStorage.setItem('tutor_license_device_id', 'device-matched-uuid');
    });

    await bootApp(page, 'math', { apiKey: '' });

    await page.fill('#questionInput', '2x + 4 = 10');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#statusBox')).toContainText('リクエストが多すぎます', { timeout: 15000 });
    await expect(page.locator('#statusBox [data-action="solve"]')).toBeVisible();
    expect(await page.locator('#statusBox [data-model]').count()).toBe(0);

    const text = await page.textContent('#statusBox');
    expect(text).not.toContain('今月の利用上限');
    expect(text).not.toContain('無料枠が上限に達しました');

    const cspErrors = errors.filter(e => /Content Security Policy|CSP/i.test(e));
    expect(cspErrors).toEqual([]);
  });

  test('3. 수학 라이선스 + 403 device_not_bound → 설정 CTA', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    stubWorker(page, {
      solveStatus: 403,
      solveBody: { ok: false, error: 'device_not_bound' }
    });

    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'device-matched-uuid');
      localStorage.setItem('tutor_license_device_id', 'device-matched-uuid');
    });

    await bootApp(page, 'math', { apiKey: '' });

    await page.fill('#questionInput', '2x + 4 = 10');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#statusBox')).toBeVisible();
    await expect(page.locator('#statusBox [data-action="open-settings"]')).toBeVisible();
    const text = await page.textContent('#statusBox');
    expect(text).toContain('登録されていません');

    const cspErrors = errors.filter(e => /Content Security Policy|CSP/i.test(e));
    expect(cspErrors).toEqual([]);
  });

  test('4. 수학 라이선스 + 504 timeout → 재시도 CTA', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    stubWorker(page, {
      solveStatus: 504,
      solveBody: { ok: false, error: 'timeout' }
    });

    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'device-matched-uuid');
      localStorage.setItem('tutor_license_device_id', 'device-matched-uuid');
    });

    await bootApp(page, 'math', { apiKey: '' });

    await page.fill('#questionInput', '2x + 4 = 10');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#statusBox')).toContainText('タイムアウトしました', { timeout: 15000 });
    await expect(page.locator('#statusBox [data-action="solve"]')).toBeVisible();

    const cspErrors = errors.filter(e => /Content Security Policy|CSP/i.test(e));
    expect(cspErrors).toEqual([]);
  });

  test('5. 수학 BYOK + quota → 기존 모델 전환 버튼 유지', async ({ page }) => {
    const errors = collectErrors(page);
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({
          json: {
            models: [
              { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] }
            ]
          }
        });
      }
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Resource has been exhausted (e.g. check quota).'
          }
        })
      });
    });

    await bootApp(page, 'math', { apiKey: 'AIzaTestQuotaKey' });

    // 모델 셀렉트에 대안 모델 추가하여 otherModels가 채워지도록 설정
    await page.evaluate(() => {
      const sel = document.getElementById('modelSelect');
      if (sel && !sel.querySelector('option[value="gemini-2.5-flash"]')) {
        const opt = document.createElement('option');
        opt.value = 'gemini-2.5-flash';
        opt.textContent = 'gemini-2.5-flash';
        sel.appendChild(opt);
      }
    });

    await page.fill('#questionInput', '2x + 4 = 10');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#statusBox')).toContainText('無料枠が上限に達しました', { timeout: 15000 });
    const modelButtons = page.locator('#statusBox [data-model]');
    expect(await modelButtons.count()).toBeGreaterThan(0);

    const cspErrors = errors.filter(e => /Content Security Policy|CSP/i.test(e));
    expect(cspErrors).toEqual([]);
  });

  test('6. 영어 라이선스 + 402 license_past_due → 포털 CTA', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    const workerCalls = stubWorker(page, {
      solveStatus: 402,
      solveBody: { ok: false, error: 'license_past_due' }
    });

    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'device-matched-uuid');
      localStorage.setItem('tutor_license_device_id', 'device-matched-uuid');
    });

    await bootApp(page, 'english', { apiKey: '' });

    await page.fill('#questionInput', 'He runs fast every morning.');
    await page.click('[data-action="analyze"]');

    await expect(page.locator('#statusBox')).toBeVisible();
    await expect(page.locator('#statusBox [data-action="license-portal"]')).toBeVisible();
    const text = await page.textContent('#statusBox');
    expect(text).toContain('お支払いに問題があります');
    expect(workerCalls.solve.length).toBe(1);

    const cspErrors = errors.filter(e => /Content Security Policy|CSP/i.test(e));
    expect(cspErrors).toEqual([]);
  });

});
