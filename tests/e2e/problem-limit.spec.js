const { test, expect } = require('@playwright/test');
const { stubGemini, bootApp } = require('./helpers');

test('math: 3問以上は2問表示 + 分割案内バナー', async ({ page }) => {
  await stubGemini(page);
  await bootApp(page, 'math');
  await page.fill('#questionInput', 'HAS_MORE_PROBLEMS_FIXTURE');
  await page.click('[data-action="solve"]');
  await page.locator('#resultSection').waitFor({ state: 'visible', timeout: 20000 });
  await expect(page.locator('#problemLimitBanner')).toBeVisible();
  await expect(page.locator('#problemLimitBanner')).toContainText('1〜2問');
  await expect(page.locator('#problemTabBar button')).toHaveCount(2);
});
