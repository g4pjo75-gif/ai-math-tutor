# Closed Beta 運用ガイド — Phase 7-6-2E

> **目的**: live 決済を有効化する前に、実端末・実利用で品質とサポート手順を検証する<br>
> **期間**: 2026-11-05 〜 2026-11-19（2週間、必要なら延長）<br>
> **規模**: 5〜10名（招待制）<br>
> **決済**: 行わない（Stripe は test mode のまま）<br>
> **ライセンス**: 運営者が手動発行

---

## 0. 前提

- サイトは **noindex** のまま（検索に出さない）
- live Stripe はまだ有効化しない
- production API は `0.7.0`
- ベータ参加者には **手動発行ライセンス**を配布
- 不具合は `support@gakushulab.com` で受け付ける

> ベータ中は「売上」より「不具合の発見」を優先する。<br>
> 決済・返金・請求の検証は live 移行時に行う。

---

## 1. ベータ中の制約

| 項目 | ベータ中 | live 移行後 |
|---|---|---|
| 決済 | 行わない | Stripe live |
| 料金ページ | 招待制の案内 | サブスク開始ボタン |
| ライセンス | 手動発行 | Stripe webhook で自動発行 |
| 検索露出 | noindex | 公開時に解除 |
| サポート | `support@gakushulab.com` | 同左 |

---

## 2. 予算（重要）

現在の production 予算:

```text
DAILY_COST_LIMIT_MICRO_YEN   = 50000000    (¥50/日)
MONTHLY_COST_LIMIT_MICRO_YEN = 1000000000  (¥1,000/月)
```

ベータでは 5〜10 名が同時に試すため、**上限に当たりやすい**です。ベータ期間中のみ引き上げることを推奨します。

```jsonc
// server/wrangler.jsonc
"DAILY_COST_LIMIT_MICRO_YEN": "300000000",     // ¥300/日
"MONTHLY_COST_LIMIT_MICRO_YEN": "5000000000"   // ¥5,000/月
```

反映:

```bash
cd /home/park/projects/ai-math-tutor/server
npx wrangler deploy
curl -sS https://ai-math-tutor-api.g4pjo75.workers.dev/health
```

- 実コストを見ながら日次で調整
- live 移行時に本番用の値へ戻す
- 予算超過時は `503 budget_exceeded` が返る

---

## 3. ライセンス発行

### 3.1 発行

```bash
cd /home/park/projects/ai-math-tutor/server
node scripts/new-license.mjs --remote --email tester@example.com --plan standard --limit 300 --days 30
```

- キーは **1回だけ** 表示される
- 表示されたキーはすぐに安全な場所へ控える
- **リポジトリ・チャット・スクリーンショットに残さない**

### 3.2 配布

- 招待メール（後述テンプレート）で送る
- キーはメール本文に記載
- 「第三者に共有しない」「スクリーンショットはマスクする」と明記

### 3.3 台帳（リポジトリ外）

スプレッドシート等で管理します。**キーは台帳に書かない**（license id のみ）。

| 項目 | 例 |
|---|---|
| 参加者 | tester@example.com |
| license id | `lic_xxxxxxxxxxxxxxxx` |
| 発行日 | 2026-11-05 |
| 有効期限 | 2026-12-05 |
| 端末 | iPhone Safari / Android Chrome |
| 状態 | active / revoked |
| フィードバック | 未 / 受領 / 対応済み |

### 3.4 失効・再発行

```bash
# 失効
npx wrangler d1 execute ai-math-tutor-db --remote \
  --command "UPDATE licenses SET status='revoked' WHERE id='lic_xxxxxxxxxxxxxxxx'"

# 端末解除
node scripts/unlink-device.mjs --remote --email tester@example.com --all

# 再発行（新しいキーを発行）
node scripts/new-license.mjs --remote --email tester@example.com --plan standard --limit 300 --days 30
```

> 手動発行ライセンスは `stripe_session_id` を持たないため、**recover ページでキー再送できません**。<br>
> キーを紛失した場合は、旧ライセンスを失効させて再発行してください。

---

## 4. 招待メールテンプレート

```text
件名: 【AI家庭教師】クローズドベータのご案内

〇〇様

AI家庭教師のクローズドベータにご参加いただき、ありがとうございます。

■ アクセスURL
数学: https://gakushulab.com/math/
英語: https://gakushulab.com/english/

■ ライセンスキー
AMT-XXXX-XXXX-XXXX-XXXX

■ 利用開始手順
1. 上記URLを開く
2. 右上の ⚙️ 設定を開く
3. 「ライセンスキー」を入力して保存
4. 問題を入力するか、写真を撮影して解いてみてください

■ お願い
・ライセンスキーは第三者に共有しないでください（最大2台まで）
・スクリーンショットを送る際は、キー部分を必ず隠してください
・不具合やご意見は support@gakushulab.com まで

■ 特に見ていただきたい点
・数学/英語の通常の問題
・写真からの問題読み取り
・音声入力
・クイズ
・オフライン時の再読み込み
・スマートフォンでの表示

ベータ期間: 2026-11-05 〜 2026-11-19

ご協力よろしくお願いいたします。
AI家庭教師 サポート
support@gakushulab.com
```

---

## 5. テスター手順

