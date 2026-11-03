// tests/e2e/recover.spec.js — ライセンスキー再送ページの E2E テスト
const { test, expect } = require('@playwright/test');

test.describe('License Recovery Page (/site/recover.html)', () => {
  test('recover: ページが正常にレンダリングされ、送信後にgeneric成功メッセージが表示される', async ({ page }) => {
    let requestPayload = null;

    await page.route('**/v1/recover', async (route) => {
      requestPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.goto('/site/recover.html');

    // 1. 基本要素の確認
    await expect(page.locator('h1')).toHaveText('ライセンスキーの再送');
    const emailInput = page.locator('#emailInput');
    const submitBtn = page.locator('#submitBtn');
    const statusMsg = page.locator('#statusMessage');

    await expect(emailInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(statusMsg).toHaveClass(/hidden/);

    // 2. メールアドレスを入力して送信
    await emailInput.fill('learner@example.com');
    await submitBtn.click();

    // 3. API呼び出しと汎用成功メッセージの検証
    await expect(statusMsg).toBeVisible();
    await expect(statusMsg).toContainText('メールを送信しました');
    expect(requestPayload).toEqual({ email: 'learner@example.com' });
  });

  test('recover: 429 rate limit 発生時にレートリミット案内メッセージが表示される', async ({ page }) => {
    await page.route('**/v1/recover', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'rate_limited' })
      });
    });

    await page.goto('/site/recover.html');

    const emailInput = page.locator('#emailInput');
    const submitBtn = page.locator('#submitBtn');
    const statusMsg = page.locator('#statusMessage');

    await emailInput.fill('frequent@example.com');
    await submitBtn.click();

    await expect(statusMsg).toBeVisible();
    await expect(statusMsg).toContainText('リクエストが多すぎます');
  });
});
