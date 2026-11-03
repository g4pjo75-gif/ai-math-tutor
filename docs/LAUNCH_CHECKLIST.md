# Launch Checklist — Phase 7-6

> **最終更新**: 2026-11-03
> **現在の状態**: **NOT READY FOR LIVE SALES**
> **Production**: `0.6.0` / live Stripe 未接続
> **Staging**: `0.7.0` / Stripe test mode
> **目的**: 有料販売を開始する前に、コード・Staging・運用・法務・決済の全項目を確認する。

---

## 0. 使い方

- **P0** は live 販売前に必須。1つでも未完了なら販売しない。
- **P1** は販売後でもよいが、早めに処理する。
- チェック時は「確認日 / 確認者 / 証跡」を追記する。
- secret / ライセンスキー / `whsec_...` / `sk_...` の値はこの文書に書かない。

---

## 1. 現在の状態サマリー

| 項目 | 状態 | 備考 |
|---|---|---|
| L1 unit | ✅ 61 pass | 2026-11-03 |
| L2 E2E | ✅ 40 pass | 2026-11-03 |
| Server test | ✅ 56 pass | 2026-11-03 |
| Staging checkout → thanks → key | ✅ 完了 | Stripe test mode |
| Staging redeem / simple solve / quota | ✅ 完了 | 1回実呼び出し |
| Staging Customer Portal | ✅ 完了 | sandbox portal 画面確認 |
| Staging email 実送信 | ❌ 未完了 | Resend 未設定 / placeholder |
| 法務・販売者情報 | ❌ 未完了 | `site/legal.html` placeholder |
| Domain 決定 | ❌ 未決定 | 現行 URL 継続も選択肢 |
| Production email/budget env | ❌ 未設定 | 7-6-2B で設定 |
| Production D1 migration 0005 | ❌ 未適用 | 7-6-2B で適用 |
| Production deploy 0.7.0 | ❌ 未実施 | 現在 0.6.0 |
| Live Stripe | ❌ 未接続 | test mode のみ |
| 6問画像問題 timeout | ⚠️ 既知の性能課題 | 大型入力は後日改善 |
| Tailwind CDN 除去 | ✅ 完了 | shared/tailwind.css ビルド・CSP除去完了 |
| デバイス解除 UI | ⚠️ CLI のみ | 手動サポート手順は必要 |
| auto-retry / backoff | ❌ 未実装 | P1 |

> **注意**: staging の standard ライセンスは `unlink-device` テストで device を1件削除後、アプリ設定での再バインド（`/v1/redeem`）および `/v1/solve` の正常動作検証が完了済み。

---

## 2. P0 — コード / テスト / Staging

### 2.1 코드게이트

- [x] `npm run test:l1` → 61 pass
- [x] `npx playwright test` → 40 pass
- [x] `npm test` → 101 pass
- [x] `cd server && npm test` → 56 pass
- [x] `node tests/check-actions.js` → math 46 / english 47
- [x] `node tests/check-imports.js` → missing 0
- [x] `git diff --check` → 에러 0
- [x] secret / 라이선스 키가 diff에 없음
- [x] `test.only` / `skip` 없음

### 2.2 Staging E2E

- [x] Stripe test checkout
- [x] thanks.html でキー表示
- [x] アプリで license 登録 / redeem
- [x] 簡単な text solve
- [x] quota 減算
- [x] Customer Portal 進入
- [ ] 実メール送信（Resend）
- [ ] メール再送 / recover 実メール
- [x] 実デバイス解除 → 再バインド（`unlink-device.mjs` 解除後の `/v1/redeem` & `/v1/solve` 成功確認済み）
- [ ] 大型問題（6問画像）の扱いを確認（P1でも可）

### 2.3 환경 분리

- [x] staging Worker / D1 / Stripe test / secret 가 production 과 분리
- [x] production `/health` 가 `0.6.0` 으로 유지
- [x] staging 테스트 데이터가 production D1 에 없음
- [x] staging site 에 `X-Robots-Tag: noindex, nofollow`
- [x] staging `/docs`, `/package.json` 등이 404
- [x] Stripe webhook 의 `APP_ENV` 분리 유효


---

## 3. P0 — 運用者による設定

以下は **運用者入力 / 実アカウントが必要**。

### 3.1 メール（Resend）

- [ ] Resend アカウント作成
- [ ] 送信ドメイン取得 / 検証（DKIM, SPF）
- [ ] `RESEND_API_KEY` を staging/production に secret 登録
- [ ] `MAIL_FROM` を検証済みアドレスに設定
- [ ] `SUPPORT_EMAIL` を実サポートアドレスに設定
- [ ] `SITE_BASE_URL` を環境ごとに設定
  - staging: `https://ai-math-tutor-staging.g4pjo75.workers.dev`
  - production: 実際の公開 URL
- [ ] staging で実メール送信 1回
- [ ] recover ページから再送メール 1回
- [ ] 迷惑メール/リンク/キー表示を確認

### 3.2 法務 / サポート

- [ ] `site/legal.html` 販売事業者名 / 屋号
- [ ] 所在地（請求時開示方式でも可）
- [ ] 連絡先メール
- [ ] 最終返金 / キャンセル条件
- [ ] 特定商取引法表記の最終確認
- [ ] プライバシーポリシー最終確認
- [ ] 問い合わせ窓口 / 応答テンプレート
- [ ] 個人情報削除依頼の手順
- [ ] デバイス解除依頼の手順

