# v1.6〜v1.8 전체 감사 보고서 (질문식 풀이 · API 절약 · 영어 앱)

> 감사일: 2026-10-28
> 대상: `f16dad3` (문제 전체 Q&A / 類題 / 영어 앱 / 3테마 / 공유 모듈 포함 HEAD)
> 감사자: AI 어시스턴트 (코드 수정 없음 — 분석·재현·검증만 수행)
> 판정: **수학 앱은 현재 상태로 배포 가능. 영어 앱은 P1-1 수정 전 배포 비권장.**
> Gemini API 실호출: **0회** (fetch 가로채기 + 스텁 응답으로 전 경로 검증)

---

## 1. 검증 방법

| 구분 | 내용 |
|---|---|
| 정적 검사 | `node --check` — `sw.js`, `english/sw.js`, `shared/*.js`, `index.html`/`english/index.html` 인라인 스크립트 전부 통과 |
| DOM 검사 | 중복 `id` 없음 (수학 86개, 영어 69개) |
| 런타임 | `python3 -m http.server 8765 --bind 127.0.0.1` + Chromium 실로드 |
| 기능 검증 | `window.fetch` / `TutorCore.callGeminiModel` 스텁 주입 → 실제 함수 호출, DOM·computed style·API 호출 횟수 측정 |
| 레이스 검증 | 응답을 `release()`로 붙잡아 두고 탭/모드를 전환한 뒤 해제 |
| 미검증 | 실제 Gemini 응답, iOS 실기기 음성, HTTPS 환경의 SW 등록(`127.0.0.1`은 등록 조건 미충족) |

> 로컬 서버가 `127.0.0.1`이라 SW 등록 자체는 미검증. 등록 조건·스코프·캐시 프리픽스는 코드 경로 검토로 대체했다.

> **참고**: `docs/AUDIT_v1.7.md`에서 지적한 P0 3건(선택지 셔플 불일치, 4択 검증 부재, 단계 Q&A 노출)은 `2ded361`에서 수정되었고, 이번 감사에서 **회귀는 발견되지 않았다**. 본 보고서의 항목은 v1.7 이후 추가된 기능(질문식 풀이, twin_quiz 사전 생성, 영어 앱, 3테마)에서 발견된 것이다.

---

## 2. 종합 요약

| 등급 | 건수 | 의미 |
|---|---|---|
| **P1** | 3 | 기능 파손 / 데이터 오염 — 배포 전 수정 |
| **P2** | 6 | 잘못된 동작·오해 유발·비용 증가 |
| **P3** | 8 | 품질·일관성·문서 |

**정상 확인된 것 (그대로 유지 가능)**

- 사진 업로드 → 해설 → 단계 카드 → 마이노트 저장/복원 (전체 대화 `overall_chat` + 단계 `followups` 포함)
- 원시 LaTeX 보존(`data-raw-math`), 저장 후 재렌더링
- 다문제 해설 → 문제 탭 전환 → 각 문제 독립 표시
- **twin_quiz 재사용: 추가 API 0회** (수학·영어 모두 확인)
- 4択 로컬 채점(API 0회), 오답 시 정답 표시
- 요청 해시 캐시: 동일 문제 2회 해설 = **API 1회**, 상태 문구로 사용자에게 고지
- 테마 3종(minimal / edutech / mobile) + 다크모드, 새로고침 후 유지
- 영어 읽기 / 4択 / 작문 첨삭 / 단어장 등록·중복 방지
- PIN·API키 공유(`tutor_`), `amt_`/`aet_`/`tutor_` 프리픽스 분리
- SW 프리픽스 필터(`amt-`/`aet-`), `/english/` 가드
- `gemini-3.8-flash`는 2026-09 GA 모델이며 무료 티어 제공 확인

---

## 3. P1 — 배포 전 필수

### P1-1. 영어 `escapeJsString`이 `"`를 `\"`로 출력 → 인라인 핸들러 파손 + self-XSS

- 위치: `english/index.html:1986`
- 사용처: `1072, 1100, 1144, 1371, 1378, 1566, 1577, 1832, 1844, 1847, 1878, 1887, 1888`

```js
function escapeJsString(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')      // ← HTML 속성 안에서는 탈출이 되지 않음
    .replace(/\r?\n/g, ' ');
}
```

속성은 큰따옴표로 감싸여 있으므로 `\"`는 속성을 닫아버린다.

재현(지문 `He said "hello" to me.`):

```
onclick="speakEnglishText('He said \"          ← 속성 조기 종료
```

