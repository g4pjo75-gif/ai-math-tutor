# AI数学チューター v1.6 機能拡張計画書

> **対象**: `index.html` (v1.5-beta / 約2,410行 / 113KB)  
> **作成日**: 2026-10-27  
> **目的**: コード作成ツールへ実装を依頼するための詳細設計メモ  
> **前提**: UIテキストは日本語、単一 `index.html` 構成、修正前バックアップと `node --check` を必須とする

---

## 0. 概要

| No | 機能 | 方針 | 難易度 | 想定追加量 |
|:--:|:---|:---|:---:|:---:|
| 1 | グラフ・図形の解説 | AIは**構造化データ**のみ返し、クライアント側SVGレンダラーが描画 | 高 | 約500行 |
| 2 | 4択の答え入力 | 4択を基本 + 直接入力の併用 + 記号パレット。**採点はローカル** | 中 | 約300行 |
| 3 | ステップ単位の追加質問 | ステップカード内に、その部分だけを聞くインラインチャット | 高 | 約400行 |

### 先行修正（新機能より先に必要）

以下は新機能が直接依存するため、最初に対応する。

1. **マイノート保存時に元データを使う** (`index.html:679-694`)  
   現在はDOMの`textContent`を保存するため、KaTeX描画後の数式が崩れる（`$x^2$` → `x2`）。  
   → `currentProblems[currentProblemIndex]` の元データを保存する。グラフ・質問履歴の保存にも必須。
2. **`finishReason` / 空結果ガード** (`1658`, `1723`, `1927`)  
   図や選択肢で出力が長くなり、`MAX_TOKENS`でJSONが切れる危険が増える。
3. **ダークモードのステップカード** (`1949-2030`)  
   新しい図・チャットUIもダークモード対応が必要。
4. **IME Enterガード** (`395`)  
   日本語入力の変換確定Enterで送信されないようにする。新しい質問入力欄にも適用。

---

## 1. 共通設計

### 1.1 データの流れ

```
写真 / テキスト入力
  → Gemini 構造化出力
  → normalizeTutorResult()
  → problems[].steps[].visual      → renderVisual()   (SVG)
  → problems[].steps[].display_math → KaTeX
  → problems[].steps[].speech_ja    → Web Speech API
  → problems[].steps[].followups    → renderStepChat()
```

### 1.2 ファイル構成

- v1.6は**単一 `index.html` 維持**を推奨（PWA・キャッシュ・GitHub Pages配布の単純化）。
- `index.html` が150KBを超える場合は `viz.js` 分離を検討。
- 新しいコードは既存 `<script>` 内に以下のセクションを追加する。
  - `// 7. 図形描画エンジン (Visual Renderer)`
  - `// 8. 4択クイズ (Choice Quiz)`
  - `// 9. ステップ別フォローアップ質問 (Step Q&A)`
- CSSは既存 `<style>` に `/* v1.6 Visual / Quiz / Chat */` ブロックを追加する。

### 1.3 セキュリティ・安全原則（重要）

- **AIが生成したSVG/HTML文字列をそのまま挿入しない。**
- 図は `type` + 数値座標 + ラベル文字列だけを受け取り、**DOM API (`createElementNS`) でSVGを生成**する。
- すべてのラベルは `textContent` で挿入する。`innerHTML` は使わない。
- 座標・範囲はクランプする。
  - `|value| <= 10000`
  - 表示範囲の幅 `<= 200`
  - `curves <= 4`
  - `points <= 20`
  - `annotations <= 10`
  - `figure.elements <= 30`
- 文字数制限
  - `caption <= 80`
  - ラベル `<= 30`
  - annotation `<= 40`
- 不正な `visual` は静かに非表示にし、テキスト解説だけを表示する。

### 1.4 履歴スキーマのバージョン

```js
{
  version: 2,
  id, savedAt, unitHint, problem_label,
  recognized_problem, key_point,
  steps: [{
    // 既存フィールド
    step_number, title, focus, why, display_math, watch_out, speech_ja,
    visual: {...} | null,
    followups: [{ role, text, speech_ja }] // 最大4件
  }],
  final_answer
}
```

