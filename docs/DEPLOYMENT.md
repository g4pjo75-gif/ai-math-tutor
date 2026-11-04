# デプロイ・環境運用マニュアル

> **対象**: `ai-math-tutor` の staging / production を運用する担当者<br>
> **目的**: ソース（GitHub）と実行環境（Cloudflare）の関係を理解し、安全にデプロイする<br>
> **関連**: `docs/DEPLOY_LOG.md`, `docs/OPS.md`, `docs/OPERATOR_SETUP.md`, `docs/BETA.md`

---

## 1. 全体像

```text
GitHub (main)                 = ソースの原本
   │
   │  手動デプロイ (wrangler)
   ▼
Cloudflare                    = デプロイ時点のスナップショット
   ├─ Staging Site Worker
   ├─ Staging API Worker
   ├─ Production Site Worker
   └─ Production API Worker
```

- **GitHub が原本**。Cloudflare に Git リポジトリはない
- Cloudflare が持つのは **デプロイ時点のコード/アセット + secret + D1**
- `git push` だけでは staging / production は更新されない（旧 GitHub Pages を除く）

> たとえるなら、GitHub は原稿、Cloudflare は印刷・設置済みの部数。<br>
> 原稿を直しても、印刷し直すまで設置済みのものは変わらない。

---

## 2. 環境一覧

| 環境 | 対象 | Worker | URL |
|---|---|---|---|
| staging | site | `ai-math-tutor-staging` | `https://ai-math-tutor-staging.g4pjo75.workers.dev/` |
| staging | api | `ai-math-tutor-api-staging` | `https://ai-math-tutor-api-staging.g4pjo75.workers.dev/` |
| production | site | `ai-math-tutor-site` | `https://gakushulab.com/` |
| production | api | `ai-math-tutor-api` | `https://ai-math-tutor-api.g4pjo75.workers.dev/` |

| 環境 | D1 | Stripe | 検索 |
|---|---|---|---|
| staging | `ai-math-tutor-db-staging` | test mode | 対象外 |
| production | `ai-math-tutor-db` | test mode（live 前） | noindex（ベータ中） |

---

## 3. ディレクトリと役割

| パス | 役割 | デプロイ先 |
|---|---|---|
| `index.html` | アプリハブ | site |
| `math/` | 数学 PWA | site |
| `english/` | 英語 PWA | site |
| `core/` | 共通コア（DOM 非依存） | site |
| `shared/` | 共通 UI・ライセンス・設定 | site |
| `site/` | LP・料金・法務・決済ページ | site |
| `server/src/` | Cloudflare Worker API | api |
| `server/migrations/` | D1 マイグレーション | D1 |
| `docs/` | 設計・運用ドキュメント | 配布しない |
| `tests/` | L1/L2 テスト | 配布しない |

> `site/` は「staging 用 / production 用」のフォルダではない。<br>
> 同じ `site/` を両環境へ配布する。

---

## 4. 設定ファイル

| ファイル | 用途 |
|---|---|
| `wrangler.jsonc` | staging site（`ai-math-tutor-staging`） |
| `wrangler.site.jsonc` | production site（`ai-math-tutor-site` / `gakushulab.com`） |
| `server/wrangler.staging.jsonc` | staging API |
| `server/wrangler.jsonc` | production API |
| `.assetsignore` | site へアップロードしないファイル |
| `_headers` | 配信ヘッダ（noindex など） |
| `tailwind.config.cjs` / `shared/tailwind.css` | 自前ビルド CSS |

---

## 5. Secret と D1

### 5.1 Secret（GitHub に置かない）

| 名前 | 用途 |
|---|---|
| `LICENSE_SECRET` | ライセンスキー導出。**変更禁止** |
| `RESEND_API_KEY` | メール送信 |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証 |
| `GEMINI_API_KEY` | Gemini 呼び出し |

登録:

```bash
cd server
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_API_KEY --config wrangler.staging.jsonc
```

- 値は表示しない
- `wrangler secret list` で**名前だけ**確認
- secret 変更は即時反映（再デプロイ不要）

### 5.2 D1

- コードのデプロイと DB マイグレーションは**別作業**
- staging:

```bash
cd server
npx wrangler d1 migrations apply ai-math-tutor-db-staging --remote --config wrangler.staging.jsonc
```

- production:

```bash
npx wrangler d1 migrations apply ai-math-tutor-db --remote
npx wrangler d1 migrations list ai-math-tutor-db --remote
```

