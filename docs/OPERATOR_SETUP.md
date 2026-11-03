# Operator Setup — Phase 7-6-2B-2

> **対象**: 運営者（オーナー）が入力・契約する項目
> **前提**: Phase 7-6-2B-1B 完了（`1957c4b` 以降）
> **目的**: 有料販売（live）を開始できる状態まで、運営者設定を安全な順序で完了させる
> **関連**: `docs/LAUNCH_CHECKLIST.md`（Go/No-Go 判定）

---

## 0.1 確定事項（2026-11-03）

| 項目 | 決定内容 |
|---|---|
| ドメイン | `gakushulab.com`（Cloudflare Registrar、自動更新 ON） |
| メール送信 | Resend（Tokyo / ap-northeast-1、Forge Enabled） |
| `MAIL_FROM` | `AI家庭教師 <noreply@gakushulab.com>` |
| `SUPPORT_EMAIL` | `support@gakushulab.com` |
| サポート受信 | Cloudflare Email Routing → 運営者 Gmail |
| DNS | Cloudflare（`send` CNAME / `resend._domainkey` TXT / `_dmarc` TXT） |
| Staging 実メール送信 | ✅ 2026-11-03 確認済み（SPF/DKIM/DMARC PASS） |

> `noreply@gakushulab.com` は受信用メールボックスを作らない発信専用アドレス。
>
> `support@` は Cloudflare Email Routing で実受信を確認済み。

---

## 0. この文書の使い方

- 上から順に実施する。**順序を入れ替えない**（Stripe live を最後に近づける）。
- 各ステップに「確認コマンド」と「期待値」を記載している。期待値と違えば次へ進まない。
- **secret の値はこの文書・チャット・スクリーンショット・コミットに書かない。**
- 記録するのは「設定済み / 未設定」「日付」「担当」のみ。
- すべて **Staging で先に成功**させてから Production に適用する。

---

## 1. 運営者が用意するもの

### 1.1 アカウント / 契約

| 項目 | 用途 | 必須 | 備考 |
|---|---|---|---|
| Resend アカウント | メール送信 | 必須 | 無料枠から開始可 |
| 送信ドメイン（DKIM/SPF 検証） | `MAIL_FROM` のドメイン | 必須 | 独自ドメイン推奨。`resend.dev` は本番不可 |
| サポート用メールアドレス | `SUPPORT_EMAIL` | 必須 | 実在・受信可能なもの |
| Stripe 本番アカウント | live 決済 | 必須 | 本人確認・銀行口座・税設定まで完了させる |
| 独自ドメイン | サイト/API/メール | 任意 | 使わない場合は現行 URL 継続（後述） |

### 1.2 運営者しか決められない値

| 変数 / 項目 | 種別 | 設定先 | 例（形式のみ） |
|---|---|---|---|
| `RESEND_API_KEY` | secret | Worker secret | `re_...` |
| `MAIL_FROM` | var | wrangler config | `AI家庭教師 <noreply@your-domain.jp>` |
| `SUPPORT_EMAIL` | var | wrangler config | `support@your-domain.jp` |
| `SITE_BASE_URL` | var | wrangler config | `https://your-domain.jp` |
| `DAILY_COST_LIMIT_MICRO_YEN` | var | wrangler config | `5000000`（= ¥5） |
| `MONTHLY_COST_LIMIT_MICRO_YEN` | var | wrangler config | `20000000`（= ¥20） |
| `STRIPE_SECRET_KEY` | secret | Worker secret | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | secret | Worker secret | `whsec_...` |
| 販売者名 / 所在地 / 連絡先 / 返金条件 | 文言 | `site/legal.html` | — |

> 既存 secret で **運営者が触らないもの**: `LICENSE_SECRET`, `GEMINI_API_KEY`
> `LICENSE_SECRET` は変更すると既存ライセンスキーが全失效する。**絶対に変更しない。**

---

## 2. 全体の順序