- 既存v1ノートは `initTutorHistory()` でデフォルト補完する。
- `version` がない項目は `visual: null`, `followups: []` とする。
- 履歴件数は100件のままだと容量が厳しいため、**50件への変更を検討**する。

---

## 2. 機能1 — グラフ・図形を解説に入れる

### 2.1 目標

添付画像のように、**定義域付きの1次関数グラフ、値域、端点の開閉**を解説の途中に表示する。  
2次関数、不等式の数直線、簡単な図形まで拡張可能な設計にする。

### 2.2 方式の決定

| 方式 | 判定 |
|:---|:---|
| AIがSVG文字列を生成 | ❌ セキュリティ・品質・トークン数の問題 |
| AIが構造化データを生成 → クライアントでSVG | ✅ **採用** |
| 外部グラフライブラリ（D3 / function-plot） | ❌ 単一ファイル・オフライン・バンドル増加 |

### 2.3 `visual` データスキーマ

各 `step` に以下のオブジェクトを追加する。`type` が `"none"` なら描画しない。

```json
"visual": {
  "type": "none | graph | numberline | figure",
  "caption": "y=3x+1（-2≦x≦0）のグラフ。値域は-5≦y≦1。",

  "view": {
    "x_min": -4, "x_max": 2,
    "y_min": -6, "y_max": 2
  },

  "curves": [
    {
      "kind": "linear | quadratic | constant",
      "a": 3, "b": 1, "c": 0,
      "domain_min": -2, "domain_max": 0,
      "domain_min_closed": true,
      "domain_max_closed": true,
      "label": "y=3x+1"
    }
  ],

  "points": [
    { "x": -2, "y": -5, "label": "(-2,-5)", "open": false }
  ],

  "guides": [
    {
      "orientation": "vertical | horizontal",
      "value": -2, "from": -6, "to": -5, "dashed": true
    }
  ],

  "annotations": [
    { "text": "値域 -5≦y≦1", "x": 0.2, "y": 1.4 }
  ],

  "numberline": {
    "min": -4, "max": 4,
    "marks": [{ "value": 1, "label": "1", "closed": false }],
    "intervals": [
      {
        "from": -1, "to": 2,
        "left_closed": true, "right_closed": false,
        "color": "emerald"
      }
    ]
  },

  "figure": {
    "elements": [
      { "kind": "point",   "x": 0, "y": 0, "label": "A" },
      { "kind": "segment", "x1": 0, "y1": 0, "x2": 4, "y2": 3, "dashed": false, "label": "AB" },
      { "kind": "circle",  "x": 2, "y": 2, "r": 1.5, "label": "O" },
      { "kind": "angle",   "x": 0, "y": 0, "r": 1, "start_deg": 0, "end_deg": 45, "label": "45°" },
      { "kind": "label",   "x": 1, "y": 1, "text": "C" }
    ]
  }
}
```

- Geminiスキーマでは `required: ["type", "caption"]` のみ指定し、他はoptionalにする。
- `curves` は `a, b, c` の係数方式のみ対応。**任意の関数式文字列は禁止**。
- `graph` は `linear` / `quadratic` / `constant` の3種類から開始する。
- `figure` は v1.6では `point` / `segment` / `circle` / `angle` / `label` のみ。
- `numberline` は不等式用。

### 2.4 レンダラー仕様

#### `renderVisual(el, visual)`

1. `normalizeVisual(visual)` で検証・クランプ。
2. `type` で分岐。
   - `graph` → `renderGraph(el, visual)`
   - `numberline` → `renderNumberLine(el, visual)`
   - `figure` → `renderFigure(el, visual)`
   - `none` / null → コンテナを非表示。
3. `<figure class="viz">` + `<svg viewBox="0 0 360 260">` + `<figcaption>` を生成する。

#### グラフ

