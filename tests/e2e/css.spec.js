const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp } = require('./helpers');

test.describe('css: self-hosted tailwind css and no cdn', () => {
  test('math/english: cdn.tailwindcss.com 요청 0, local CSS 로드, 콘솔/CSP 에러 0', async ({ page }) => {
    for (const app of ['math', 'english']) {
      const tailwindCdnRequests = [];
      page.on('request', (req) => {
        if (req.url().includes('cdn.tailwindcss.com')) {
          tailwindCdnRequests.push(req.url());
        }
      });
      const errors = collectErrors(page);
      await stubGemini(page);
      await bootApp(page, app);

      expect(tailwindCdnRequests).toEqual([]);

      const tailwindScriptCount = await page.locator('script[src*="tailwindcss"]').count();
      expect(tailwindScriptCount).toBe(0);

      const localCssLink = await page.locator('link[href*="/shared/tailwind.css"]').count();
      expect(localCssLink).toBeGreaterThanOrEqual(1);

      expect(errors).toEqual([]);
    }
  });

  test('math/english: local Tailwind CSS utility 정상 적용 확인', async ({ page }) => {
    // 1. Math: #settingsModal 초기 hidden 상태(display: none) 확인
    await stubGemini(page);
    await bootApp(page, 'math');

    const mathSettingsDisplay = await page.$eval('#settingsModal', (el) => {
      return window.getComputedStyle(el).display;
    });
    expect(mathSettingsDisplay).toBe('none');

    const mathWarningDisplay = await page.$eval('#apiWarningBanner', (el) => {
      return window.getComputedStyle(el).display;
    });
    expect(mathWarningDisplay).toBe('none');

    // 2. English: #settingsModal 초기 hidden 상태(display: none) 확인
    await bootApp(page, 'english');

    const englishSettingsDisplay = await page.$eval('#settingsModal', (el) => {
      return window.getComputedStyle(el).display;
    });
    expect(englishSettingsDisplay).toBe('none');

    const englishWarningDisplay = await page.$eval('#apiWarningBanner', (el) => {
      return window.getComputedStyle(el).display;
    });
    expect(englishWarningDisplay).toBe('none');
  });
});
