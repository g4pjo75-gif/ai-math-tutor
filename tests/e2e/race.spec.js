const { test, expect } = require('@playwright/test');
const { collectErrors, bootApp, solveMath } = require('./helpers');
const stub = require('../stub-gemini.js');

test.describe('race: 응답 대기 중 탭 전환', () => {
  test('M5: 전체 Q&A 응답이 원래 문제에 저장되고, 돌아오면 보인다', async ({ page }) => {
    const errors = collectErrors(page);
    let release;
    const gate = new Promise((r) => { release = r; });
    let chatCalls = 0;

    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: { models: [{ name: 'models/gemini-3.8-flash', displayName: 'F', supportedGenerationMethods: ['generateContent'] }] } });
      }
      const body = req.postData();
      const key = stub.pickFixture(req.url(), { method: 'POST', body });
      if (key === 'math-overall-chat') {
        chatCalls++;
        await gate;                       // 탭을 바꾼 뒤에 응답
      }
      return route.fulfill({ json: stub.envelope(stub.FIXTURES[key]) });
    });

    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.fill('#overallChatInput', '別解はありますか？');
    await page.click('[data-action="overall-send"]');
    await page.waitForTimeout(300);

    await page.click('#problem-tab-1');   // 응답 도착 전에 다른 문제로 이동
    release();
    await page.waitForTimeout(1500);

    await page.click('#problem-tab-0');   // 원래 문제로 복귀
    await expect(page.locator('#overallChatLogs')).toContainText('解の公式', { timeout: 10000 });

    // 다른 문제(탭 1)에는 답변이 섞이지 않는다
    await page.click('#problem-tab-1');
    await expect(page.locator('#overallChatLogs')).not.toContainText('による解法');

    expect(chatCalls).toBe(1);
    expect(errors).toEqual([]);
  });
});