- 余白: 左34、右14、上12、下26。
- x/y軸 + 矢印 + 目盛り（整数優先、最大8個）。
- 曲線は定義域の区間だけ80〜120点サンプリングし、`clipPath` で表示範囲外を除去。
- 線形: `y = a*x + b`
- 2次: `y = a*x^2 + b*x + c`
- 端点:
  - `closed: true` → 塗りつぶし円
  - `closed: false` → 白抜き円 + 枠線
- `guides` は点線、`points` はラベル、`annotations` はテキスト。
- `caption` は図の下に表示し、`aria-label` にも使用。

#### 数直線

- 横軸 + 目盛り + `marks` の開閉円。
- `intervals` は太い色付き区間 + 両端の矢印。
- 不等式の解答可視化に使用。

#### 図形

- 座標平面なしで `view` 基準に点・線・円・角度・ラベルを描く。
- 直角記号は `angle` の `start_deg=0, end_deg=90` で近似。
- v1.6では三角形・円程度を想定。

### 2.5 プロンプト追加（`buildSystemPrompt`）

```
【図解 visual のルール（重要）】
- 1次関数・2次関数・不等式・図形では、理解に必要なとき必ず visual を入れる。
- 1ステップにつき最大1つ。不要なら type:"none"。
- グラフは kind / a / b / c / domain_min / domain_max / closed で指定する。
  任意の関数式やSVG文字列は禁止。
- 定義域の端点が含まれるかどうかを closed で必ず指定する。
- 値域は caption または annotations に日本語で書く。
- 図のラベルは日本語。caption は50文字以内。
- speech_ja でも「右のグラフを見てください」のように図に触れる。
- 図が本質でないステップには入れない。
```

添付問題用のfew-shot:

```json
"visual": {
  "type": "graph",
  "caption": "y=3x+1（-2≦x≦0）のグラフ。値域は-5≦y≦1。",
  "view": { "x_min": -4, "x_max": 2, "y_min": -6, "y_max": 2 },
  "curves": [{
    "kind": "linear", "a": 3, "b": 1, "c": 0,
    "domain_min": -2, "domain_max": 0,
    "domain_min_closed": true, "domain_max_closed": true,
    "label": "y=3x+1"
  }],
  "points": [],
  "guides": [
    { "orientation": "vertical", "value": -2, "from": -6, "to": -5, "dashed": true }
  ],
  "annotations": [
    { "text": "値域 -5≦y≦1", "x": 0.2, "y": 1.2 }
  ]
}
```

### 2.6 UI

- `display_math` の下に `<div id="step-visual-${idx}" class="step-visual hidden">` を置く。
- キャプションに `📊 グラフで確認` を表示。
- モバイルで図が小さい場合は**「拡大」ボタン**で `visualModal` を開く（任意）。
- ダークモードでは軸・目盛り・曲線の色をCSS変数で切り替える。
- 印刷時は `@media print { .viz { break-inside: avoid; } }`。

### 2.7 保存・復元

- `normalizeTutorResult` で `visual` をstepにそのまま渡す。
- `saveCurrentToTutorHistory` は**元の `currentProb`** から `visual` を含めて保存する。
- `saveTutorHistory` のentryに `version: 2` を追加。
- 復元時は `renderStepCards` が `visual` を再描画する。
- `simplifyStep` の応答に `visual` がない場合は既存の `step.visual` を維持する。

### 2.8 受け入れ基準

- 添付問題の (1), (2) グラフが、それぞれ正しい傾き・切片・定義域で表示される。
- (1) `-5≦y≦1`、 (2) `-7/3≦y≦-1` のキャプションが表示される。
- 端点のopen/closedがデータどおりに表示される。
- 不正なvisualデータでもコンソールエラーなくテキストのみ表示される。
- ダークモード・iOS Safari・Android Chromeで崩れない。
- マイノート保存→復元後もグラフが維持される。

---

## 3. 機能2 — 4択の答え入力 + 直接入力の補助

### 3.1 目標

記号入力が難しい子どものために**4択を基本**とし、必要なら直接入力へ切り替えられるようにする。直接入力には記号パレットを用意する。

