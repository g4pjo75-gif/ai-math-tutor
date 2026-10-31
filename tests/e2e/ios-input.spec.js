const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('iOS input: 16px + no auto focus', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('단계 질문을 열어도 자동 포커스/확대가 없다', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="toggle-step-chat"][data-idx="0"]');
    await expect(page.locator('#step-chat-panel-0')).toBeVisible();

    const r = await page.evaluate(() => {
      const input = document.getElementById('step-chat-input-0');
      return {
        fontSize: getComputedStyle(input).fontSize,
        focused: document.activeElement === input,
        activeTag: document.activeElement && document.activeElement.tagName,
        questionFont: getComputedStyle(document.getElementById('questionInput')).fontSize
      };
    });
    expect(r.fontSize).toBe('16px');
    expect(r.questionFont).toBe('16px');
    expect(r.focused).toBe(false);
    expect(errors).toEqual([]);
    await page.evaluate(() => { const e = document.getElementById('step-chat-panel-0'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 120); });
    await page.screenshot({ path: '/tmp/opencode/ui-ios-chat.png' });
  });

  test('「ここを聞く」도 포커스만 뺀 채 인용을 채운다', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="step-quote"][data-idx="0"][data-part="math"]');
    await expect(page.locator('#step-chat-panel-0')).toBeVisible();
    const r = await page.evaluate(() => {
      const input = document.getElementById('step-chat-input-0');
      return { value: input.value, focused: document.activeElement === input };
    });
    expect(r.value).toContain('この部分について教えてください');
    expect(r.focused).toBe(false);
  });

  test('데스크톱(820px 초과)에서는 기존 글자 크기 유지', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="toggle-step-chat"][data-idx="0"]');
    const fs = await page.evaluate(() => getComputedStyle(document.getElementById('step-chat-input-0')).fontSize);
    expect(fs).not.toBe('16px');
  });
});