```text
Step 0  事前検証: preflight スクリプトによる設定・環境チェック
Step 1  Staging: メール（Resend）
Step 2  Staging: 実メール送信テスト
Step 3  法務表記（site/legal.html）
Step 4  ドメイン方針の決定
Step 5  Production: D1 バックアップ + migration 0005
Step 6  Production: email / budget env 設定
Step 7  Production: Worker 0.7.0 デプロイ + health 確認
Step 8  Production: Stripe live 設定
Step 9  実決済 → 返金 → 解約テスト
Step 10 Go/No-Go 判定（LAUNCH_CHECKLIST）
```

**Stripe live は Step 8 以降**。それ以前に live キーを入れない。

---

## 2.1 Step 0 — Preflight スクリプトによる事前検証

環境設定やデプロイの前に、値を見ずに設定漏れやプレースホルダーを検出する preflight スクリプトを実行する。

```bash
cd /home/park/projects/ai-math-tutor/server

# Staging 事前検証
npm run preflight:staging -- --offline  # オフライン設定検証
npm run preflight:staging              # リモート含む検証

# Production 事前検証（Step 8 完了後に実行）
npm run preflight:prod -- --offline
npm run preflight:prod
```

> **注意**:
> `npm run preflight:prod`（リモート検査含む）は **Step 8（Stripe live 設定）まで完了した後に実行する**。
> Step 5〜7 の作業途中では `STRIPE_SECRET_KEY` 等が未設定のため、#7（Secret list）が FAIL するのが正常です。

---

## 3. Step 1 — Staging メール設定

### 3.1 ドメイン検証（Resend）

1. Resend で送信ドメインを追加
2. 表示された DNS レコード（SPF / DKIM）を DNS に追加
3. Resend 上で `Verified` になるまで待つ

> ドメインを持たない場合: 先に Step 4 を決める。`resend.dev` は本番送信に使わない。

### 3.2 API キー登録（値は表示しない）

```bash
cd /home/park/projects/ai-math-tutor/server

# 対話入力。値はシェル履歴に残さない
npx wrangler secret put RESEND_API_KEY --config wrangler.staging.jsonc
```

### 3.3 変数設定

`server/wrangler.staging.jsonc` の `vars`:

```jsonc
"SITE_BASE_URL": "https://ai-math-tutor-staging.g4pjo75.workers.dev",
"MAIL_FROM": "AI家庭教師 <noreply@your-verified-domain>",
"SUPPORT_EMAIL": "support@your-verified-domain"
```

### 3.4 確認

```bash
npx wrangler secret list --config wrangler.staging.jsonc   # 名前のみ表示される
cd ..
npm run deploy:site:staging                                # サイト側（既に 1B で実施済みなら不要）
cd server && npm run deploy:staging
```

期待:

- `RESEND_API_KEY` が secret 一覧に **名前だけ** 出る
- staging `/health` が `0.7.0`
- staging のメール系テストが通る（`server/test/email.test.js` はローカル stub なので実送信ではない）

---

## 4. Step 2 — 実メール送信テスト（Staging）

1. Stripe test mode で購入 → `thanks.html` に遷移
2. メール受信を確認
   - 件名・本文に staging URL が入っている
   - ライセンスキーが表示される（スクリーンショット共有時はマスク）
   - `SUPPORT_EMAIL` が実アドレスになっている
3. `site/recover.html` から再送 → メール受信
4. 迷惑メールフォルダも確認（SPF/DKIM 未完了だと落ちる）

**失敗時の典型原因**

| 症状 | 原因 |
|---|---|
| `email_not_configured` | `RESEND_API_KEY` 未登録 |
| 403 / domain not verified | DKIM/SPF 未検証、`MAIL_FROM` ドメイン不一致 |
| メールが届かない | 迷惑メール、送信ドメイン評判、`MAIL_FROM` 形式誤り |

---

## 5. Step 3 — 法務表記

`site/legal.html` のプレースホルダを実値に置換する。