- 영향: 지문 낭독 / 문장별 낭독 / 단어 발음 / 퀴즈 정답 낭독 / 작문 첨삭 낭독 / 단어장 발음 **전부 무효**
- 보안: 모델 출력에 `');alert(1);//` 류가 포함되면 그대로 실행됨(self-XSS)
- 수학 앱은 동일 함수가 `&quot;`를 사용해 정상 (`index.html:919`)

**수정안**

```js
.replace(/"/g, '&quot;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
```

근본 대책은 인라인 `onclick` 제거 + `data-*` + 이벤트 위임이지만, 최소 수정은 위 3줄이다.

---

### P1-2. 문제 탭 전환 시 "문제 전체 질문" 응답 유실

- 위치: `index.html:4020` (`sendOverallQuestion`), 파괴 지점 `4128`, 문맥 계산 `4066`

```js
// 함수 초입에서 user 메시지를 push한 뒤 await ...
const res = await callGeminiModel(...);
...
overallChats[currentProblemIndex].push(assistantMsg);   // ← await 이후 "현재" 인덱스
```

재현(2문제 상태, 응답 대기 중 (2)번 탭으로 전환):

```
❌ 別解解説エラー: Cannot read properties of undefined (reading 'push')
chats0: ['user']  /  chats1: []  /  prob1.overall_chat: 0
status: "❌ 別解解説エラー: Cannot read properties of undefined (reading 'push')"
```

→ 답변이 어느 문제에도 저장되지 않고, 화면에는 에러만 남는다. 사용자는 질문만 하고 답을 영구히 잃는다.

**수정안** — 요청 시작 시 인덱스 고정

```js
const reqIndex = currentProblemIndex;                  // 함수 초입
...
if (!overallChats[reqIndex]) overallChats[reqIndex] = [];
overallChats[reqIndex].push(assistantMsg);
if (currentProblems[reqIndex]) {
  currentProblems[reqIndex].overall_chat = overallChats[reqIndex].slice(-10);
}
if (reqIndex === currentProblemIndex) renderOverallChatLogs();
else showToast('別の問題の回答が届きました。タブを切り替えると確認できます。', 'blue');
```

`pastChatContext`(4066)도 동일하게 시작 시점 인덱스로 계산할 것.

---

### P1-3. 단계 Q&A가 다른 문제의 단계에 복사됨 (데이터 오염)

- 위치: `index.html:3828` (`sendStepQuestion`), 오염 지점 `3923-3927`

```js
step.followups = stepChats[chatKey].slice(-8);
if (currentProblems[currentProblemIndex] && currentProblems[currentProblemIndex].steps[stepIdx]) {
  currentProblems[currentProblemIndex].steps[stepIdx].followups = step.followups;
}
```

재현(문제 (1) 1단계에 질문 → 응답 대기 중 (2)번 탭으로 전환):

| 대상 | 결과 |
|---|---|
| `stepChats['0:0']` | `['user','assistant']` (정상) |
| `currentProblems[0].steps[0].followups` | 2건 (정상) |
| `currentProblems[1].steps[0].followups` | **`['なぜこの式？','ステップの回答']` (오염)** |

→ 이 상태로 (2)번 문제를 노트 저장하면 (1)번 대화가 (2)번 노트에 영구 저장된다. `renderStepChatLogs(stepIdx)`도 현재 인덱스 기준으로 다시 그리므로 화면과 저장 데이터가 어긋난다.

**수정안**

```js
const reqProblemIndex = currentProblemIndex;
const reqStepIdx = stepIdx;
...
currentProblems[reqProblemIndex].steps[reqStepIdx].followups = step.followups;
if (reqProblemIndex === currentProblemIndex) renderStepChatLogs(reqStepIdx);
```

---

## 4. P2 — 조속 수정 권장

### P2-1. 영어 4択 "복습" 기록이 복원하면 항상 정답 처리

- 위치: `english/index.html:1906-1918` (설정 `1909`, 제출 `1917`)

```js
selectedChoiceIndex = currentQuizData.displayCorrectIndex;  // 정답을 미리 선택
...
submitEnglishQuizAnswer();                                   // → 정답 판정
```

재현: `[4択復習❌]` 항목 복원 →

```
🎉 ⭕ 正解！素晴らしいです！
あなたの回答: has lived
```

→ 틀린 문제를 복습할 때마다 "정답"으로 표시되고 정답 음성이 재생된다. 학습 기록의 신뢰성이 깨진다.