### 3.3 ドメイン

- [ ] カスタムドメインを使う / 使わないを決定
- [ ] 使う場合:
  - [ ] DNS / Cloudflare / GitHub Pages 接続
  - [ ] `PROD_API_BASE`
  - [ ] CSP `connect-src`
  - [ ] CORS `ALLOWED_ORIGINS`
  - [ ] Stripe success / cancel / portal URL
  - [ ] `site/config.js`
  - [ ] メール送信ドメイン
- [ ] 使わない場合:
  - [ ] 現行 production URL 継続を文書化
  - [ ] メール用ドメインは別途必要か確認

### 3.4 予算 / 監視

- [ ] production `DAILY_COST_LIMIT_MICRO_YEN` 決定
- [ ] production `MONTHLY_COST_LIMIT_MICRO_YEN` 決定
- [ ] staging の budget guard 動作確認
- [ ] Cloudflare / Gemini の予算アラート設定
- [ ] Worker 5xx / webhook 失敗の監視
- [ ] D1 バックアップ実施
- [ ] D1 復旧手順確認
- [ ] `LICENSE_SECRET` の安全な保管
- [ ] Stripe / Gemini キー交換手順

### 3.5 ライブ Stripe

- [ ] Stripe 本番アカウントの本人確認 / 銀行 / 税設定
- [ ] live `STRIPE_SECRET_KEY`
- [ ] live webhook endpoint / `STRIPE_WEBHOOK_SECRET`
- [ ] live Customer Portal 設定
- [ ] 実際のカードで 1回決済
- [ ] 領収書 / 請求書確認
- [ ] 返金テスト
- [ ] 解約テスト
- [ ] 解約後 `portal` 進入確認
- [ ] 解約後 `402 license_canceled` 確認

### 3.6 Production 反映

- [ ] `0005_email_recovery.sql` を production D1 に適用
- [ ] production D1 バックアップ取得
- [ ] production `RESEND_API_KEY` / email env 設定
- [ ] production `DAILY/MONTHLY_COST_LIMIT_MICRO_YEN` 設定
- [ ] server `0.7.0` を production deploy
- [ ] production `/health` が `0.7.0`
- [ ] production client 7-5-C/7-6 反映
- [ ] production checkout → thanks → redeem → solve
- [ ] production portal
- [ ] production email
- [ ] production で staging test data がないこと

---

## 4. P0 — セキュリティ

- [x] `tutor_license_key` は password input
- [x] license key / secret をログに出さない
- [x] `recovery_log` 의 오래된 행 cleanup (7일 경과 자동 삭제 구현 및 테스트)
- [x] recover rate limit（IP 10/h, email+IP 3/h）
- [x] staging site `noindex` / Access
- [x] `.assetsignore` で docs / package / config を除外
- [x] Tailwind CDN / 外部 script のリスク確認 (CDN完全除去・自前ビルド完了)
- [x] CSP の `connect-src` が必要最小限
- [x] Stripe webhook 署名検証
- [x] `LICENSE_SECRET` 不変

---

## 5. P1 — 販売後でもよい項目

- [x] Tailwind CDN self-host (shared/tailwind.css 自前ビルド)
- [ ] KaTeX の self-host または SRI 適用 (現在 cdn.jsdelivr.net 依存)
- [ ] デバイス解除 UI
- [ ] auto-retry / backoff
- [ ] 大型問題の分割 / timeout 改善
- [ ] エラー画面の文言調整
- [ ] 管理ダッシュボード / 指標
- [ ] 返金 / 問い合わせテンプレート改善

---

## 6. ソフトローンチ基準

- [ ] P0 全項目完了
- [ ] production `/health` が期待バージョン
- [ ] 実メール / 実決済 / 返金 / 解約 1回ずつ成功
- [ ] サポート窓口が稼働
- [ ] ロールバック手順確認
- [ ] 少数ユーザー（10〜20名）で開始
- [ ] 毎日: 決済 / エラー / 原価 / 問い合わせを確認

---

## 7. Go / No-Go

**Go 条件**

- P0 がすべてチェック済み
- staging と production の分離確認済み
- 実メール / 実決済 / 返金 / 解約確認済み
- 法務表記 / サポート窓口が本番値

**No-Go 条件**

- Resend / MAIL_FROM / SUPPORT_EMAIL が placeholder
- legal.html が placeholder
- production budget が未設定
- production D1 migration 0005 未適用
- live Stripe 未確認
- 実メール送信未確認
- secret / ライセンスキーが漏えい

---

## 8. 関連コマンド

```bash
cd /home/park/projects/ai-math-tutor

npm run test:l1
npx playwright test
npm test

cd server
npm test

# staging health
curl -sS https://ai-math-tutor-api-staging.g4pjo75.workers.dev/health

# production health
curl -sS https://ai-math-tutor-api.g4pjo75.workers.dev/health

# production D1 migration (7-6-2B で実行)
npx wrangler d1 migrations apply ai-math-tutor-db --remote --config wrangler.jsonc

# production backup
npx wrangler d1 export ai-math-tutor-db --remote --output backups/prod.sql --config wrangler.jsonc
```
