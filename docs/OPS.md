# 運用ランブック (Operations Runbook)

本書は AI家庭教師（ai-math-tutor）の運用管理手順書です。

## 1. D1 データベース バックアップと復元

### バックアップ手順
定期運用または本番デプロイ前に、以下のコマンドでリモートD1のSQLダンプを取得します。
生成される `backups/` ディレクトリは `.gitignore` によりリポジトリ管理外となっています。

```bash
cd server

# Staging D1 バックアップ
npm run d1:backup:staging
# 出力先: server/backups/staging.sql

# Production D1 バックアップ (本番のみ)
npm run d1:backup:prod
# 出力先: server/backups/prod.sql
```

### 復元 (リストア) 手順
障害発生時にバックアップSQLからDBを復元する場合の手順:

```bash
cd server

# Staging D1 復元
npx wrangler d1 execute ai-math-tutor-db-staging --remote --config wrangler.staging.jsonc --file=backups/staging.sql -y

# Production D1 復元
npx wrangler d1 execute ai-math-tutor-db --remote --file=backups/prod.sql -y
```

## 2. LICENSE_SECRET 不変の原則

`LICENSE_SECRET` は、Stripe Checkout Session ID から決定論的（Deterministic）にライ선スキー（`AMT-XXXX-XXXX-XXXX-XXXX`）を導出するためのHMACシークレットです。

> **最重要注意事項**
> `LICENSE_SECRET` を変更・再生成すると、既存の全有料ユーザーのライセンスキー再導出結果が変わり、キーの再発行・認証・復旧がすべて失敗します。
> 一度設定した `LICENSE_SECRET` は **絶対に再生成・上書きしてはなりません**。
> セキュアなキー保管庫（Bitwarden/1Password等）に原本を永続保管してください。

## 3. APIキー / シークレット ローテーション手順

### Stripe API キー / Webhook Secret の更新
1. Stripeダッシュボード（またはCLI）で新しい Restricted API Key または Webhook Endpoint を作成。
2. Wrangler経由で Worker シークレットを更新:
   ```bash
   cd server
   # Staging
   npx wrangler secret put STRIPE_SECRET_KEY --config wrangler.staging.jsonc
   npx wrangler secret put STRIPE_WEBHOOK_SECRET --config wrangler.staging.jsonc

   # Production
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
3. Staging/Productionの `/health` およびテストエンドポイントで疎通確認後、古いキーをStripe側で無効化。

### Google Gemini API キーの更新
1. Google AI Studio で新しい API Key を発行。
2. Worker シークレットを更新:
   ```bash
   cd server
   npx wrangler secret put GEMINI_API_KEY --config wrangler.staging.jsonc
   npx wrangler secret put GEMINI_API_KEY
   ```
3. `/v1/solve` 経由の簡単なリクエストで動作確認後、旧キーをRevoke。

### Resend API キーの更新
1. Resendダッシュボードで API Key を発行。
2. Worker シークレットを更新:
   ```bash
   cd server
   npx wrangler secret put RESEND_API_KEY --config wrangler.staging.jsonc
   npx wrangler secret put RESEND_API_KEY
   ```

## 4. コスト / 予算アラート設定

### Cloudflare & Worker 予算ガード
Worker 側の環境変数で1日あたり・1ヶ月あたりのAI API原価上限を設定できます。
- `DAILY_COST_LIMIT_MICRO_YEN`: 1日のAPI原価上限（マイクロ円単位、1円 = 1,000,000）
- `MONTHLY_COST_LIMIT_MICRO_YEN`: 1ヶ月のAPI原価上限（マイクロ円単位）
- 上限に達した場合、`/v1/solve` は `503 budget_exceeded` を返し、予期せぬAPI課金の暴走を自動防御します。

### Gemini API 課金アラート
Google Cloud Console 側の「お支払い」>「予算とアラート」にて、月間想定予算の 50%, 80%, 100% で管理者にメール通知が届くよう設定してください。

## 5. 監視とアラート (Monitoring)

### Worker ログと 5xx エラーの監視
```bash
cd server
# リアルタイムログストリーミング
npx wrangler tail --config wrangler.staging.jsonc
npx wrangler tail
```

### Webhook 失敗の監視
- Stripeダッシュボード > Developers > Webhooks で送信ステータスを確認。
- `200` 以外のステータス（400/500等）が連続発生している場合、署名ミスマッチまたはD1障害を調査。
- `email: "failed"` の場合はライセンス発行自体は成功しているため、ユーザーから問い合わせがあった際にサポート手順でキーを案内。

## 6. 障害発生時の緊急ロールバック手順

### Worker API のロールバック
Cloudflare Deployments 一覧から前バージョンのデプロイメントIDを確認し、瞬時にロールバックできます:
```bash
cd server
npx wrangler rollback [DEPLOYMENT_ID] --config wrangler.staging.jsonc
npx wrangler rollback [DEPLOYMENT_ID]
```

### 静的サイトのロールバック
- Staging: 前回のコミットから `npx wrangler deploy` を再実行。
- Production: GitHub Pages の `main` ブランチを前回安定タグ/コミットに戻して push。

## 7. ログ保持ポリシー (Log Retention)

### recovery_log 保持期間
- ライセンス復旧のレートリミット（1時間あたりIP 10回 / Email+IP 3回）の判定に使用する `recovery_log` テーブルは、プライバシー保護およびDBサイズ抑制のため、**保持期間を7日間**としています。
- `/v1/recover` リクエスト処理時に 7日（`Date.now() - 7 * 24 * 60 * 60 * 1000`）を超過したレコードは自動削除（cleanup）されます。
- メールアドレスやキーの生データは記録せず、SHA-256ハッシュのみを保持します。
