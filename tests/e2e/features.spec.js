const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('features: 기능 커버리지', () => {
  test('math: 전체 Q&A 응답이 로그에 남는다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const before = calls.length;

    await page.fill('#overallChatInput', '別解はありますか？');
    await page.click('[data-action="overall-send"]');
    await expect(page.locator('#overallChatLogs')).toContainText('別解', { timeout: 15000 });
    expect(calls.length).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('math: 단계 채팅 응답이 로그에 남는다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const before = calls.length;

    await page.click('[data-action="toggle-step-chat"][data-idx="0"]');
    await page.fill('#step-chat-input-0', 'なぜこの式になる？');
    await page.click('[data-action="step-question-send"][data-idx="0"]');
    await expect(page.locator('#step-chat-logs-0')).not.toBeEmpty({ timeout: 15000 });
    expect(calls.length).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('math: もっとやさしく 가 렌더된다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const before = calls.length;

    await page.click('[data-action="simplify-step"][data-idx="0"]');
    await expect(page.locator('#stepsContainer')).toContainText('もっとやさしく', { timeout: 15000 });
    expect(calls.length).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('math: 직접 입력 채점이 동작한다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="start-quiz"]');
    await page.click('[data-action="quiz-mode"][data-mode="text"]');
    const before = calls.length;

    await page.fill('#studentAnswerInput', 'x=2,3');
    await page.click('[data-action="submit-student"]');
    await expect(page.locator('#quizResultBox')).toBeVisible({ timeout: 15000 });
    expect(calls.length).toBeGreaterThanOrEqual(before);
    expect(errors).toEqual([]);
  });

  test('math: 모델 목록 자동取得', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await page.click('[data-action="open-settings"]');
    await page.fill('#geminiKeyInput', 'TEST_KEY');
    await page.click('[data-action="fetch-models"]');
    await expect(page.locator('#modelFetchStatus')).toContainText('成功', { timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test('english: 작문 첨삭이 렌더된다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await page.click('[data-action="switch-mode"][data-mode="writing"]');
    await page.fill('#writingTaskInput', 'もし私が鳥だったら');
    await page.fill('#writingStudentInput', 'If I were a bird, I could fly to you.');
    await page.click('[data-action="submit-writing"]');
    await expect(page.locator('#writingResultSection, [id^="writingResult"]').first()).toBeVisible({ timeout: 20000 });
    expect(calls.length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('english: 새 4択 생성(API 1회)', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await page.click('[data-action="switch-mode"][data-mode="quiz"]');
    await page.click('#generateQuizBtn');
    await expect(page.locator('[data-action="select-quiz-choice"]')).toHaveCount(4, { timeout: 20000 });
    expect(calls.length).toBe(1);
    expect(errors).toEqual([]);
  });
});
