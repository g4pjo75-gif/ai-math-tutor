# AIチューター アーキテクチャ設計書

> **対象リポジトリ**: `ai-math-tutor`  
> **現行バージョン**: `v1.6-beta` (`index.html` 170,932 bytes / 3,598行)  
> **最終更新**: 2026-10-27  
> **目的**: 数学I・Aに続いて英語アプリを追加するための、リポジトリ構成・共有範囲・PWA/SW・移行手順の設計

---

## 0. 結論

1. **同一リポジトリで運用する。**
2. **数学と英語は別アプリ・別PWA・別manifest・別Service Worker**にする。
3. **共通コードだけを `shared/` に置く。**
4. **当面は数学をリポジトリのルートに置く。**  
   v1.6で `sw.js` を導入済みのため、今すぐ `/math/` へ移すと、Service Workerのスコープ移行とPWA再インストールが発生する。  
   `root = 数学` + `english/` + `shared/` でもアプリ分離は十分可能。
5. **`ai-english-tutor` を別リポジトリにはしない。**  
   共有コードの重複、同一originでのlocalStorage衝突、将来の保護者ダッシュボードを考えると、同一リポジトリの方が有利。
6. `/math/` へ移す対称構造は、**英語v1.0以降またはカスタムドメイン導入時**に、付録Aの手順で行う。

---

## 1. 現状

| 項目 | 内容 |
|:---|:---|
| アプリ | 数学I・A AI家庭教師 `v1.6-beta` |
| ファイル | `index.html` 170,932 bytes / 3,598行（単一ファイル+インラインJS） |
| 主な機能 | 写真解析、複数小問、単元別解説、KaTeX、SVGグラフ、4択クイズ、直接入力、ステップ別Q&A、音声、マイノート |
| PWA | `manifest.json` + `sw.js`（`amt-cache-v1.8`、scope `/ai-math-tutor/`） |
| ストレージ | `STORAGE_PREFIX = 'amt_'`。旧キー（prefixなし）も読み取り互換 |
| 配信 | GitHub Pages `/ai-math-tutor/` |
| ドキュメント | `docs/PLAN_v1.6.md`（未コミットの可能性あり） |
| バックアップ | `backup/`（`.gitignore`対象） |

### 1.1 v1.6で増えた重要な要素

- `sw.js` によるオフラインキャッシュ（network-first）
- `manifest.json` の `id` / `start_url` / `scope`
- `amt_` prefix付き `safeStorage`
- 4択クイズ、SVGグラフ、ステップQ&A
- トースト、自動再生タイマー、IME Enterガードなど

このうち **`sw.js` の存在が、フォルダ移行の難易度を大きく変える**。設計上は最初にここを押さえる。

---

## 2. なぜ別リポジトリにしないか

| 観点 | 同一リポジトリ + フォルダ | 別リポジトリ |
|:---|:---|:---|
| 共有コード | `shared/` を相対パスで利用 | コピー / submodule / npmパッケージ |
| localStorage | 同一origin。prefixで分離 | **同じく同一origin。prefixは必須** |
| Service Worker | パスごとにscopeを分けられる | リポジトリごとに自然に分離 |
| 配備 | 1リポジトリで管理 | 2リポジトリの設定・ secrets・デプロイ |
| 保護者ダッシュボード | `/parent/` から両方のデータを読める | originは同じだが構成が分散 |
| バグ修正 | 共通部分を1回直せば両方に反映 | 両方に同じ修正が必要 |
| 独立リリース | パス単位で可能 | 完全に独立 |

### 2.1 別リポジトリが向いているケース

- 英語を別の人・別チームが開発する
- 英語を非公開で開発し、完成後に公開したい
- 数学と英語を完全に別プロダクトとして運用する
- 別ドメイン・別認証・別課金にする

今回は「同じ家庭で、同じAPIキー・同じ学習データ基盤を使う」想定なので、**同一リポジトリ推奨**。

### 2.2 同一originの注意