### 3.2 クイズ生成スキーマ

```json
{
  "problem": "問題文（LaTeX可）",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "correct_index": 2,
  "answer": "正解テキスト",
  "hint": "着眼点のヒント",
  "explanation": "正解の理由（2〜4文）",
  "wrong_hint": "間違い全体への振り返り",
  "choice_feedback": [
    "選択肢1が違う理由",
    "選択肢2が違う理由",
    "",
    "選択肢4が違う理由"
  ],
  "speech_ja_correct": "正解時の褒め音声",
  "speech_ja_wrong": "不正解時の励まし音声"
}
```

Geminiスキーマ:

- `choices`: `minItems: 4, maxItems: 4`
- `correct_index`: `INTEGER`
- `choice_feedback`: 4件、正解位置は空文字可
- `minItems/maxItems` が使えない場合は**クライアント側で検証**する。

プロンプト:

```
【4択の作り方】
- 選択肢は必ず4つ。正解は1つだけ。
- 誤答は「符号ミス」「不等号の向き」「係数の取り違え」「定義域の端」など、
  実際によくある間違いに基づいて作る。
- 選択肢は短く、重複禁止。「すべて正しい」等は禁止。
- correct_index は 0〜3。
- choice_feedback は各誤答がなぜ違うかを1文で。
- explanation は正解の理由。speech_ja はLaTeX禁止。
```

### 3.3 クライアント側の検証・シャッフル

```js
normalizeQuizData(data):
  - choices.length === 4
  - trim後にすべて非空・重複なし
  - correct_index が 0〜3 の整数
  - answer が空なら choices[correct_index] を使う
  - 失敗時は null → 直接入力モードへフォールバック + 案内

shuffleChoices(choices, correctIndex):
  - Fisher–Yates
  - 正解indexも同時に追跡し displayCorrectIndex を返す
```

- シャッフルは**クイズ表示時の1回だけ**。再レンダリングしても順序を維持する。
- `currentQuizData` に `displayChoices`, `displayCorrectIndex`, `selectedIndex`, `answered` を保持する。

### 3.4 UI

```
┌─────────────────────────────┐
│ 🎯 類題チャレンジ            │
│ 問題文                       │
│ 💡 ヒント                     │
│                             │
│ 🔘 選択肢から選ぶ  ✍️ 自分で入力 │
│                             │
│  [ア] 選択肢1    [イ] 選択肢2 │
│  [ウ] 選択肢3    [エ] 選択肢4 │
│                             │
│  [ 答える ]                  │
└─────────────────────────────┘
```

- 選択肢ボタン: 2×2グリッド、最小高さ48px、`role="radio"`, `aria-checked`。
- 選択状態は枠線+背景で表示。色だけに頼らず `✓` も付ける。
- `答える` 後:
  - 正解: 緑 + `🎉 正解！` + `explanation`
  - 不正解: 赤 + `💡 惜しい！` + `choice_feedback[選択]` + `wrong_hint`
  - 不正解の選択肢と正解の選択肢を同時に表示する。
- `もう一度` → 選択を初期化。`完全なステップ解説を見る` → 既存 `showQuizFullSolution()`。
- 直接入力モード:
  - 既存 `studentAnswerInput` を表示。
  - 記号パレット: `≤ ≥ < > √ π θ ° ² ³ ₁ ₂ × ÷ ± ≠ ∞ ( ) /`
  - `insertMathSymbol(sym)` はカーソル位置に挿入する。
  - `✍️ 自分で入力する` / `🔘 選択肢に戻る` をトグル。
  - 選択モードを既定値とし、`localStorage` に保存する（`quiz_input_mode`）。
- AIが選択肢を作れなかった場合は自動的に直接入力モードへ切り替え、`⚠️ 選択肢を作れなかったため、入力モードに切り替えました` を表示する。

### 3.5 採点

#### 4択: ローカル採点（API呼び出しなし）

