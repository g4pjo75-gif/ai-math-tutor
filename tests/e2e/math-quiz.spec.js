const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');
const path = require('path');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

test.describe('math: 類題クイズ (API 0回)', () => {
  test('M2/M3: twin_quiz をそのまま使い、誤答はローカル採点される', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    const problem = stub.FIXTURES['math-solve-2problems'].problems[0];
    const quiz = problem.twin_quiz;
    const before = calls.length;

    await page.click('[data-action="start-quiz"]');
    await expect(page.locator('#quizSection')).toBeVisible();
    await expect(page.locator('[data-action="select-choice"]')).toHaveCount(4);

    // twin_quiz 사용 → 추가 API 호출 없음
    expect(calls.length).toBe(before);

    const wrongIdx = [0, 1, 2, 3].find((i) => i !== quiz.correct_index);
    await page.click(`[data-action="select-choice"][data-idx="${wrongIdx}"]`);
    await page.click('[data-action="submit-choice"]');

    await expect(page.locator('#quizResultBox')).toBeVisible();
    await expect(page.locator('#quizResultBox')).toContainText(String(quiz.choices[quiz.correct_index]).replace(/\$/g, '').slice(0, 4));
    expect(calls.length).toBe(before);
    expect(errors).toEqual([]);
  });

  test('M3: 힌트는 API 없이 열린다', async ({ page }) => {
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="start-quiz"]');
    const before = calls.length;

    await page.click('[data-action="toggle-quiz-hint"]');
    await expect(page.locator('#quizHintContent')).toBeVisible();
    expect(calls.length).toBe(before);
  });
});