| 項目 | 必要な内容 |
|---|---|
| 販売事業者名 | 個人事業主なら屋号または氏名 |
| 所在地 | 請求時開示でも可（特商法の要件を確認） |
| 連絡先 | 実在するメールアドレス |
| 販売価格 | 実際の税込価格 |
| 支払方法 / 時期 | Stripe の実態に合わせる |
| 返金 / キャンセル | 最終条件（日数・可否・手数料） |
| 役務の提供時期 | 決済後ただちに提供、など |

注意:

- `docs/LAUNCH_CHECKLIST.md` の「法務」項目が完了になるまで live 販売しない
- 文面の最終判断は運営者（必要なら専門家確認）

---

## 6. Step 4 — ドメイン方針（確定済み）

2026-11-03 に独自ドメイン **`gakushulab.com`**（Cloudflare Registrar）の採用を確定し、Cloudflare Workers Assets カスタムドメインとして配備完了（Phase 7-6-2C）。

| 対象 | 設定・確定値 |
|---|---|
| サイト配信 | Cloudflare Workers Assets (`ai-math-tutor-site` / `https://gakushulab.com/`) |
| API | `https://ai-math-tutor-api.g4pjo75.workers.dev` (v0.7.0) |
| クライアント API Base | `shared/config.js` / `site/config.js` (gakushulab.com → PROD_API_BASE) |
| CORS | `ALLOWED_ORIGINS`: `https://gakushulab.com,https://g4pjo75-gif.github.io` |
| Stripe URL | `https://gakushulab.com/site/thanks.html`, `pricing.html`, `portal.html` |
| メール本文リンク | `SITE_BASE_URL`: `https://gakushulab.com` |
| メール送信 | `MAIL_FROM`: `AI家庭教師 <noreply@gakushulab.com>` (Resend 東京リージョン) |
| サポート窓口 | `support@gakushulab.com` (Cloudflare Email Routing) |

※ GitHub Pages (`https://g4pjo75-gif.github.io/ai-math-tutor/`) は切戻し用フォールバックとして CORS 許可を維持。

---

## 7. Step 5 — Production D1 バックアップ + migration 0005

### 7.1 バックアップ（必須）

```bash
cd /home/park/projects/ai-math-tutor/server
mkdir -p backups
npx wrangler d1 export ai-math-tutor-db --remote --output backups/prod-$(date +%Y%m%d-%H%M).sql
ls -lh backups/
```

- 0 バイトでないこと
- バックアップはリポジトリにコミットしない（`.gitignore` 確認）

### 7.2 適用前確認

```bash
npx wrangler d1 migrations list ai-math-tutor-db --remote
```

- `0001`〜`0004` が適用済み、`0005` が pending であること
- 想定外の pending があれば **中断して報告**

### 7.3 適用

```bash
npx wrangler d1 migrations apply ai-math-tutor-db --remote
```

### 7.4 適用後確認

```bash
npx wrangler d1 migrations list ai-math-tutor-db --remote
```

- `0005_email_recovery.sql` が適用済み
- `recovery_log` テーブルが存在する

> Production の `0005` は **メール機能の前提**。未適用のまま Worker 0.7.0 を出さない。

---

## 8. Step 6 — Production env 設定

`server/wrangler.jsonc` の `vars`（2026-11-03 Phase 7-6-2C にて設定済み）:

```jsonc
"ALLOWED_ORIGINS": "https://gakushulab.com,https://g4pjo75-gif.github.io",
"DAILY_COST_LIMIT_MICRO_YEN": "50000000",
"MONTHLY_COST_LIMIT_MICRO_YEN": "1000000000",
"SITE_BASE_URL": "https://gakushulab.com",
"MAIL_FROM": "AI家庭教師 <noreply@gakushulab.com>",
"SUPPORT_EMAIL": "support@gakushulab.com"
```

> **CORS設定の重要注意**:
> production の `ALLOWED_ORIGINS` は **`https://gakushulab.com` およびフォールバック用 GitHub Pages のみ** を指定し、`http://localhost:...` や `127.0.0.1` は必ず除去してください。
> これらを除去しないと、preflight #3（プレースホルダー検出）および #4 が FAIL として検出されます。

secret 登録:

```bash
cd /home/park/projects/ai-math-tutor/server
npx wrangler secret put RESEND_API_KEY           # 登録済み (Phase 7-6-2C)
npx wrangler secret put STRIPE_SECRET_KEY        # Step 8 で live キー
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # Step 8 で live 署名
```

確認（名前のみ）:

```bash
npx wrangler secret list
```

### 予算値の設定実績

| 変数名 | 設定値 | 意味 | 備考 |
|---|---|---|---|
| `DAILY_COST_LIMIT_MICRO_YEN` | `50000000` | ¥50 / 日 | 初期運用リミット |
| `MONTHLY_COST_LIMIT_MICRO_YEN` | `1000000000` | ¥1,000 / 月 | 初期運用リミット |

- 0 を設定すると「上限なし」になる場合があるため、**必ず正の値**を入れる
- Cloudflare / Google 側の予算アラートも別途設定する

---

## 9. Step 7 — Production Worker デプロイ

### 7.1 API Worker デプロイ実績 (Phase 7-6-2C)

```bash
cd /home/park/projects/ai-math-tutor/server
npx wrangler deploy
```

- デプロイ Version ID: `5a44d9ab-07b1-465c-acaf-7582074b0540`
- 確認:
  ```bash
  curl -sS https://ai-math-tutor-api.g4pjo75.workers.dev/health
  # {"ok":true,"version":"0.7.0","env":{"gemini_configured":true,"stripe_configured":true,"stripe_webhook_configured":true,"email_configured":true,"portal_configured":true,"budget_configured":true}}
  ```

### 7.2 サイト Worker デプロイ実績 (Phase 7-6-2C)

```bash
npm run deploy:site:prod
```

- デプロイ Version ID: `c00c8a91-14c3-4eab-86c4-a43b0ec0391d`
- カスタムドメイン: `https://gakushulab.com/` (HTTP/2 200, `x-robots-tag: noindex, nofollow`)
- サイト側（GitHub Pages: `https://g4pjo75-gif.github.io/ai-math-tutor/`）も `main` push で自動反映。

---

## 10. Step 8 — Stripe live

1. Stripe ダッシュボードで本番モードに切替
2. 本人確認 / 銀行口座 / 税設定を完了
3. 商品・価格を作成（test mode と同じ金額・通貨）
4. Webhook endpoint を登録
   - URL: `https://ai-math-tutor-api.g4pjo75.workers.dev/webhook/stripe`
   - イベント: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`
5. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` を live 値で登録
6. Customer Portal を本番モードで設定
7. `PLAN_PRICE_JPY` と実価格が一致していることを確認

確認:

```bash
npx wrangler secret list
curl -sS https://ai-math-tutor-api.g4pjo75.workers.dev/health
```

---

## 11. Step 9 — 実決済テスト

| # | 操作 | 期待 |
|---|---|---|
| 1 | live で購入 | Checkout 完了 → `thanks.html` |
| 2 | thanks 表示 | ライセンスキー表示 |
| 3 | メール | キー記載メール受信 |
| 4 | アプリで redeem | 200 / `plan: standard` |
| 5 | solve 1回 | 200 / quota 減算 |
| 6 | Customer Portal | 遷移できる |
| 7 | 返金 | Stripe で返金処理 |
| 8 | 返金後の扱い | 下記「返金ポリシー」に従う |
| 9 | 解約 | `customer.subscription.deleted` 受信 |
| 10 | 解約後 solve | `402 license_canceled` |
| 11 | 解約後 portal | 遷移できる |

証跡: 日時・結果のみ記録。**カード番号・キー・secret は記録しない。**

### 返金ポリシー（重要）

Webhook において `charge.refunded`（全額返金）が自動処理される（Phase 7-6-2B-1C 実装完了）:

- **全額返金（`refunded === true`）**:
  - Webhook 受信時に該当顧客の `licenses.status` が自動的に `'refunded'` に更新される。
  - 以降、アプリでの `/v1/solve` は `402 license_refunded` となり即座に利用不可となる。
  - **重要**: Stripe 上の定期課金（Subscription）は自動解約されないため、**運営者が Stripe ダッシュボードから該当サブスクリプションを手動でキャンセル（即時解約）する必要がある**（手順は `docs/SUPPORT.md` 参照）。