```js
function gradeChoiceAnswer(selectedIndex) {
  const isCorrect = selectedIndex === currentQuizData.displayCorrectIndex;
  const comment = isCorrect
    ? currentQuizData.explanation
    : (currentQuizData.choiceFeedback[selectedIndex] || currentQuizData.wrongHint);

  return {
    is_correct: isCorrect,
    judgement_title: isCorrect ? '正解！素晴らしい！' : '惜しい！もう一歩です',
    comment,
    correct_answer: currentQuizData.displayChoices[currentQuizData.displayCorrectIndex],
    speech_ja: isCorrect ? currentQuizData.speechCorrect : currentQuizData.speechWrong
  };
}
```

- `renderQuizResult(judge, selectedText, { mode: 'choice', selectedIndex })` として既存レンダラーを再利用する。
- 既存の固定ヒント `"符号や不等号の向き..."` は**削除**し、`comment` / `choice_feedback` に置き換える。

#### 直接入力: 既存のAI採点を維持

- まず文字列を正規化して比較する。
  - 全角→半角、空白除去、`≦/≤/<=` の統一、`－/-` の統一
  - 正解と完全一致すればAPIなしで正解にする。
- 一致しない場合は既存 `submitStudentAnswer()` のAI採点を呼ぶ。
- **APIキーチェック + quota処理**を `solveProblem` と同様に追加する。

### 3.6 履歴

- `saveQuizToHistory` に `quiz_mode`, `choices`, `selected_text`, `correct_text` を保存する。
- 既存 `display_math` のliteral `\\n` バグを実際の `\n` に修正する。
- 重複保存を防ぐため、保存後はボタンをdisableする。

### 3.7 受け入れ基準

- 4択が常に4件、重複なし、正解1件。
- シャッフル後も正解indexが正しく対応する。
- 正解選択時に**ネットワークリクエストなしで**即座に⭕表示。
- 不正解時に選択肢ごとの理由が表示される。
- 直接入力への切替・記号挿入・IME Enterの誤作動がない。
- 20回生成テストで選択肢の重複／正解indexエラーが0件。

---

## 4. 機能3 — ステップ単位の追加質問

### 4.1 目標

子どもがChatGPTでやっているように、**説明の一部だけをコピーして質問**する流れをアプリ内で実現する。  
問題全体を解き直さず、**該当ステップ + 質問部分 + 短い会話コンテキスト**だけをAIへ送る。

### 4.2 UI

各ステップカードにボタンを追加する。

```
[🔊 もう一度聞く] [🪄 もっとやさしく] [❓ この部分を質問]
```

さらに、着眼点／なぜ／式／注意の各ブロック見出しの横に小さな `❓` リンクを置く。

- `❓ この着眼点を質問`
- `❓ この式を質問`
- `❓ この注意点を質問`

クリックするとカードの下にインラインチャットパネルを開く。

```
┌─────────────────────────────┐
│ 先生に質問（ステップ2）        │
│ 「なぜ -1 でくくるの？」      │  ← 引用バブル
│                             │
│ [なぜこの式？][符号が？][例は？] │  ← quick chips
│                             │
│ あなた: なぜ -1 でくくるの？   │
│ 先生: ...（数式 + 音声ボタン） │
│                             │
│ [質問を入力...]      [送信]   │
│ [履歴をクリア]                │
└─────────────────────────────┘
```

- 既定は閉じた状態。ボタンで開き、`scrollIntoView({block:'center'})` する。
- 開くときに `stopSpeech()` で既存の読み上げを止める。
- モバイルキーボード表示時に入力欄が隠れないよう、focus時にスクロールする。
- `aria-live="polite"` で回答追加を通知する。

### 4.3 状態

```js
let stepChats = {};      // key: `${problemIndex}:${stepIndex}` → messages[]
let stepChatBusy = {};   // key → boolean
```

メッセージ:

```js
{
  role: 'user' | 'assistant',
  text: string,          // ユーザーの質問またはAIの回答
  speech_ja?: string,
  visual?: object,
  createdAt: number
}
```

