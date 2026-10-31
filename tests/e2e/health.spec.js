const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath, analyzeEnglish } = require('./helpers');

test.describe('health: 콘솔 / 액션 레지스트리 / CSP', () => {
  test('math: 로드 후 에러 0, data-action 누락 0', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');

    const audit = await page.evaluate(async () => {
      const m = await import('/shared/actions.js');
      return m.audit();
    });
    expect(audit.missing).toEqual([]);
    expect(audit.actions).toBe(43);
    expect(audit.nodes).toBeGreaterThanOrEqual(51);

    const csp = await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
    expect(csp).toBe(true);
    expect(errors).toEqual([]);
  });

  test('english: 로드 후 에러 0, data-action 누락 0', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'english');

    const audit = await page.evaluate(async () => {
      const m = await import('/shared/actions.js');
      return m.audit();
    });
    expect(audit.missing).toEqual([]);
    expect(audit.actions).toBe(44);

    expect(errors).toEqual([]);
  });

  test('렌더 후에도 누락 액션이 없다 (수학/영어)', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const m = await page.evaluate(async () => (await import('/shared/actions.js')).audit());
    expect(m.missing).toEqual([]);
    expect(m.nodes).toBeGreaterThan(51);

    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await analyzeEnglish(page, 'He runs fast.');
    const e = await page.evaluate(async () => (await import('/shared/actions.js')).audit());
    expect(e.missing).toEqual([]);
    expect(calls.length).toBe(1);
  });
});