- **部分返金（`refunded === false`）**:
  - 自動停止は行わない（運営者の個別判断で手動対応）。
- **チャージバック（`charge.dispute.created`）**:
  - 自動停止せず警告ログを出力し、運営者が Stripe ダッシュボードで調査・対応する。

---

## 12. Step 10 — Go/No-Go

`docs/LAUNCH_CHECKLIST.md` の P0 がすべて完了していること。

特に:

- [ ] staging / production の分離確認
- [ ] production migration 0005 適用済み
- [ ] production `/health` が `0.7.0`
- [ ] 実メール送信成功
- [ ] live 決済 / 返金 / 解約 成功
- [ ] legal.html が本番値
- [ ] 予算上限が設定済み
- [ ] 返金処理の方針が確定し、返金後にライセンスが停止することを確認済み
- [ ] secret / キー漏えいなし

1つでも未完了なら **live 販売を開始しない**。

---

## 13. ロールバック

| 対象 | 手順 |
|---|---|
| Worker | `npx wrangler rollback [DEPLOYMENT_ID]` |
| D1 | バックアップ SQL から復元（運営者判断） |
| サイト | GitHub Pages を前回安定コミットに戻して push |
| Stripe | live キーを停止 / 商品を非公開化 |
| メール | `RESEND_API_KEY` をローテーション |

---

## 14. preflight スクリプト仕様（実装完了）

`server/scripts/preflight.mjs`

### 目的

本番反映前に、**値を見ずに** 設定漏れ・環境混在・migration 未適用を検出する。

### 使い方

```bash
node scripts/preflight.mjs --staging
node scripts/preflight.mjs --prod
node scripts/preflight.mjs --prod --offline   # remote 検査省略
```

### 検査項目

| # | 検査 | 失敗時 |
|---|---|---|
| 1 | `APP_ENV` が対象と一致 | FAIL |
| 2 | 必須 var の存在（値は非表示） | FAIL |
| 3 | placeholder 検出（`example.com`, `resend.dev`, `localhost`） | prod は FAIL / staging は WARN |
| 4 | `ALLOWED_ORIGINS` にサイト origin が含まれる | FAIL |
| 5 | `CHECKOUT_*` / `PORTAL_*` の host が `SITE_BASE_URL` と一致 | FAIL |
| 6 | 予算値が正の整数 | FAIL |
| 7 | `wrangler secret list` に必須 secret 名が存在 | FAIL |
| 8 | D1 migration の pending が 0 | FAIL |
| 9 | `/health` の version が期待値 | WARN |
| 10 | staging の `X-Robots-Tag: noindex` | WARN |

### 出力ルール

- **値は絶対に出力しない**（名前と OK/NG/WARN のみ）
- FAIL が 1 件でもあれば exit 1
- ネットワーク不要の検査と、必要な検査を分離（`--offline` 可）

### 終了コード

| code | 意味 |
|---|---|
| 0 | すべて OK |
| 1 | FAIL あり（デプロイ禁止） |
| 2 | 引数エラー |

### 追加された package.json scripts

`server/package.json`:

```jsonc
"d1:migrate:prod": "wrangler d1 migrations apply ai-math-tutor-db --remote",
"d1:list:prod": "wrangler d1 migrations list ai-math-tutor-db --remote",
"preflight:staging": "node scripts/preflight.mjs --staging",
"preflight:prod": "node scripts/preflight.mjs --prod"
```

これにより運営者は長いコマンドを覚えずに済み、誤った DB 名の指定ミスも防げる。

---

## 15. 実施記録

| 日付 | Step | 結果 | 担当 | 備考 |
|---|---|---|---|---|
| | 1 | | | |
| | 2 | | | |
| | 3 | | | |
| | 4 | | | |
| | 5 | | | |
| | 6 | | | |
| | 7 | | | |
| | 8 | | | |
| | 9 | | | |
| | 10 | | | |