GitHub Pagesは `https://g4pjo75-gif.github.io` がoriginになる。  
`/ai-math-tutor/` と `/ai-english-tutor/` は**別リポジトリでも同じlocalStorageを共有**する。

そのため、どちらの方式でも以下は必須。

- `math` / `english` でキーを分離する
- 共通設定（PIN、APIキー）は共有キーに寄せる
- 旧キーからの移行処理を入れる

---

## 3. 目標ディレクトリ構成

### 3.1 推奨（当面）

```text
ai-math-tutor/                 # リポジトリ名はURL維持のため変更しない
├── index.html                 # 数学アプリ（現行URLを維持）
├── manifest.json              # 数学PWA
├── sw.js                      # 数学Service Worker
├── icon-192.png
├── icon-512.png
├── apple-touch-icon.png
├── shared/
│   ├── storage.js             # prefix付きsafeStorage
│   ├── core.js                # Gemini API / timeout / retry / quota
│   ├── speech.js              # lang対応TTS
│   ├── ui.js                  # toast / modal / dark / safe-area
│   └── ui.css                 # 共通UIスタイル
├── english/
│   ├── index.html             # 英語アプリ
│   ├── manifest.json          # 英語PWA
│   ├── sw.js                  # 英語Service Worker
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── docs/
│   ├── PLAN_v1.6.md
│   └── ARCHITECTURE.md
└── backup/
```

- 数学: `https://g4pjo75-gif.github.io/ai-math-tutor/`
- 英語: `https://g4pjo75-gif.github.io/ai-math-tutor/english/`
- ホーム画面には「AI数学」「AI英語」の2アイコン。

### 3.2 将来の対称構造（任意）

```text
ai-math-tutor/
├── index.html                 # ルート: /math/ へのリダイレクト
├── math/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   └── icons...
├── english/
├── shared/
├── parent/                    # 将来の保護者ダッシュボード
└── docs/
```

- ルートURLを `/math/` に変えるため、既存PWAの再インストールが必要。
- 手順は**付録A**を参照。
- 今すぐではなく、英語v1.0以降またはカスタムドメイン導入時に実施する。

---

## 4. URL / PWA / Service Worker設計

### 4.1 URL

| アプリ | URL | manifest | SW scope |
|:---|:---|:---|:---|
| 数学 | `/ai-math-tutor/` | `/ai-math-tutor/manifest.json` | `/ai-math-tutor/` |
| 英語 | `/ai-math-tutor/english/` | `/ai-math-tutor/english/manifest.json` | `/ai-math-tutor/english/` |

### 4.2 重要な問題: ルートSWが英語まで制御する

現在の数学SWは `/ai-math-tutor/sw.js` にあり、scopeは `/ai-math-tutor/`。  
このままだと、**英語ページ `/english/` も数学SWの制御対象**になる。

- 数学SWのfetchハンドラが英語のHTML/JS/画像までキャッシュする
- 英語の更新が数学キャッシュに混ざる
- オフライン時に古い英語ページが返る可能性がある

#### 対策: 数学SWに英語パスを除外するガードを入れる

`sw.js` のfetchハンドラの先頭に追加する。

```js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 英語アプリは英語SWに任せる（数学SWではキャッシュしない）
  const englishPrefix = new URL('english/', self.registration.scope).pathname;
  if (url.origin === self.location.origin && url.pathname.startsWith(englishPrefix)) {
    return; // respondWithしない = ブラウザ/英語SWが処理
  }

  if (event.request.method !== 'GET') return;
  // 既存のnetwork-first処理...
});
```

- `self.registration.scope` から英語パスを算出するので、リポジトリ名が変わっても動く。
- ガード追加時はキャッシュ名を `amt-cache-v1.7` などに上げる。
- 英語SWが未登録の間は、ガードによりネットワークへフォールバックする（オフライン英語はまだ不可）。

### 4.3 manifest

#### 数学（現行）