1. `https://gakushulab.com/math/` または `/english/` を開く
2. ⚙️ 設定 → ライセンスキーを入力 → 保存
3. 問題を1問解く
4. 写真・音声・クイズを試す
5. オフラインにして再読み込み
6. 気づいた点を `support@gakushulab.com` へ

---

## 6. テストチェックリスト

### 6.1 数学

- [ ] テキスト問題を1問解く
- [ ] 画像1問を読み取って解く
- [ ] 画像複数問（2〜3問）を解く
- [ ] 6問画像（既知の timeout 対象）を試す
- [ ] 音声入力
- [ ] クイズ → 結果
- [ ] 履歴
- [ ] 類似問題
- [ ] 設定モーダル
- [ ] ライセンス登録 / 残回数表示
- [ ] ダークモード
- [ ] オフライン再読み込み

### 6.2 英語

- [ ] Reading
- [ ] Quiz
- [ ] Writing
- [ ] Wordbook
- [ ] 音声
- [ ] 設定 / ライセンス
- [ ] ダークモード
- [ ] オフライン

### 6.3 端末 / PWA

- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] PWA インストール
- [ ] モバイル幅でレイアウト崩れなし
- [ ] 画面回転
- [ ] スリープ復帰

### 6.4 エラー系

- [ ] 無効なライセンスキー → エラー表示
- [ ] 端末上限（3台目）→ `device_limit` 表示
- [ ] クォータ超過 → `quota_exceeded`
- [ ] ネットワーク断 → 再試行導線
- [ ] 予算超過（意図的に発生させない）

---

## 7. 既知の問題と回避策

| 問題 | 状況 | 回避策 |
|---|---|---|
| 6問画像問題の timeout | 既知 | 1〜2問に分割して試す |
| KaTeX を CDN から読み込み | P1 | オフライン時は数式表示が崩れる可能性 |
| 端末解除が CLI のみ | P1 | 運営者が `unlink-device.mjs` で対応 |
| 手動キーの再送不可 | 仕様 | 失効 → 再発行 |
| 大型画像で時間がかかる | 既知 | 画像を小さくする |

---

## 8. フィードバック収集

メールで以下を依頼します。

```text
1. 使った機能（数学/英語/写真/音声/クイズ など）
2. 端末とブラウザ
3. 良かった点
4. 困った点（できれば再現手順）
5. 続けたいか / 価格感
```

- スクリーンショットはキーをマスク
- 不具合は「再現手順・期待・実際」の3点で
- 個人情報はサポート対応の範囲内で扱う

---

## 9. 日次運用

- [ ] `wrangler tail` または Cloudflare ログで 5xx / webhook 失敗を確認
- [ ] 使用量・原価を確認

```bash
cd /home/park/projects/ai-math-tutor/server
npx wrangler d1 execute ai-math-tutor-db --remote \
  --command "SELECT COUNT(*) AS calls, COALESCE(SUM(cost_micro_yen),0) AS cost_micro_yen FROM usage WHERE created_at >= (strftime('%s','now') - 86400) * 1000"
```

- [ ] 予算上限に近づいていないか
- [ ] 新規フィードバック
- [ ] 未対応の不具合

---

## 10. 障害対応

| 症状 | 対応 |
|---|---|
| 特定ユーザーだけ失敗 | ライセンス状態・端末バインド確認 |
| 全ユーザーで失敗 | `/health`、Worker ログ、D1、Resend |
| 予算超過 | 上限引き上げ or 一時停止を判断 |
| キー漏えい疑い | 該当ライセンスを `revoked` |
| 端末上限 | `unlink-device.mjs` |

---

## 11. 終了条件（live へ進む）

- [ ] P0 不具合が 0
- [ ] 3名以上が数学・英語の主要フローを完了
- [ ] 画像問題の timeout が修正済み、または回避策を許容
- [ ] サポート窓口・テンプレートが機能
- [ ] 予算・原価が想定内
- [ ] ベータ参加者のフィードバックを反映済み
- [ ] 特定商取引法表記の最終確認
- [ ] live Stripe の準備完了

---

## 12. live 移行前チェック

- [ ] ベータライセンスを失効、または live 用に整理
- [ ] 料金ページを live 用に戻す（招待制の案内を削除）
- [ ] 予算を本番値に設定
- [ ] Stripe live キー / webhook / portal
- [ ] 実カードで決済 → 返金 → 解約
- [ ] 公開時に noindex を解除
- [ ] 旧 GitHub Pages の扱いを決定

---

## 13. 付録コマンド

```bash
cd /home/park/projects/ai-math-tutor/server

# 発行
node scripts/new-license.mjs --remote --email tester@example.com --plan standard --limit 300 --days 30

# 失効
npx wrangler d1 execute ai-math-tutor-db --remote \
  --command "UPDATE licenses SET status='revoked' WHERE id='lic_xxxxxxxxxxxxxxxx'"

# 端末解除
node scripts/unlink-device.mjs --remote --email tester@example.com --all

# 稼働確認
curl -sS https://ai-math-tutor-api.g4pjo75.workers.dev/health

# 予算確認（直近24時間）
npx wrangler d1 execute ai-math-tutor-db --remote \
  --command "SELECT COUNT(*) AS calls, COALESCE(SUM(cost_micro_yen),0) AS cost_micro_yen FROM usage WHERE created_at >= (strftime('%s','now') - 86400) * 1000"
```