- 新しい問題を解いたら `stepChats = {}` にリセット。
- 小問タブ切替時はkeyにproblemIndexを含むため、各小問の会話は維持される。
- `renderStepCards()` が再描画されても `renderStepChat(idx)` で状態を復元する。
- `simplifyStep` 後は該当ステップの会話を**初期化**し、`⚠️ 説明を更新したため、質問履歴をリセットしました` を表示する（古い文脈との混線防止）。
- 1ステップあたり最大6ターン。超えたら入力欄を無効化し、`履歴をクリア` を案内する。

### 4.4 APIスキーマ

```json
{
  "answer": "質問への答え（日本語、$...$ 可）",
  "speech_ja": "音声用。LaTeX禁止。80〜200文字",
  "visual": { "type": "none", "...": "機能1と同じスキーマ" },
  "suggestions": ["次に聞きそうな質問1", "質問2", "質問3"]
}
```

- `visual` はoptional。多くの場合は `type:"none"`。
- `suggestions` はquick chipとして表示する（最大3件）。

### 4.5 プロンプト（`buildFollowupPrompt`）

```
あなたは日本の高校1年生（数学I・A）を教える先生です。
生徒は下のステップの一部が分からず、その部分だけを質問しています。

【問題】
${currentProblemText}

【単元】
${unitHint}

【ステップ${n}】
タイトル: ${step.title}
着眼点: ${step.focus}
なぜ: ${step.why}
式: ${step.display_math}
注意: ${step.watch_out}

【生徒が分からない部分】
${partText}   // 「なぜ」「式」「注意」など、クリックした部分
【これまでのやりとり】
${last 4 messages}
【今回の質問】
${question}

【答え方】
- 質問された部分だけに答える。問題全体を最初から解き直さない。
- 前のステップとのつながりを1文で説明する。
- 具体例を1つ入れる。
- 3〜6文。数式は$...$。speech_jaはLaTeX禁止。
- 用語が難しいときは、中学生にも分かる言葉に置き換える。
- 必要なら visual を1つだけ入れる。
```

- `partText` は `focus` / `why` / `display_math` / `watch_out` のうちクリックしたブロックの**元データ**から取得する（DOMの`textContent`は禁止）。
- 前ステップとのつながりのため、`previousStep.title` + `previousStep.display_math` を1行含める。
- 会話履歴は**直近2ターン（4メッセージ）**のみ、各400文字で切り詰める。
- プロンプト全体は6,000文字を超えないようにする。

### 4.6 関数

| 関数 | 役割 |
|:---|:---|
| `openStepChat(idx, part)` | チャットパネルを開く + 引用をプリフィル |
| `closeStepChat(idx)` | 閉じる + 音声停止 |
| `renderStepChat(idx)` | 状態からログを復元 |
| `appendStepChat(idx, msg)` | メッセージ追加 + 描画 |
| `askStepQuestion(idx, question, part)` | API呼び出し + 回答描画 + 音声 |
| `buildFollowupPrompt(...)` | コンテキスト制限付きプロンプト |
| `insertFollowupQuote(idx, part)` | `「...」が分かりません。` をプリフィル |
| `clearStepChat(idx)` | 会話を初期化 |
| `speakFollowup(text)` | `speakJapanese` を再利用 |

### 4.7 エラー・quota

- APIキーなし → 設定モーダル + 案内。
- quota → チャットパネル内にエラー + `別のモデルで再試行` ボタン（最後の質問を保存して再呼び出し）。
- 一般エラー → `❌ 質問の送信に失敗しました: ...` + 再試行。
- `alert()` は使わない。

### 4.8 音声

- 回答表示後に `speech_ja` を自動読み上げ（設定 `auto_speak_followup` でOFF可能）。
- `🔊 もう一度聞く` ボタンを置く。
- チャットを閉じる／新しい質問をするときに `stopSpeech()`。

### 4.9 履歴