```json
{
  "id": "./",
  "name": "AI 数学I・A チューター",
  "short_name": "AI数学",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "theme_color": "#1e3a2f",
  "background_color": "#142820",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- 現状のままで問題ない。
- 将来 `/math/` へ移す場合は `start_url: "./"` に変更する。

#### 英語

```json
{
  "id": "./",
  "name": "AI 英語チューター",
  "short_name": "AI英語",
  "description": "写真から学ぶ高校英語 AI家庭教師",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "theme_color": "#1e3a5f",
  "background_color": "#0f172a",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- `english/manifest.json` に置く。
- `id` / `start_url` / `scope` は `./` で `/english/` を指す。
- アイコン・テーマカラーは数学と別にする。

### 4.4 英語SW

`english/sw.js`:

```js
const CACHE_NAME = 'aet-cache-v1.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  '../shared/storage.js',
  '../shared/core.js',
  '../shared/speech.js',
  '../shared/ui.js',
  '../shared/ui.css'
];
```

- 相対パスは `english/sw.js` 基準で解決される。
- 英語SWのscopeは `/ai-math-tutor/english/`。
- 数学SWのガードにより、英語リクエストは数学SWでキャッシュされない。
- キャッシュ名は数学と分ける（`aet-cache-*`）。

### 4.5 登録

- 数学: `navigator.serviceWorker.register('./sw.js')`（現行どおり）
- 英語: `navigator.serviceWorker.register('./sw.js')`（`english/index.html` から。scopeは `/english/`）

### 4.6 更新方針

- 共有モジュールを更新したら、両アプリのSWキャッシュ名を上げる。
- `shared/*.js` の読み込みに `?v=YYYYMMDD` を付けると、SW更新前でもブラウザキャッシュを回避しやすい。
- 例:
  ```html
  <script src="../shared/core.js?v=20261027"></script>
  ```
- Service Workerの`skipWaiting` / `clients.claim`は現行方式を踏襲する。

---

## 5. 共有範囲

### 5.1 共有するもの（`shared/`）

| モジュール | 内容 |
|:---|:---|
| `storage.js` | prefix付き`getItem/setItem/removeItem`、旧キー移行、容量エラー処理 |
| `core.js` | `fetchWithTimeout`、`callGeminiModel`、`fetchAvailableModels`、`parseJson`、`isQuotaError` |
| `speech.js` | `lang`対応のTTS、文分割、記号除去、音声選択 |
| `ui.js` | トースト、モーダル開閉、ダークモード、safe-area、背景クリック |
| `ui.css` | 共通テーマ、ダークモード、トースト、モーダル、カード基盤 |

### 5.2 共有しないもの

| 領域 | 理由 |
|:---|:---|
| システムプロンプト / responseSchema | 数学と英語で教育設計が違う |
| 単元リスト / 問題タイプ | カリキュラムが違う |
| SVGグラフレンダラー | 数学固有。英語は読解・語彙・表が中心 |
| 数学の記号パレット / 4択の数式選択肢 | 英語では不要 |
| 数学のステップQ&Aプロンプト | 英語は文法・読解用の別プロンプト |
| manifest / アイコン / テーマカラー | PWAを分ける |
| モデル・温度・音声速度の既定値 | 科目ごとに調整 |

### 5.3 将来共有候補

以下は英語でも再利用できる可能性が高い。v1.6では数学内に置き、英語v0.1で必要になったら`shared/`へ移す。

- 4択クイズの選択肢UI・シャッフル・ローカル採点
- ステップ/段落単位のインラインQ&Aシェル
- マイノートの一覧・検索UI
- 音声再生ボタン、速度選択

---

## 6. ストレージ設計

### 6.1 現状

- `safeStorage` が `amt_` を自動付与する。
- 論理キー `tutor_history` は物理キー `amt_tutor_history`。
- 旧バージョンのprefixなしキーも読み取りフォールバックしている。

### 6.2 推奨キー

| 用途 | 物理キー | 備考 |
|:---|:---|:---|
| 共通PIN | `tutor_pin` | 数学・英語で共有 |
| 共通Geminiキー | `tutor_gemini_api_key` | 1回入力で両方利用 |
| 共通ダークモード | `tutor_dark_mode` | アプリ間で統一 |
| 数学ノート | `amt_tutor_history` | 現行キーを維持 |
| 数学モデル | `amt_selected_model`, `amt_custom_model_id`, `amt_available_gemini_models` | 現行維持 |
| 数学音声 | `amt_preferred_voice_uri`, `amt_speech_rate` | 現行維持 |
| 数学クイズ | `amt_quiz_input_mode` | 現行維持 |
| 英語ノート | `aet_history` | 新規 |
| 英語モデル | `aet_selected_model`, `aet_custom_model_id` | 新規 |
| 英語音声 | `aet_voice_uri`, `aet_speech_rate` | 新規 |
| 英語クイズ | `aet_quiz_input_mode` | 新規 |

- 数学の既存キーは**無理に改名しない**。移行リスクの方が大きい。
- 共通設定だけ `tutor_*` に寄せる。
- 英語は `aet_*` で完全に分離する。

### 6.3 移行

初回起動時に以下を1回だけコピーする。

```js
// 数学側
if (!sharedStore.getItem('pin') && mathStore.getItem('app_pin')) {
  sharedStore.setItem('pin', mathStore.getItem('app_pin'));
}
if (!sharedStore.getItem('gemini_api_key') && mathStore.getItem('gemini_api_key')) {
  sharedStore.setItem('gemini_api_key', mathStore.getItem('gemini_api_key'));
}
if (!sharedStore.getItem('dark_mode') && mathStore.getItem('dark_mode')) {
  sharedStore.setItem('dark_mode', mathStore.getItem('dark_mode'));
}
```

- 旧キーは1リリース分残す。
- 削除は移行確認後。
- `safeStorage.getItem` は「新キー → 旧キー → prefixなし」の順で読む。

### 6.4 safeStorage 工場

```js
window.TutorStorage = {
  create({ prefix, legacyPrefixes = [] }) {
    const memory = {};
    const candidates = (key) => [
      `${prefix}${key}`,
      ...legacyPrefixes.map((p) => `${p}${key}`),
      key
    ];
    return {
      getItem(key) {
        for (const k of candidates(key)) {
          try {
            const v = localStorage.getItem(k);
            if (v !== null) return v;
          } catch (e) {}
          if (k in memory) return memory[k];
        }
        return null;
      },
      setItem(key, value) {
        const k = `${prefix}${key}`;
        memory[k] = String(value);
        try {
          localStorage.setItem(k, String(value));
          return true;
        } catch (e) {
          console.warn('localStorage.setItem failed:', e);
          return false;
        }
      },
      removeItem(key) {
        const k = `${prefix}${key}`;
        delete memory[k];
        try { localStorage.removeItem(k); } catch (e) {}
      }
    };
  }
};
```

使用例:

```js
const sharedStore = TutorStorage.create({ prefix: 'tutor_', legacyPrefixes: ['amt_'] });
const mathStore   = TutorStorage.create({ prefix: 'amt_',   legacyPrefixes: [''] });
const engStore    = TutorStorage.create({ prefix: 'aet_',   legacyPrefixes: [''] });
```

### 6.5 容量

- 履歴は100件→50件を検討。
- グラフ・Q&A履歴が増えるため、1件あたりの上限を決める。
  - `visual` は1ステップ1件
  - `followups` は4メッセージ
  - 1メッセージ500文字
- `setItem` の戻り値を確認し、失敗時はトーストで知らせる。

---

## 7. モジュール契約

### 7.1 読み込み順

各アプリのHTML末尾で、共有モジュール→アプリ本体の順に読み込む。

```html
<!-- 数学: ルート -->
<script src="./shared/storage.js"></script>
<script src="./shared/core.js"></script>
<script src="./shared/speech.js"></script>
<script src="./shared/ui.js"></script>
<script>/* 数学アプリ本体 */</script>
```

```html
<!-- 英語: /english/ -->
<script src="../shared/storage.js"></script>
<script src="../shared/core.js"></script>
<script src="../shared/speech.js"></script>
<script src="../shared/ui.js"></script>
<script>/* 英語アプリ本体 */</script>
```

- ビルドツールは使わない。`window.Tutor*` のグローバル名前空間で公開する。
- 共有モジュールはDOMの特定IDに依存しない。
- アプリ固有の描画はアプリ側に残す。

### 7.2 `core.js`

```js
window.TutorCore = {
  fetchWithTimeout(url, options, timeoutMs = 25000),
  async callGeminiModel({
    modelId,
    apiKey,
    promptText,
    imageBase64 = null,
    schema = null,
    rawText = false,
    temperature = 0.35,
    maxOutputTokens = 8192,
    timeoutMs = 25000
  }),
  async fetchAvailableModels({ apiKey }),
  parseJson(rawText),
  isQuotaError(error)
};
```

- 現在の `callGeminiModel` の挙動（25秒タイムアウト、400時のスキーマなし再送、空応答チェック）をそのまま移す。
- UI依存の `showQuotaError` は `ui.js` またはアプリ側に残す。
- 戻り値は「パース済みJSON」または「rawText」。

### 7.3 `speech.js`

```js
window.TutorSpeech = {
  create({
    lang = 'ja-JP',
    defaultRate = 0.95,
    voicePriority = [],
    onVoicesChanged = null
  }) {
    return {
      speak(text, { rate, voiceURI, onEnd } = {}),
      stop(),
      getVoices(),
      getSelectedVoice(),
      split(text),
      clean(text)
    };
  }
};
```

- 現在の `speakJapanese` / `splitSpeech` / `cleanTextForSpeech` / `getSelectedVoice` を移植。
- `lang` をハードコードしない。
- 数学: `lang: 'ja-JP'`、優先 `/kyoko|otoya|hattori/` → `/natural|online/` → `/google/`
- 英語: `lang: 'en-US'`（必要なら `en-GB`）、優先 `/samantha|ava|daniel|google us english/` → `/natural|online/`
- iOSの「無音スイッチ」注意文言はアプリ側に残す。

### 7.4 `ui.js`

```js
window.TutorUI = {
  showToast(message, type = 'info', duration = 2500),
  openModal(id),
  closeModal(id),
  initDarkMode({ storage, key = 'dark_mode' }),
  toggleDarkMode(),
  updateSafeArea(),
  bindBackdropClose(modalId)
};
```

- トーストは現行の `showToast` を汎用化。
- モーダルは `hidden` / `flex` の付け替えを共通化。
- PINはアプリ側に残してよい（数学と英語で同じ`tutor_pin`を読む）。

### 7.5 `ui.css`

- 共通テーマ、ダークモード、safe-area、トースト、モーダル、カード、ボタン基底。
- 数学固有の `.viz` / `.choice-btn` / `.step-chat-box` は数学側に残す。
- 英語固有の読解・語彙カードは英語側に置く。

---

## 8. 英語アプリ設計方針

### 8.1 位置づけ

- 数学アプリの「英語版コピー」ではない。
- 教科書・問題集の写真から、読解・文法・語彙・英作文を支援する別アプリ。
- PWA名: `AI 英語チューター` / `AI英語`
- URL: `/ai-math-tutor/english/`

### 8.2 数学と共通にしないもの

- `step` ベースの解説スキーマ
- SVG関数グラフ
- 数式記号パレット
- 数学の単元リスト
- 数学の採点プロンプト

### 8.3 英語側のデータ設計（v0.1案）

```json
{
  "lesson_type": "reading | grammar | vocabulary | writing",
  "passage": "本文",
  "translation": "日本語訳",
  "vocabulary": [
    { "word": "increase", "meaning": "増える", "example": "The number increased." }
  ],
  "grammar_points": [
    { "title": "関係代名詞 which", "explanation": "...", "example": "..." }
  ],
  "questions": [
    {
      "type": "choice | text",
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "correct_index": 1,
      "explanation": "..."
    }
  ],
  "writing_task": {
    "prompt": "...",
    "model_answer": "...",
    "rubric": ["内容", "文法", "語彙"]
  }
}
```

- 4択と直接入力は数学のUIを参考にしつつ、英語用に簡略化。
- 英作文はAIのルーブリック採点。
- 音声は例文・本文の読み上げ、速度調整。
- 発音チェック（Web Speech Recognition）はv0.1では任意。

### 8.4 音声

- 既定 `en-US`。必要なら `en-GB` を選択可能。
- 速度は数学より少し速め（0.95〜1.0）。
- 例文は「英語→日本語」の順で読むオプション。
- iOSの無音スイッチ注意は共通。

### 8.5 PWA

- `english/manifest.json`、`english/sw.js`、専用アイコン。
- ホーム画面には数学と別アイコン。
- テーマカラーは数学（緑）と区別できる青系。

### 8.6 カリキュラム

- 対象は日本の高校1年生（英語コミュニケーションI / 論理・表現I 相当）。
- 単元は英語側の設定ファイルに分離し、数学の `unitSelect` を流用しない。
- 教材名・進度は後から差し替え可能にする。

---

## 9. 移行手順

v1.6はデプロイ済み・本日作業完了の前提。**数学を壊さずに**段階的に進める。

### Phase 0 — 凍結とバックアップ

- [ ] `index.html` / `manifest.json` / `sw.js` を `backup/index.html.v1.6-YYYYMMDD-HHMMSS.bak` 等に退避
- [ ] `docs/` をコミット（現在untrackedの可能性あり）
  ```bash
  git add docs/
  git commit -m "docs: add v1.6 plan and architecture"
  ```
- [ ] `git tag v1.6-beta`
- [ ] 本番URLで数学アプリ・PWA・SWが正常なことを確認
- [ ] `git status` がcleanであることを確認

### Phase 1 — 共有モジュールの抽出（数学はルートのまま）

1. `shared/storage.js` を作成し、現在の `safeStorage` を工場化
2. 数学 `index.html` の `safeStorage` を `TutorStorage.create(...)` に置換
3. 旧キー移行（`amt_app_pin` → `tutor_pin` など）を追加
4. 数学の回帰テスト（ノート、PIN、APIキー、ダークモード）
5. 問題なければ `shared/core.js` を抽出
   - `fetchWithTimeout` / `callGeminiModel` / `fetchAvailableModels` / `parseTutorJson` / `isQuotaError`
6. `shared/speech.js` を抽出（`lang` パラメータ化）
7. `shared/ui.js` を抽出（トースト、モーダル、ダークモード、safe-area）
8. 各抽出ごとにコミットし、`sw.js` のキャッシュ名を上げる

> **一度に全部やらない。** 1モジュールごとに数学をテストする。

### Phase 2 — 英語の骨格

1. `english/` を作成
2. `english/index.html`（最小画面: PIN、設定、写真アップロード、結果表示）
3. `english/manifest.json`、`english/sw.js`、専用アイコン
4. 共有モジュールを `../shared/` から読み込む
5. 数学 `sw.js` に英語パス除外ガードを追加
6. 両方のPWAをインストールし、scope・キャッシュ・オフラインを確認

### Phase 3 — 英語v0.1

1. 英語プロンプト / スキーマ
2. 読解・文法・語彙の結果画面
3. 4択 / 直接入力
4. 音声（en-US）
5. マイノート（`aet_history`）
6. 数学とのキー衝突がないことを確認

### Phase 4 — 任意: `/math/` へ移動

- 英語v1.0以降、またはカスタムドメイン導入時に実施。
- 手順は付録A。
- 既存PWAの再インストールが必要。

---

## 10. テストとロールバック

### 10.1 数学の回帰

- [ ] 写真アップロード → 解説
- [ ] 複数小問題のタブ切替
- [ ] SVGグラフ表示（正常系・異常系）
- [ ] 4択クイズ（正解・不正解・直接入力）
- [ ] ステップQ&A（1ターン・複数ターン）
- [ ] マイノート保存・復元
- [ ] 音声（ja-JP、速度、停止）
- [ ] ダークモード
- [ ] PIN、APIキー、モデル取得
- [ ] PWAインストール・オフライン
- [ ] `node --check`、重複ID、コンソールエラー

### 10.2 SW / PWA

- [ ] 数学SWのscopeが `/ai-math-tutor/`
- [ ] 英語SWのscopeが `/ai-math-tutor/english/`
- [ ] 数学SWが `/english/` をキャッシュしない
- [ ] 英語SWが数学のキャッシュを壊さない
- [ ] 更新時に古いキャッシュが残らない
- [ ] オフライン時に数学・英語がそれぞれ表示できる
- [ ] ホーム画面に2アイコンが登録できる

### 10.3 ストレージ

- [ ] `amt_*` の既存データが読める
- [ ] `tutor_pin` / `tutor_gemini_api_key` へ移行できる
- [ ] 数学と英語の履歴が混ざらない
- [ ] 容量超過時にトーストが出る
- [ ] 旧キー削除後も動作する

### 10.4 ロールバック

- `git revert` または `git checkout v1.6-beta`
- SWキャッシュ名を戻す、またはキャッシュを削除
- 必要ならブラウザのサイトデータをクリア
- PWAを再インストール

---

## 11. リスク

| リスク | 影響 | 対策 |
|:---|:---|:---|
| ルートSWが英語を制御 | キャッシュ混線・更新不具合 | 数学SWに英語パス除外ガード |
| 数学を `/math/` へ移動 | PWA再インストール・SW移行 | 今は移動しない。付録Aで計画的に |
| 共有モジュール抽出の regression | 数学が動かない | 1モジュールずつ抽出・回帰テスト |
| localStorageキー衝突 | ノート・PIN・APIキー混線 | `amt_` / `aet_` / `tutor_` で分離 |
| 旧キー移行の失敗 | 設定・ノート消失 | 旧キーを1リリース残す、読み取りフォールバック |
| GitHub Pagesのキャッシュ | 更新が反映されない | SWキャッシュ名更新、`?v=`、強制リロード |
| 英語WIPが公開される | 未完成画面が見える | 英語は完成まで別ブランチ/別リポジトリ、または簡易PIN |
| コードツールの一度の変更が大きすぎる | 破壊的変更 | Phase分割、コミット単位を小さく |
| 別リポジトリ化 | 共有コードの drift | 同一リポジトリ + `shared/` を維持 |

---

## 12. 将来

### 12.1 保護者ダッシュボード

- 同一originの `/parent/` に置く。
- `amt_tutor_history` と `aet_history` を読み、科目別の学習状況を表示。
- 将来的にはSupabaseに同期。

### 12.2 Next.js + Supabase

- `/math` / `/english` / `/parent` のルートに再編。
- `shared/` を `packages/tutor-core` のような共有パッケージへ。
- 認証・課金・学習履歴はサーバー側へ。
- localStorageはオフラインキャッシュとして併用。

### 12.3 カスタムドメイン

- `tutor.example.com/math/`、`/english/` のように**同一originのパス**で運用すると、localStorageを共有できる。
- サブドメインに分けるとoriginが変わり、設定・ノートの移行が必要。
- 当面はGitHub Pagesのパス運用で十分。

---

## 付録A — 数学を `/math/` へ移す場合

> 英語v1.0以降、またはカスタムドメイン導入時に実施。  
> 既存PWAの再インストールとSW移行が必要。

### A.1 ファイル移動

```bash
mkdir -p math
git mv index.html math/index.html
git mv manifest.json math/manifest.json
git mv sw.js math/sw.js
git mv icon-192.png math/icon-192.png
git mv icon-512.png math/icon-512.png
git mv apple-touch-icon.png math/apple-touch-icon.png
```

### A.2 manifest更新

`math/manifest.json`:

```json
{
  "id": "./",
  "start_url": "./",
  "scope": "./"
}
```

- アイコンは相対パスのまま。

### A.3 SW更新

`math/sw.js`:

- `CACHE_NAME` を `amt-math-cache-v1.7` などに変更
- `ASSETS` の相対パスを `math/` 基準に確認
- `self.registration.scope` は `/ai-math-tutor/math/` になる

### A.4 ルートのリダイレクト

`/ai-math-tutor/index.html` をリダイレクト専用ページにする。  
**古いルートSWだけを解除**し、英語SWは残す。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=./math/">
  <title>AI数学チューターへ移動</title>
</head>
<body>
  <p><a href="./math/">数学チューターを開く</a></p>
  <script>
    (async () => {
      try {
        const rootScope = new URL('./', location.href).href;
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.filter((r) => r.scope === rootScope).map((r) => r.unregister())
        );
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith('amt-cache-')).map((k) => caches.delete(k))
        );
      } catch (e) {}
      location.replace('./math/');
    })();
  </script>
