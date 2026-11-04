# Deploy Log

> **目的**: GitHub のコミットと Cloudflare のデプロイ（Version ID）を対応づけ、環境のズレを防ぐ<br>
> **対象**: `ai-math-tutor` の staging / production<br>
> **記録単位**: 1 デプロイ = 1 行

---

## 1. 記録ルール

- デプロイは **クリーンな working tree** から行う
- `main` に push 済みのコミットから行う（production は必須）
- **staging → 確認 → production** の順で進める
- 1 回のデプロイごとに以下を記録する
  - 日時（JST）
  - 環境（staging / production）
  - 対象（site / api）
  - コミット（short hash）
  - Cloudflare Version ID
  - 結果（OK / FAIL）
  - 備考（ブランチ、目的、ロールバック先など）
- **secret / ライセンスキー / webhook secret は記録しない**

> `scripts/deploy.mjs` を使うと、この表の「自動記録ログ」に 1 行自動追記されます。

---

## 2. 環境とデプロイ先

| 環境 | 対象 | Worker | URL |
|---|---|---|---|
| staging | site | `ai-math-tutor-staging` | `https://ai-math-tutor-staging.g4pjo75.workers.dev/` |
| staging | api | `ai-math-tutor-api-staging` | `https://ai-math-tutor-api-staging.g4pjo75.workers.dev/` |
| production | site | `ai-math-tutor-site` | `https://gakushulab.com/` |
| production | api | `ai-math-tutor-api` | `https://ai-math-tutor-api.g4pjo75.workers.dev/` |

---

## 3. これまでのデプロイ

> 2026-11-03 以前の一部は Version ID が未記録のため、コミットのみ記載しています。

| 日時 (JST) | 環境 | 対象 | コミット | Version ID | 結果 | 備考 |
|---|---|---|---|---|---|---|
| 2026-11-03 | staging | api | `babfcf6` | `9690da19-4c6f-456c-af98-038a32fa1521` | OK | 7-6-2A |
| 2026-11-03 | staging | site | `1957c4b` | `cbe59df8-d91d-4630-aad2-9ae44529a292` | OK | 7-6-2B-1B 仕上げ |
| 2026-11-03 | production | api | `243c6e8` | `5a44d9ab-07b1-465c-acaf-7582074b0540` | OK | 7-6-2C / 0.7.0 |
| 2026-11-03 | production | site | `e2a19b1` | （未記録） | OK | 7-6-2C cutover |
| 2026-11-03 | staging | site | `82da092` | `496a05c6-9804-4eac-ab62-1dbdc3f4266e` | OK | 法務表記 |
| 2026-11-03 | production | site | `82da092` | `963481eb-0b4f-4166-a0bb-00da731471ef` | OK | 法務表記 |
| 2026-11-04 | staging | site | `c32fa3d` | `a2a64876-d69a-45c6-9075-21f128f1fd53` | OK | クローズドベータ UI |
| 2026-11-04 | production | site | `c32fa3d` | `4346f70f-6d2b-47a0-872b-9d218ab6df79` | OK | クローズドベータ UI |
| 2026-11-04 | production | api | `c32fa3d` | `0863b6ac-2015-4781-8129-418fa77609cd` | OK | ベータ予算 ¥300/¥5,000 |

---

## 4. 自動記録ログ

> `node scripts/deploy.mjs <target>` 実行時に、この表の末尾へ 1 行追記されます。<br>
> 追記後は `docs/DEPLOY_LOG.md` をコミットしてください。

| 日時 (JST) | 環境 | 対象 | コミット | Version ID | 結果 | 備考 |
|---|---|---|---|---|---|---|
