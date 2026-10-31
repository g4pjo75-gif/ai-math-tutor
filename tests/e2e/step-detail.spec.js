const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('step detail: 説明ポイントの開閉', () => {
  test('칩으로 하나씩 열고, 같은 칩을 다시 누르면 닫힌다', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    const panel = page.locator('#step-detail-0');
    const focusChip = page.locator('[data-action="step-detail"][data-idx="0"][data-part="focus"]');
    const whyChip = page.locator('[data-action="step-detail"][data-idx="0"][data-part="why"]');

    // 기본은 닫힘
    await expect(panel).toBeHidden();
    await expect(focusChip).toHaveAttribute('aria-expanded', 'false');

    // 着眼点 열기
    await focusChip.click();
    await expect(panel).toBeVisible();
    await expect(page.locator('#step-focus-0')).toBeVisible();
    await expect(page.locator('#step-focus-0')).toContainText('の形');
    await expect(focusChip).toHaveAttribute('aria-expanded', 'true');

    // なぜ로 전환 (한 번에 하나)
    await whyChip.click();
    await expect(page.locator('#step-why-0')).toBeVisible();
    await expect(page.locator('#step-focus-0')).toBeHidden();
    await expect(focusChip).toHaveAttribute('aria-expanded', 'false');
    await expect(whyChip).toHaveAttribute('aria-expanded', 'true');

    // 같은 칩 다시 → 닫힘
    await whyChip.click();
    await expect(panel).toBeHidden();
    await expect(whyChip).toHaveAttribute('aria-expanded', 'false');

    expect(errors).toEqual([]);
  });

  test('「ここを聞く」 버튼이 열린 파트를 따라간다', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="step-detail"][data-idx="0"][data-part="focus"]');
    const quote = page.locator('#step-detail-0 [data-action="step-quote"]');
    await expect(quote).toHaveAttribute('data-part', 'focus');

    await page.click('[data-action="step-detail"][data-idx="0"][data-part="watch"]');
    await expect(quote).toHaveAttribute('data-part', 'watch');
  });
});