- `saveCurrentToTutorHistory` で各stepの `followups` を最大4メッセージまで保存する。
- 復元時は `renderStepChat` が会話を復元する。
- 容量保護のため、メッセージは500文字、ステップあたり4メッセージまで。

### 4.10 受け入れ基準

- ステップ2の `なぜ` をクリック → `「...」が分かりません` がプリフィルされる。
- 「なぜ -1 でくくるの？」の質問に対し、問題全体を再解説せず該当部分だけを説明する。
- 3ターン連続の質問で以前の文脈を覚えている。
- `もっとやさしく` 後に会話初期化の案内が出る。
- 小問タブを切り替えても各小問の会話が維持される。
- 保存・復元後に会話2ターンが維持される。
- エラー/quota時もアプリが停止しない。

---

## 5. 変更対象マッピング

| 位置 | 変更内容 |
|:---|:---|
| `TUTOR_RESPONSE_SCHEMA` `1384-1421` | stepに `visual` を追加 |
| `SIMPLIFY_RESPONSE_SCHEMA` `1423-1435` | `visual` を追加 |
| `buildSystemPrompt` `1437-1569` | visualルール + few-shot |
| `buildSimplifyPrompt` `2036-2064` | visual維持の指示 |
| `stepCardHtml` `1949-2006` | visualコンテナ、質問ボタン／パネル |
| `renderStepCards` `2008-2031` | `renderVisual`, `renderStepChat` 呼び出し |
| `normalizeTutorResult` `1798-1831` | visual/followupsの正規化 |
| `saveTutorHistory` `579-599` | version 2、visual/followups保持 |
| `saveCurrentToTutorHistory` `679-708` | **元データ保存** |
| `renderTutorHistoryList` `607-650` | 変更なし（previewのみ） |
| `restoreFromHistory` `656-662` | unit復元 + チャット初期化 |
| `startQuizChallenge` `813-912` | 4択スキーマ + quota |
| `QUIZ_GEN_SCHEMA` `842-850` | choices/correct_index/feedback |
| `submitStudentAnswer` `927-996` | キーチェック + 直接入力経路 |
| `renderQuizResult` `998-1050` | 選択型メタデータ + 固定ヒント削除 |
| `saveQuizToHistory` `1063-1086` | モード/選択/正解保存、`\n`修正 |
| HTMLクイズセクション `358-408` | 選択肢グリッド、モード切替、記号パレット |
| `callGeminiModel` `1604-1669` | 変更最小（schema渡し） |
| `isQuotaError` / `showQuotaError` `2365-2399` | 再試行コールバック対応 |
| `speakJapanese` `2250-2309` | 変更なし |
| CSS `55-125` | `.viz`, `.choice-btn`, `.chat-*` を追加 |

---

## 6. 実装順序（推奨）

### Phase 0 — 先行修正

- [ ] マイノートの元データ保存
- [ ] `finishReason` / 空結果ガード
- [ ] ダークモードのステップカード
- [ ] IME Enterガード
- [ ] `statusBox` をトースト化、またはスクロール

### Phase 1 — グラフ（機能1）

1. `visual` スキーマ + `normalizeVisual`
2. `renderGraph` / `renderNumberLine`
3. `stepCardHtml` + `renderStepCards` 接続
4. プロンプト + few-shot
5. 保存・復元
6. 添付問題で検証

### Phase 2 — 4択（機能2）

1. クイズスキーマ + 検証／シャッフル
2. 選択肢UI + モード切替
3. ローカル採点 + 結果描画
4. 記号パレット + 直接入力
5. 履歴 + quota

### Phase 3 — ステップ質問（機能3）

1. 状態／UIパネル
2. プロンプト + API
3. 音声／エラー／quota
4. 保存・復元
5. `simplifyStep`／タブ切替との連動

### Phase 4 — 仕上げ

- バージョン `v1.6-beta` 更新（ヘッダー／バナー／設定）
- `PROJECT_SPEC.md` 更新
- `backup/index.html.v1.6-*.bak` 作成
- `node --check` + 手動テスト

---

## 7. テストチェックリスト

