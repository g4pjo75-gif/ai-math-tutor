const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, analyzeEnglish } = require('./helpers');
const path = require('path');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

test.describe('english: 読解 → クイズ → 単語帳 → ノート', () => {
  test('M7: 一連のフローが API 追加なしで動く', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await analyzeEnglish(page, 'He runs fast every morning.');

    const reading = stub.FIXTURES['english-reading'];
    await expect(page.locator('#resultContent')).toContainText(reading.passage_en.slice(0, 10));
    expect(calls.length).toBe(1);

    // 読解結果の CTA → twin_quiz (API 0)
    await page.click('[data-action="quiz-generate"][data-force="1"]');
    await expect(page.locator('#panelQuiz')).toBeVisible();
    await expect(page.locator('#quizActiveContainer')).toBeVisible();
    await expect(page.locator('[data-action="select-quiz-choice"]')).toHaveCount(4);
    expect(calls.length).toBe(1);

    const quiz = reading.twin_quiz;
    const wrongIdx = [0, 1, 2, 3].find((i) => i !== quiz.correct_index);
    await page.click(`[data-action="select-quiz-choice"][data-idx="${wrongIdx}"]`);
    await page.click('[data-action="submit-quiz"]');
    await expect(page.locator('#quizResultBox')).toBeVisible();
    expect(calls.length).toBe(1);

    // 単語帳へ一括登録
    await page.click('[data-action="switch-mode"][data-mode="reading"]');
    await page.click('[data-action="save-all-words"]');
    await page.click('[data-action="open-history"]');
    await expect(page.locator('#historyListContainer')).toContainText(reading.vocabulary[0].word);
    await page.click('[data-action="close-history"]');

    // ノート保存 → 復元
    await page.click('[data-action="save-lesson-history"]');
    await page.click('[data-action="open-history"]');
    await page.click('[data-action="history-tab"][data-tab="notes"]');
    const restore = page.locator('[data-action="restore-history-item"]').first();
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.locator('#resultSection')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
