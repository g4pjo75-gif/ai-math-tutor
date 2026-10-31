const { test, expect } = require('@playwright/test');
const { stubGemini, bootApp, unlock } = require('./helpers');

// SW를 허용하고 오프라인 재방문을 검증한다.
test.use({ serviceWorkers: 'allow' });

test.describe('PWA: オフライン再訪', () => {
  test('M8: 一度オンラインで開いた後、オフラインでも UI とノートが動く', async ({ page, context }) => {
    await stubGemini(page);
    await bootApp(page, 'math');

    // SW 有効化 + プリキャッシュ完了を待つ
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      if (!keys.length) return false;
      const c = await caches.open(keys[0]);
      return (await c.keys()).length > 10;
    }, null, { timeout: 20000 });

    await context.setOffline(true);
    await page.reload();
    await unlock(page);

    await expect(page.locator('#questionInput')).toBeVisible();
    const audit = await page.evaluate(async () => (await import('/shared/actions.js')).audit());
    expect(audit.missing).toEqual([]);
    expect(audit.actions).toBe(42);
    // 노트 UI도 오프라인에서 열린다
    await page.click('[data-action="show-tutor-history"]');
    await expect(page.locator('#tutorHistoryModal')).toBeVisible();
  });
});