**수정안**: 복원 시 `selectedChoiceIndex = -1`로 두고 선택지·해설만 표시. 또는 payload에 `wasCorrect`를 저장해 `lastResult`를 복원하고 `submitEnglishQuizAnswer()`는 호출하지 않는다.

---

### P2-2. "モデル一覧を自動取得"이 실질적 no-op

- 위치: `index.html:1846` (`populateModelSelect`), 저장만 되고 읽히지 않음 `1710` / `1832`
- 안내 문구: `2544`, `3371`

```js
function populateModelSelect(models) {        // models 인자를 사용하지 않음
  selectEl.innerHTML = '<option value="gemini-3.8-flash" selected>...';
```

- `available_gemini_models`는 `setItem`만 있고 `getItem` 사용처가 없다 → 성공 토스트만 뜨고 목록은 그대로
- 쿼터 오류 안내의 "다른 모델로 전환" / "모델 일람 자동 취득"은 실행 불가능한 안내
- 영어 앱(`english/index.html:766 initModelDropdown`)은 모델 조회 기능 자체가 없음

**수정안** (택1)

1. (권장) `populateModelSelect`에서 실제 목록을 옵션으로 생성. `populateModelSelect(validModels)` 호출부에서 `available_gemini_models`를 읽어 초기화 시에도 복원. 사용 불가/미지원 모델은 `disabled` 표기.
2. 기능을 넣지 않을 경우 버튼과 관련 문구를 제거해 오해 소지를 없앤다(영어 앱과 동일 상태로).

---

### P2-3. `maxOutputTokens: 16384` — 3.8 Flash에서는 thinking 토큰이 이 한도에 포함

- 위치: `shared/core.js:83`, `index.html:2359` (수학 인라인 중복 구현)

Google 문서/포럼 기준: `maxOutputTokens`는 `thoughtsTokenCount + candidatesTokenCount`의 상한이며, Gemini 3.8 Flash는 기존 앱에 **32,768 이상** 권장. 현재 값은 다문제 해설·장문 읽기에서 `finishReason: MAX_TOKENS`(빈 응답) 또는 30~35초 타임아웃 위험이 있다. 영어 읽기(지문+번역+문장분석+단어+문법+quick_check+twin_quiz)가 특히 큼.

**수정안**

1. 해설/읽기 호출은 `maxOutputTokens: 32768`. 퀴즈·첨삭·간단화는 8192~16384 유지.
2. `generationConfig.thinkingConfig.thinkingLevel = 'LOW'`는 **지원 모델에서만** 적용하고, 400 응답 시 옵션 제거 후 1회 재시도(커스텀 모델 ID 대비 필수).
3. `finishReason === 'MAX_TOKENS'`를 명시 감지해 "응답이 잘렸습니다. 다시 시도해 주세요" 안내(현재는 JSON 파싱 실패로만 보임).

> 무료 티어 한도(RPM/TPM/RPD)는 프로젝트별로 AI Studio에서 확인해야 한다. 출력 상한 상향은 한도 자체를 늘리지는 않는다.

---

### P2-4. 영어 읽기 기록 복원 시 twin_quiz 재사용 불가 → API 1회 추가

- 위치: `english/index.html:1234-1235` (사용), `1731-1744` (저장)

`_twinQuizConsumed: true`가 payload에 그대로 저장되고, 복원은 **같은 객체 참조**를 `lastLessonData`에 넣는다.

재현:

```
consumed: true
storedFlag: true          ← localStorage에 소비 플래그까지 저장
afterRestoreCalls: 1      ← 복원 후 퀴즈 버튼이 새로 API 호출
```

**수정안**

```js
// 저장 시
const { _twinQuizConsumed, ...persist } = lastLessonData;
payload: persist
// 복원 시
lastLessonData = { ...item.payload, _twinQuizConsumed: false };
```

---

### P2-5. 수학 "類題正解" 노트에 상위 문제의 Q&A가 함께 저장

- 위치: `index.html:848` (fallback), 호출 `1634` (`saveQuizToHistory`)

```js
overall_chat: Array.isArray(data.overall_chat)
  ? data.overall_chat
  : (overallChats[currentProblemIndex] || [])     // ← 類題 저장 시에도 상위 문제 대화를 붙임
```

`saveQuizToHistory`는 `overall_chat`을 넘기지 않으므로, 그 시점 문제의 "문제 전체 질문" 대화가 유제 기록에 붙는다. 복원하면 무관한 대화가 표시된다.

**수정안**: `saveQuizToHistory`에서 `overall_chat: []` 명시. fallback은 해설 저장 경로에서만 쓰이도록 `saveTutorHistory(data, { attachChat = true } = {})`로 분리.

