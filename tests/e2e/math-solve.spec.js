const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('math: 解説とタブ', () => {
  test('M1: 2問の解説が独立タブで表示され、切替で内容が変わる', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await expect(page.locator('#problemTabBar')).toBeVisible();
    await expect(page.locator('#problem-tab-0')).toBeVisible();
    await expect(page.locator('#problem-tab-1')).toBeVisible();

    const first = await page.locator('#recognizedProblem').innerText();
    await page.click('#problem-tab-1');
    const second = await page.locator('#recognizedProblem').innerText();
    expect(second).not.toBe(first);

    await page.click('#problem-tab-0');
    expect(await page.locator('#recognizedProblem').innerText()).toBe(first);

    expect(calls.length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('M6: 同じ問題の再実行は API 0回', async ({ page }) => {
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    expect(calls.length).toBe(1);

    await page.click('[data-action="solve"]');
    await page.waitForTimeout(800);
    await expect(page.locator('#resultSection')).toBeVisible();
    expect(calls.length).toBe(1);
  });
});
