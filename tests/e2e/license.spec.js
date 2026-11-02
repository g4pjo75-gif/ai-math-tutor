// tests/e2e/license.spec.js — Phase 7-5-B: 라이선스 모드 E2E 테스트
const { test, expect } = require('@playwright/test');
const path = require('path');
const { stubGemini, collectErrors, bootApp } = require('./helpers');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

const MOCK_API_WORKER = '**/ai-math-tutor-api.g4pjo75.workers.dev/**';
const TEST_KEY = 'AMT-AAAA-BBBB-CCCC-DDDD';

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

test.describe('license: E2E 활성화 및 프록시 전환', () => {

  test('1. 저장 → redeem 성공 → solve가 /v1/solve로 감, Gemini 직접 호출 0', async ({ page }) => {
    const geminiCalls = await stubGemini(page);
    const workerCalls = stubWorker(page);

    await bootApp(page, 'math', { apiKey: '' });

    // 설정 열고 라이선스 키 입력
    await page.click('[data-action="open-settings"]');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.locator('#licenseKeyInput')).toHaveAttribute('type', 'password');

    await page.fill('#licenseKeyInput', 'amt-aaaa-bbbb-cccc-dddd');
    await page.click('[data-action="save-settings"]');

    // 성공 시 모달 닫힘
    await expect(page.locator('#settingsModal')).toBeHidden();

    // 문제 해결 요청
    await page.fill('#questionInput', '2x + 4 = 10');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#resultSection')).toBeVisible({ timeout: 15000 });

    // Gemini 직접 호출은 0회, 프록시 /v1/solve 호출 1회 확인
    expect(geminiCalls.length).toBe(0);
    expect(workerCalls.redeem.length).toBe(1);
    expect(workerCalls.solve.length).toBe(1);
  });

  test('2. 저장 실패 → 모달 유지, 키 저장 안 됨', async ({ page }) => {
    const geminiCalls = await stubGemini(page);
    stubWorker(page, {
      redeemStatus: 403,
      redeemBody: { ok: false, error: 'device_limit' }
    });

    await bootApp(page, 'math', { apiKey: 'AIzaOldKey' });

    await page.click('[data-action="open-settings"]');
    await expect(page.locator('#settingsModal')).toBeVisible();

    await page.fill('#geminiKeyInput', 'AIzaNewKey');
    await page.fill('#licenseKeyInput', TEST_KEY);
    await page.click('[data-action="save-settings"]');

    // 실패 시 모달이 닫히지 않고 오류 인라인 표시
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.locator('#licenseStatus')).toContainText('上限');

    // BYOK 수정분은 저장되고 라이선스 키는 저장되지 않음
    expect(await page.evaluate(() => localStorage.getItem('tutor_gemini_api_key')))
      .toBe('AIzaNewKey');
    expect(await page.evaluate(() => localStorage.getItem('tutor_license_key'))).toBeNull();
  });

  test('3. 재접속 시 redeem 재호출 없음', async ({ page }) => {
    const workerCalls = stubWorker(page);

    // 기기 ID와 바인딩된 기기 ID가 일치하는 정상 라이선스 상태 사전 주입
    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'device-matched-uuid');
      localStorage.setItem('tutor_license_device_id', 'device-matched-uuid');
    });

    await bootApp(page, 'math', { apiKey: '' });

    // 재접속 시 redeem 호출이 없어야 함
    expect(workerCalls.redeem.length).toBe(0);

    // 라이선스 경고 배너가 숨겨지고 모델 선택 드롭다운도 숨겨짐
    await expect(page.locator('#licenseWarningBanner')).toBeHidden();
    await expect(page.locator('#modelSelect')).toBeHidden();
  });

  test('4. 기기 미등록 → 배너/CTA + solve 403 device_not_bound', async ({ page }) => {
    stubWorker(page, {
      solveStatus: 403,
      solveBody: { ok: false, error: 'device_not_bound' }
    });

    // 기기 ID 불일치 상태 (다른 기기에서 발급된 라이선스)
    await page.addInitScript(() => {
      localStorage.setItem('tutor_license_key', 'AMT-AAAA-BBBB-CCCC-DDDD');
      localStorage.setItem('tutor_device_id', 'new-local-device-id');
      localStorage.setItem('tutor_license_device_id', 'old-bound-device-id');
    });

    await bootApp(page, 'math', { apiKey: '' });

    // 재인증 배너 노출 확인
    await expect(page.locator('#licenseWarningBanner')).toBeVisible();

    // 풀이 시도 시 403 오류 상태 표시
    await page.fill('#questionInput', 'x^2 = 4');
    await page.click('[data-action="solve"]');

    await expect(page.locator('#statusBox')).toBeVisible();
    const statusText = await page.textContent('#statusBox');
    expect(statusText).toContain('登録されていません');

    // 배너 CTA 클릭 시 설정 모달 열림
    await page.click('#licenseWarningBanner [data-action="open-settings"]');
    await expect(page.locator('#settingsModal')).toBeVisible();
  });

  test('5. 모델 UI hide/restore', async ({ page }) => {
    const geminiCalls = await stubGemini(page);
    stubWorker(page);

    await bootApp(page, 'math', { apiKey: 'AIzaFakeKey' });

    // BYOK 모드: modelSelect 노출
    await expect(page.locator('#modelSelect')).toBeVisible();

    // 라이선스 등록
    await page.click('[data-action="open-settings"]');
    await expect(page.locator('#licenseKeyInput')).toHaveAttribute('type', 'password');
    await page.fill('#licenseKeyInput', TEST_KEY);
    await page.click('[data-action="save-settings"]');
    await expect(page.locator('#settingsModal')).toBeHidden();

    // 라이선스 모드: modelSelect 숨김
    await expect(page.locator('#modelSelect')).toBeHidden();

    // 라이선스 해제
    await page.click('[data-action="open-settings"]');
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('[data-action="license-clear"]');
    await page.click('[data-action="close-settings"]');

    // BYOK 복귀: modelSelect 다시 노출
    await expect(page.locator('#modelSelect')).toBeVisible();
  });

  test('6. CSP 위반/콘솔 에러 0 + BYOK 데이터 보존', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    stubWorker(page);

    const BYOK_KEY = 'AIzaSySavedByokKeyForTest';
    await page.addInitScript((k) => {
      localStorage.setItem('tutor_gemini_api_key', k);
      localStorage.setItem('tutor_custom_model_id', 'gemini-3.8-pro');
    }, BYOK_KEY);

    await bootApp(page, 'math', { apiKey: BYOK_KEY });

    // 라이선스 키 등록 시 #geminiKeyInput 수정분을 함께 저장
    await page.click('[data-action="open-settings"]');
    await page.fill('#geminiKeyInput', BYOK_KEY + '-updated');
    await page.fill('#licenseKeyInput', TEST_KEY);
    await page.click('[data-action="save-settings"]');
    await expect(page.locator('#settingsModal')).toBeHidden();

    // 라이선스 모드에서도 BYOK 수정분이 스토리지에 유지되는지 확인
    expect(await page.evaluate(() => localStorage.getItem('tutor_gemini_api_key')))
      .toBe(BYOK_KEY + '-updated');

    // 라이선스 해제 후 설정창 열기
    await page.click('[data-action="open-settings"]');
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('[data-action="license-clear"]');

    // BYOK 입력창에 수정된 키 복원 확인
    const inputVal = await page.inputValue('#geminiKeyInput');
    expect(inputVal).toBe(BYOK_KEY + '-updated');
    await page.click('[data-action="close-settings"]');

    // 콘솔/CSP 오류 0개 검증
    expect(errors).toEqual([]);
  });

});