---

### P2-6. 유효하지 않은 퀴즈 → 텍스트 모드가 영구 저장

- 위치: `index.html:1246` (`setQuizInputMode('text')`), `1279` (저장값 재적용), `1085` (`setQuizInputMode`)

재현:

```
modeAfterInvalid: "text"
localStorage.amt_quiz_input_mode: "text"
```

→ 이후 정상 4択에서도 선택지 UI가 뜨지 않는다. 사용자는 "퀴즈가 깨졌다"고 느낀다.

**수정안**

```js
function setQuizInputMode(mode, { persist = true } = {}) {
  ...
  if (persist) safeStorage.setItem('quiz_input_mode', mode);
}
// 폴백 경로
setQuizInputMode('text', { persist: false });
```

`1279`는 "이번 퀴즈에서 유효한 모드"를 우선하도록 `quizInputMode`(메모리) 값을 먼저 참조.

---

## 5. P3 — 여유 있을 때

| # | 내용 | 위치 | 수정 방향 |
|---|---|---|---|
| 1 | `switchMode`가 이전 퀴즈 상태를 지우지 않음 → 다른 레슨의 퀴즈를 그대로 제출 가능 | `english/index.html:862` | 모드 전환 시 `currentQuizData = null`, 결과박스 초기화 |
| 2 | 모바일 테마에서 영어 앱 body에 110px 하단 여백(오디오바 없음) | `shared/ui.css:209` | `body:has(#audioControlBar)` 또는 앱별 클래스로 한정 |
| 3 | 토스트(bottom 24px)가 모바일 고정 오디오바(bottom 14px)와 겹침 | `shared/ui.js:23`, `ui.css:212` | 모바일 테마에서 `bottom: calc(96px + safe-area)` |
| 4 | `#submitQuizBtn`(영어)만 테마별 버튼 스타일 대상에서 빠짐 | `shared/ui.css:152-170` | 셀렉터 목록에 `#submitQuizBtn` 추가 |
| 5 | `<html class="light">`가 영구히 남음(제거 코드 없음) | `index.html:2` | `.light` 셀렉터가 없어 무해. 다크 토글과 혼동 소지만 정리 |
| 6 | `overallChatBusy`가 전역이라, 응답 대기 중 다른 문제 탭으로 전환해도 "解説を作成中…" 비활성 상태가 유지됨(요청은 이전 문제 소속) | `index.html:4063`, `4120-4135` | P1-2 수정 시 함께 해소 — 요청 소속 문제를 버튼/상태 문구에 표시하거나, 다른 문제에서는 대기 상태를 숨김 |
| 7 | 영어 스키마만 소문자 타입(`object`/`string`), 수학은 대문자 | `english/index.html:615-728` | 2.5에서는 200 확인, 3.8 미검증 → **대문자로 통일** 권장(저위험) |
| 8 | 캐시 TTL/스키마 버전 없음(무기한), 레거시 `api_response_cache`까지 병합 | `shared/core.js:215-249`, 영어 `legacyPrefixes: ['']` | `maxAgeMs`(예: 30일) + `schemaVersion` 불일치 시 무효화 |

**구조 부채(별건)**: 수학 앱이 `callGeminiModel` / `parseTutorJson` / 음성 / 테마를 `shared/*`와 중복 구현하고 있다. 이번 P1-1(영어만 `\"`)과 P2-3(양쪽 모두 16384)은 **중복 때문에 갈라진 증상**이다. 다음 사이클에서 수학도 `TutorCore` / `TutorSpeech`로 통합 권장.

---

## 6. 수정 순서 및 검증 체크리스트

**순서**

1. P1-1 (1줄) → 즉시
2. P1-2 / P1-3 (인덱스 고정, 각 3~5줄)
3. P2-1 / P2-4 / P2-5 / P2-6 (상태 복원 계열, 서로 독립)
4. P2-2 (모델 목록 — 기능 구현 또는 UI 문구 제거, 정책 결정 필요)
5. P2-3 (토큰/thinking — 실기기 1회 테스트 필요)
6. P3 일괄 + 문서 동기화

**수정 후 검증 (실 API 없이)**