> production は過去に `d1 execute` で直接適用した経緯があり、0001〜0004 を baseline 登録済み。<br>
> 詳細は `docs/OPS.md`。

---

## 6. デプロイフロー

```text
1. 修正
2. commit + push (main)
3. staging へデプロイ
4. staging で確認
5. production へデプロイ（同じコミット）
6. production で確認
7. DEPLOY_LOG をコミット
```

### 6.1 手動コマンド

```bash
# staging site
npm run deploy:site:staging

# staging api
cd server && npm run deploy:staging

# production site
npm run deploy:site:prod

# production api
cd server && npx wrangler deploy
```

### 6.2 安全ラッパー（推奨）

```bash
node scripts/deploy.mjs staging-site
node scripts/deploy.mjs staging-api
node scripts/deploy.mjs prod-site
node scripts/deploy.mjs prod-api
```

このスクリプトは:

- working tree が dirty なら**拒否**
- production は `main` / push 済みを要求
- デプロイ後に **commit / Version ID** を `docs/DEPLOY_LOG.md` へ追記
- `--dry-run` で事前チェックのみ
- `--allow-dirty` は緊急時のみ

> `docs/DEPLOY_LOG.md` の変更は dirty 判定から除外されます。<br>
> デプロイ後にログをコミットしてください。

---

## 7. 環境のズレ（drift）

以下の理由で GitHub と Cloudflare はズレます。

| 原因 | 例 |
|---|---|
| デプロイ忘れ | GitHub 最新 / production 旧版 |
| staging だけデプロイ | staging 最新 / production 旧版 |
| 未コミットでデプロイ | GitHub にないコードが Cloudflare へ |
| secret の差 | 同じコードでもメール/決済が動かない |
| D1 の差 | 同じコードでもライセンス状態が違う |
| 旧 GitHub Pages | push で自動更新され、production より新しいことがある |

### 防止策

1. **必ず clean tree からデプロイ**
2. **main に push 済みのコミットのみ production へ**
3. **staging → production の順**
4. **`docs/DEPLOY_LOG.md` に記録**
5. **リリースタグを付ける**

```bash
git tag deploy-2026-11-05
git push origin deploy-2026-11-05
```

---

## 8. Version ID とロールバック

```bash
# デプロイ履歴
cd server && npx wrangler deployments list
cd .. && npx wrangler deployments list --config wrangler.site.jsonc

# ロールバック
npx wrangler rollback [VERSION_ID]
```

- Version ID は `docs/DEPLOY_LOG.md` に記録
- ロールバック後もログに追記する
- D1 はコードと別。必要ならバックアップから復元

---

## 9. よくある問題

| 症状 | 原因 / 対処 |
|---|---|
| `Working tree is not clean` | commit / stash してから再実行 |
| production で branch 拒否 | `main` に切り替える |
| production で ahead 拒否 | `git push origin main` |
| Version ID が `unknown` | wrangler 出力を確認し、手動でログ修正 |
| 新しいページが 404 | デプロイ漏れ / `.assetsignore` を確認 |
| CORS エラー | `ALLOWED_ORIGINS` を確認し API を再デプロイ |
| メールが送れない | `RESEND_API_KEY` / `MAIL_FROM` / Resend 検証 |
| `.html` が 307 | 仕様。拡張子なし URL が正 |
| 検索に出てしまう | `_headers` の noindex / 旧 GitHub Pages を確認 |
| 旧 GitHub Pages が最新 | push で自動更新される。無効化を検討 |

---

## 10. 現在の状態（2026-11-04）

```text
Phase        : 7-6-2E クローズドベータ準備完了
Production   : https://gakushulab.com/ (noindex)
Staging      : https://ai-math-tutor-staging.g4pjo75.workers.dev/
API          : 0.7.0 (staging / production)
Stripe       : test mode (live 未接続)
D1           : production 0005 適用済み
Beta         : 手動ライセンス配布 / 決済ボタン無効
```

- ベータ中は live 決済を有効化しない
- 公開時に noindex を解除する
- 旧 GitHub Pages はロールバック用に残している

---

## 11. 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| `docs/DEPLOY_LOG.md` | デプロイ履歴と自動記録 |
| `docs/OPS.md` | 障害対応・ロールバック・D1 baseline |
| `docs/OPERATOR_SETUP.md` | 運営者設定（メール・ドメイン・Stripe） |
| `docs/BETA.md` | クローズドベータ運用 |
| `docs/LAUNCH_CHECKLIST.md` | 公開前チェック |
| `docs/ARCHITECTURE.md` | システム構成 |