### 機能1

- [ ] 添付 (1) グラフ: 傾き3、y切片1、定義域 -2〜0、値域 -5〜1
- [ ] 添付 (2) グラフ: 傾き -1/3、y切片 -2、定義域 -3〜1、値域 -7/3〜-1
- [ ] 端点のopen/closed表示
- [ ] 不正なvisual → テキストのみ表示
- [ ] ダークモード / iOS Safari / Android
- [ ] 保存→復元後もグラフ維持

### 機能2

- [ ] 選択肢4件・重複なし・正解1件（20回）
- [ ] シャッフル後の正解マッピング
- [ ] 正解時にネットワークリクエストなし
- [ ] 不正解時に選択肢別フィードバック
- [ ] 直接入力 + 記号パレット
- [ ] IME変換Enterで送信されない
- [ ] 履歴の保存・復元

### 機能3

- [ ] `なぜ` / `式` / `注意` の各部分質問
- [ ] 問題全体を解き直さず該当部分のみ説明
- [ ] 3ターンの文脈維持
- [ ] 音声読み上げ／停止
- [ ] quota／APIキーエラー
- [ ] `もっとやさしく` 後の初期化案内
- [ ] 小問タブ切替時の会話維持
- [ ] 保存・復元後の会話維持

### 回帰

- [ ] 既存の問題解説・複数小問・類題解説・マイノート・音声
- [ ] `node --check` 通過
- [ ] 重複 `id` 0件
- [ ] コンソールエラー0件

---

## 8. リスクと対応

| リスク | 対応 |
|:---|:---|
| AIがグラフの係数を誤る | スキーマ制限 + キャプション検品 + 将来SymPy検証。誤った図よりテキストが良い場合は `type:"none"` |
| 出力トークン超過 | ステップあたりvisual 1件、選択肢4件、質問履歴2ターン、`MAX_TOKENS`検知 |
| UIが複雑になる | ステップカードのボタンはアイコン中心、チャットは折りたたみ |
| 保存容量 | 履歴100→50件を検討、followupsは4メッセージ制限 |
| SVG XSS | AIのSVG禁止、DOM API + textContent、数値クランプ |
| iOS音声停止 | `onend` watchdog（既存課題） |
| オフライン/PWA | 新規ライブラリ追加禁止、既存CDN依存は別課題 |

---

## 9. コード作成ツールへの引き継ぎチェックリスト

```
[ ] 1. 修正前 backup/index.html.v1.6-YYYYMMDD-HHMMSS.bak を作成
[ ] 2. Phase 0 先行修正を完了（特にマイノートの元データ保存）
[ ] 3. TUTOR_RESPONSE_SCHEMA / SIMPLIFY_RESPONSE_SCHEMA に visual を追加
[ ] 4. normalizeTutorResult に visual / followups を追加
[ ] 5. renderVisual + renderGraph + renderNumberLine を実装
[ ] 6. stepCardHtml / renderStepCards を接続 + ダークモードCSS
[ ] 7. クイズスキーマを4択化 + normalize/shuffle + ローカル採点
[ ] 8. 選択肢UI + 直接入力トグル + 記号パレット
[ ] 9. ステップ質問の状態/UI/プロンプト/API/音声
[ ] 10. 履歴 version 2 + 保存/復元 + migration
[ ] 11. quota / APIキーエラーをすべての新規呼び出しに適用
[ ] 12. node --check + 重複id + 手動テスト
[ ] 13. PROJECT_SPEC.md とバージョン表記を更新
```

---

## 10. まとめ

3機能はいずれも現在の構造を大きく壊さず追加可能。

- **図**はAIにSVGを描かせず、**データだけを受け取って自前で描画**する。
- **4択**はローカル採点にして、APIコストと待ち時間を削減する。
- **ステップ質問**は、該当ステップと短い会話履歴だけを送り、全体の再解説を避ける。

この順序で実装すると、既存の「写真→解説→音声→類題→マイノート」の流れを保ちながら拡張できる。
