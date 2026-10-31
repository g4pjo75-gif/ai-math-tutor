const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath, unlock } = require('./helpers');

test.describe('math: マイノート', () => {
  test('M4: 保存 → リロード → 復元でタブとステップが戻る', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="save-current-history"]');
    await page.waitForTimeout(400);

    await page.reload();
    await unlock(page);

    await page.click('[data-action="show-tutor-history"]');
    const items = page.locator('[data-action="restore-history"]');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);

    await items.first().click();
    await expect(page.locator('#resultSection')).toBeVisible();
    // 노트는 "현재 문제 1건"을 저장하므로 복원 후 탭은 1개다.
    await expect(page.locator('[data-action="play-step"]').first()).toBeVisible();
    await expect(page.locator('#recognizedProblem')).toContainText('x');

    expect(errors).toEqual([]);
  });

  test('M4: 삭제하면 목록에서 사라진다', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="save-current-history"]');
    await page.waitForTimeout(400);

    await page.click('[data-action="show-tutor-history"]');
    await expect(page.locator('[data-action="delete-tutor-history"]').first()).toBeVisible();
    await page.locator('[data-action="delete-tutor-history"]').first().click();
    await expect(page.locator('[data-action="restore-history"]')).toHaveCount(0);
  });
});