- [ ] 따옴표 포함 지문/단어/정답 렌더 → 낭독 버튼 `onclick` 속성이 온전한지
- [ ] 2문제 해설 → 질문 → 즉시 탭 전환 → 응답이 원래 문제 탭에 남는지
- [ ] 같은 시나리오에서 단계 Q&A → 다른 문제 `followups`가 비어 있는지
- [ ] `[4択復習❌]` 복원 → "정답"으로 표시되지 않는지
- [ ] 읽기 저장 → 복원 → 퀴즈 버튼 → API 호출 0회
- [ ] 유제 정답 저장 → 복원 → 대화 로그가 비어 있는지
- [ ] 잘못된 퀴즈 응답 후 정상 퀴즈 → 4択 UI가 복구되는지
- [ ] `node --check` (양쪽 `sw.js`, `shared/*.js`, 인라인 스크립트)
- [ ] 중복 `id` 0 (수학 86 / 영어 69 기준)
- [ ] 캐시명 상향: `amt-cache-v2.3` → `v2.4`, `aet-cache-v1.5` → `v1.6`

---

## 7. 코드 작업 도구 핸드오프 (파일·행·패치 요약)

> 작업 전 `backup/`에 파일 백업, 완료 후 `node --check` + 중복 id 검사. 실 Gemini 호출 금지.

| ID | 파일 | 행 | 패치 요약 |
|---|---|---|---|
| P1-1 | `english/index.html` | 1986-1992 | `escapeJsString`의 `"` → `&quot;`, `<`/`>` 이스케이프 추가 |
| P1-2 | `index.html` | 4020-4135 | `reqIndex` 고정, push/동기화/렌더를 `reqIndex` 기준으로, 다른 탭이면 토스트 |
| P1-3 | `index.html` | 3828-3945 | `reqProblemIndex`/`reqStepIdx` 고정, followups 기록·재렌더를 고정 인덱스로 |
| P2-1 | `english/index.html` | 1906-1918 | 복원 시 `selectedChoiceIndex = -1`, `submitEnglishQuizAnswer()` 호출 제거, 저장된 결과만 표시 |
| P2-2 | `index.html` | 1846-1885, 1710, 2544, 3371 | `populateModelSelect(models)` 실제 구현 + 초기화 시 복원, 안내 문구 정합 |
| P2-3 | `shared/core.js`, `index.html` | `core.js:83`, `index.html:2359` | 해설/읽기 `maxOutputTokens: 32768`, `thinkingLevel` 가드+400 폴백, `MAX_TOKENS` 감지 |
| P2-4 | `english/index.html` | 1234, 1731-1744 | 저장 시 `_twinQuizConsumed` 제거, 복원 시 `false`로 재설정 |
| P2-5 | `index.html` | 848, 1609-1641 | `saveTutorHistory` 옵션화, `saveQuizToHistory`에서 `overall_chat: []` |
| P2-6 | `index.html` | 1085-1090, 1246, 1279 | `setQuizInputMode(mode, { persist })`, 폴백은 비영속, 1279는 메모리 모드 우선 |
| P3-1 | `english/index.html` | 862-889 | `switchMode`에서 퀴즈 상태 초기화 |
| P3-2 | `shared/ui.css` | 208-210 | 110px 여백을 오디오바 존재 시에만 적용 |
| P3-3 | `shared/ui.js`, `shared/ui.css` | `ui.js:23`, `ui.css:212` | 모바일 테마 토스트 위치 상향 |
| P3-4 | `shared/ui.css` | 152-170 | edutech 규칙에 `#submitQuizBtn` 추가 |
| P3-5 | `index.html` | 2 | `class="light"` 제거 또는 토글 시 정리 |
| P3-6 | `index.html` | 4063, 4120-4135 | 전역 `overallChatBusy` 버튼 상태를 요청 소속 문제 기준으로 (P1-2와 동시 수정) |
| P3-7 | `english/index.html` | 615-728 | 스키마 타입 대문자 통일 |
| P3-8 | `shared/core.js` | 215-249 | `maxAgeMs` + `schemaVersion` 도입 |
| SW | `sw.js`, `english/sw.js` | 1 | 캐시명 상향 (`v2.4` / `v1.6`) |

---

## 8. 문서 동기화 대상

| 파일 | 현재 | 수정 |
|---|---|---|
| `PROJECT_SPEC.md` | `v1.6-beta` (3, 81행) | v1.8 기능(질문식 풀이·twin_quiz·영어 앱·3테마·공유 모듈) 반영, 버전 표기 갱신 |
| `docs/ARCHITECTURE.md` | `v1.6`, 170,932 bytes, `amt-cache-v1.8` (4, 31, 178행) | 실제 구조(`english/`, `shared/`)·캐시명(`amt-cache-v2.3`)·파일 크기 갱신 |
| `docs/AUDIT_v1.8.md` | 본 문서 | — |