</body>
</html>
```

- ルートにはmanifestを置かない。
- 英語SW（scope `/english/`）は解除しない。

### A.5 数学ページ側の旧SW解除

`math/index.html` の起動時に、ルートSWが残っていれば解除する。

```js
if ('serviceWorker' in navigator) {
  const rootScope = new URL('../', location.href).href;
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => {
      if (r.scope === rootScope) r.unregister();
    });
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
```

- 新しい数学SWのscopeは `/ai-math-tutor/math/`。
- 旧ルートSWが制御していても、ページ内JSで解除できる。

### A.6 PWA再インストール

- 既存のホーム画面アイコンはルートを開く → リダイレクトで数学へ。
- 新しい `/math/manifest.json` を適用するため、ホーム画面に**一度追加し直す**。
- localStorageはorigin基準なので、ノート・PIN・APIキーは維持される。

### A.7 ロールバック

- `git revert` でファイルを戻す
- ルートSWを再登録（`/sw.js`）
- キャッシュを削除
- PWAを再インストール

---

## 付録B — 別リポジトリ `ai-english-tutor` を選ぶ場合

以下のいずれかに該当する場合のみ。

- 英語を別の開発者・チームが担当する
- 英語を非公開で開発し、完成後に公開する
- 数学と英語を完全に別プロダクトとして課金・認証する
- 別ドメインで運用する

構成例:

```text
ai-math-tutor/      # 数学
ai-english-tutor/   # 英語
```

注意点:

- 共有コードは npm パッケージ、git submodule、またはコピーで同期する。
- 同一origin（`g4pjo75-gif.github.io`）なので、localStorage prefixは必須。
- 保護者ダッシュボードを作る場合は、両方のキーを読む専用ページを別途用意する。
- 数学のSWは `/ai-math-tutor/`、英語のSWは `/ai-english-tutor/` で自然に分かれる。

---

## 付録C — 今すぐ実行するチェックリスト

```
[ ] docs/ をコミット（PLAN_v1.6.md, ARCHITECTURE.md）
[ ] git tag v1.6-beta
[ ] backup/ に v1.6 のバックアップ
[ ] 本番の数学PWA・SW・オフラインを確認
[ ] shared/storage.js を抽出
[ ] 数学の safeStorage を TutorStorage に置換
[ ] 旧キー移行（PIN / Geminiキー / ダークモード）
[ ] shared/core.js を抽出
[ ] shared/speech.js を抽出（lang対応）
[ ] shared/ui.js を抽出
[ ] 各抽出後に数学の回帰テスト
[ ] english/ の骨格作成
[ ] 数学SWに英語パス除外ガード
[ ] 英語PWAのmanifest/SW/アイコン
[ ] 2つのPWAをインストールしてscope確認
[ ] PROJECT_SPEC.md を更新
```

---

## まとめ

- **アプリは分ける。コードは共有する。**
- **数学はルートのまま**、英語を `english/` に追加する。
- **`shared/` は storage / core / speech / ui の4つから始める。**
- **Service Workerのscopeだけは最初に設計する。** ルートSWが英語を巻き込まないようガードする。
- **`/math/` への移動は急がない。** 必要になったら付録Aで計画的に。
- **別リポジトリは例外的な選択**。共有コードと同一originのことを考えると、同一リポジトリが有利。
