# v1.6 기능 + v1.7 공유 모듈/영어 앱 통합 감사 보고서

> 감사일: 2026-10-27  
> 대상: `524a9b7` (v1.7 공유 모듈/영어 스켈레톤 커밋) + `docs/AUDIT_v1.7.md`(본 보고서)  
> 감사자: AI 어시스턴트(코드 수정 없음, 분석/검증만 수행)  
> 판정: **수학 앱 단독 사용은 가능. 단, 4択 채점·다크모드·단계 Q&A는 수정 전 배포 비권장.**

---

## 1. 검증 방법

| 구분 | 내용 |
|---|---|
| 정적 검사 | `node --check` — `sw.js`, `english/sw.js`, `shared/*.js`, `index.html`/`english/index.html` 인라인 스크립트 전부 통과 |
| DOM 검사 | 중복 `id` 없음 (수학 77개, 영어 17개) |
| 런타임 | 로컬 `python3 -m http.server 8765` + Chromium 실제 로드 |
| 기능 검증 | 실제 함수 호출(스텁으로 Gemini 응답 주입), DOM/계산 스타일 측정 |
| 확률 검증 | `shuffleChoices` 5,000회 + 20,000회 반복 시뮬레이션 |
| 미검증 | 실제 Gemini API 응답(더미 키 사용), iOS 실기기 음성, HTTPS 환경의 SW 등록 |

> 로컬 서버는 `127.0.0.1`이라 영어 SW 등록 조건(`https` 또는 `localhost`)에 걸리지 않아 SW 등록 자체는 미검증. 코드 경로 검토로 대체했다.

> **참고**: 이 보고서의 P0/P1은 **v1.6에서 새로 추가된 기능(SVG/4択/단계 Q&A)** 과 **v1.7 공유 모듈·영어 스켈레톤**에서 발견된 것이다. 커밋 `0b34376`에서 수정한 기존 21건과는 별개이며, 그 21건의 회귀는 발견되지 않았다.

---

## 2. 종합 요약

| 등급 | 건수 | 의미 |
|---|---|---|
| **P0** | 3 | 오답 판정/이전 문제 대화 노출 — 신뢰 직결, 즉시 수정 |
| **P1** | 7 | 기능이 사실상 무효이거나 데이터가 손실됨 |
| **P2** | 10 | 품질·일관성·오프라인 문제 |
| **P3** | 5 | 접근성·문서·정리 |

**정상 확인된 것 (그대로 유지 가능)**

- 사진 업로드 → 해설 → 단계 카드 → 마이노트 저장/복원 흐름 정상
- 원시 LaTeX 보존(`data-raw-math`) 정상, 저장 후 재렌더링 정상
- 그래프 기본 렌더링(1차/2차함수, 정의역 ●/○, 캡션) 정상
- 4択 채점이 **로컬에서 즉시** 처리됨(API 호출 없음) — 설계 의도 충족
- 공유 스토리지 마이그레이션(`amt_` → `tutor_`) 정상 동작
- 영어 앱 기본 골격(PIN 해제, 설정 저장, API 호출 경로) 동작
- `amt_`/`aet_`/`tutor_` 프리픽스 분리, 상대 앱 키 오염 없음

---

## 3. P0 — 즉시 수정

### A-01. 4択 해설이 선택지 셔플과 어긋남 (오답 설명이 다른 보기에 붙음)

- 위치: `index.html:1115` (`choiceFeedback[selectedChoiceIndex]`), `index.html:1058` (`shuffleChoices`)
- 원인: `displayChoices`만 섞고 `choiceFeedback`은 원본 순서로 저장. 조회는 화면 인덱스로 함.
- 측정: 5,000회 중 **75.1%** 불일치 (20,000회에서 75.455%)
- 영향: 틀린 보기를 골랐을 때 **다른 보기의 오답 해설**이 표시됨. 학습 앱에서 치명적.
- 수정안: 선택지와 피드백을 한 객체로 묶어 함께 셔플.
  ```js
  // {text, feedback, isCorrect}[] 로 섞고
  // displayChoices / displayFeedback / displayCorrectIndex를 같은 순서로 유지
  ```

### A-02. 4択 데이터 검증 부재 — 정답이 없거나 보기가 중복됨

- 위치: `index.html:1221-1231`
- 재현 결과:

  | 모델 응답 | 실제 화면 |
  |---|---|
  | 보기 3개 | `["解なし","0","-1","0"]` 로 **보기 중복** + 정답 index 1로 변조 |
  | 보기 5개, `correct_index: 4` | `slice(0,4)` 후 `displayCorrectIndex: -1` → **정답 선택 불가** |
  | `["A","A","B","C"]` | 중복 그대로 표시, 정답이 2개처럼 보임 |

- 수정안: ① `choices.length === 4` ② trim 후 중복 없음 ③ `correct_index`가 0~3 정수 — 3조건 모두 통과할 때만 채점 UI 표시. 실패 시 **재생성 1회**, 그래도 실패하면 "類題を作成できませんでした" 안내. 가짜 보기 생성 금지, `slice(0,4)` 제거.

### A-03. 이전 문제의 단계 Q&A가 새 문제에 그대로 노출

- 위치: `index.html:2511` (`renderTutorResult`가 `stepChats`를 초기화하지 않음), 선언 `index.html:694`
- 재현: 문제 A의 0번 단계에 채팅 → 문제 B 해설 → B의 0번 단계에 **A의 질문/답변 표시**
- 추가: 키가 `${문제 인덱스}:${단계 인덱스}`라 문제를 바꿔도 `0:0`이 재사용됨
- 수정안: `renderTutorResult()` 진입 시 `stepChats = {}; stepChatBusy = {};` 초기화. (저장/복원을 붙일 때는 히스토리 ID를 키에 포함)

---

## 4. P1 — 기능 무효/데이터 손실

### B-01. 다크모드가 실제로 동작하지 않음 (수학: 에러, 영어: 설정 무시)

- 수학: `index.html:23`에서 `tailwind.config`를 **CDN 로드 전**(`index.html:37`)에 설정 → `ReferenceError: tailwind is not defined`. 이후 CDN이 기본 설정으로 초기화되어 `darkMode`가 `null`(= media)이 됨.
- 측정: `dark` 클래스가 있어도 `bg-white dark:bg-slate-800` → `rgb(255,255,255)` (라이트 값 유지). `.dark body` 커스텀 CSS만 적용되어 **흰 카드가 어두운 배경 위에 뜨는** 상태.
- 영어: `english/index.html:23`이 `tailwind = { config: {...} }` 형태라 CDN이 덮어씀. `dark:bg-*` 무효 + `bg-english-mid`도 투명(커스텀 색상 미적용). 콘솔 에러는 없어서 더 위험.
- 파생 위험: `darkMode`가 media로 동작하므로 **시스템이 다크인 사용자는 라이트 모드로 바꿔도 `dark:` 스타일이 남음**.
- 수정안: 두 앱 모두 CDN **다음**에 `tailwind.config = { darkMode: 'class', ... }` 배치. 수정 후 computed style로 검증.

### B-02. 다크 모드 선택지 색상이 무효 CSS

- 위치: `index.html:160-164` — `background-color: #064e3b/50 !important;` (잘못된 값)
- 측정: 배경 `rgb(236,253,245)` + 글자 `rgb(167,243,208)` → 대비 **1.22:1** (사실상 안 보임)
- 수정안: `rgba(6, 78, 59, 0.5)`. ※ B-01 수정 후 재측정 필요.

### B-03. 단계 Q&A가 저장/복원되지 않음

- 위치: `index.html:3492` (`renderStepChatLogs`는 `stepChats`만 읽음), `index.html:2379` (`followups`는 정규화만 하고 쓰는 곳 없음), `index.html:3537` (`sendStepQuestion`이 `followups`에 기록하지 않음)
- 재현: 채팅 후 노트 저장 → 저장된 `steps[0].followups`는 `[]`. 복원해도 대화 안 보임.
- 수정안: assistant 응답 추가 직후 `step.followups = stepChats[chatKey].slice(-8)` 동기화. 복원 시 `step.followups`로 `stepChats`를 hydrate.

### B-04. "もっとやさしく"가 그래프를 삭제하고, 지운 채팅이 되살아남

- 위치: `index.html:2762` (`visual: data.visual || step.visual`), `index.html:2775` (채팅만 초기화, `followups`는 유지)
- 재현: 그래프가 있는 단계에 적용 → 모델이 `visual:{type:"none"}` 반환 시 **그래프 소실**. `step.followups`는 남아 저장/복원 후 옛 대화가 부활.
- 수정안: `type === 'none'`은 "기존 visual 유지"로 처리(명시적 제거가 필요하면 별도 필드). 채팅 초기화 시 `step.followups = []`도 함께.

### B-05. Service Worker가 상대 앱 캐시를 삭제

- 위치: `sw.js:26`, `english/sw.js:26` — `keys.filter(k => k !== CACHE_NAME)` → **모든 캐시 삭제**
- 영향: 수학 v1.7 활성화 시 영어 `aet-cache-v1.0` 삭제, 영어 활성화 시 수학 `amt-cache-v1.7` 삭제. 두 앱을 오가면 매번 오프라인 캐시가 사라짐.
- 수정안: 프리픽스 필터 — 수학 `k.startsWith('amt-')`, 영어 `k.startsWith('aet-')`만 정리.

### B-06. 부모 PIN이 두 앱에서 공유되지 않음 (우회 가능)

- 수학: `app_pin` (`index.html:1574`), 영어: `pin` (`english/index.html:296,330`)
- 영어 설정 화면에는 "수학 튜터와 자동 공유"라고 안내되지만 실제로는 별개. 영어에서 9999로 바꿔도 수학은 1234로 열림 → **보호자 PIN이 무력화**.
- 수정안: 키를 `app_pin`으로 통일하고, 영어는 기존 `pin`을 레거시로 읽기만.

### B-07. 영어 음성 낭독이 일본어 해설을 영어 음성으로 읽음

- 위치: `english/index.html:438` — `lastPassageText`(일본어 마크다운 전체)를 `lang:'en-US'` 엔진으로 낭독
- 영향: 일본어 문장을 영어 음성으로 읽어 발음이 깨지고, 마크다운 기호도 일부 남음. "読んで聞いて" 핵심 기능 무효.
- 수정안: 영어 본문만 별도 보관(`passageEn`)해 en-US로 읽고, 일본어 해설은 ja-JP 엔진으로 분리. 응답을 JSON(`passage`, `translation`, ...)으로 받는 편이 안전.

---

## 5. P2 — 품질/일관성

### C-01. 4択 정답 기록이 부실함
`index.html:1461` — `studentAnswerInput`(숨김)에서 값을 읽어 **학생 답이 공백**으로 저장됨. 실제로는 `displayChoices[selectedChoiceIndex]`를 저장해야 함. 모드/선택 텍스트/정답 텍스트도 저장되지 않아 나중에 복원 시 맥락 상실.

### C-02. 오답 결과 카드에 정답이 없음
`index.html:1398` 부근 — 정답일 때만 `correct_answer` 블록 렌더링. 계획서 요구사항(오답 시 정답 제시) 미충족. 재현: 오답 카드 텍스트에 정답 `42` 없음.

### C-03. "この部分を質問"의 인용이 프롬프트에 전달되지 않음
`index.html:3465` — 화면에 `引用: 【理由】...`를 보여주지만 입력창에는 일반 문구만 채우고, `sendStepQuestion` 프롬프트에 `【生徒が分からない部分】`가 없음. 모델은 어느 부분 질문인지 모름.

### C-04. 채팅 최대 턴 제한 미적용
6턴(12메시지)을 넘어 **7턴 14메시지까지 수용**되고 입력도 계속 활성(`input.disabled === false`). 계획서의 제한을 실제로 막아야 함(초과 시 입력 비활성 + 안내).

### C-05. SVG 시각화 세부 결함
| 항목 | 재현 결과 |
|---|---|
| `guides.from: 0` | `0 \|\| yMin`으로 처리 → y=0이 아니라 yMin에 그림 (y1 `210`, 기대 `67.5`) |
| 축 눈금 숫자 | 없음. `x`, `y` 라벨만 표시 |
| `curve.label` | 무시됨(`y=3x+1` 라벨 미표시) |
| `numberline.marks` | 완전 무시(원 0개) |
| `type:"figure"` | 스키마에는 허용되지만 렌더러가 else로 빠져 **조용히 숨김**. 스키마에 `figure` 페이로드도 없음 |
| `curves:[null]`, `points:[null]` | `TypeError` → 단계 렌더링 중단 |
| `dashed` 플래그 | 무시(항상 CSS로 점선) |

수정: `g.from ?? yMin` / `g.to ?? 0`, 눈금 라벨 생성, `curve.label` 텍스트, `marks` 구현, `figure`는 스키마+렌더러 동시 추가 또는 스키마에서 제거, 배열 원소 null 필터.

### C-06. 오프라인에서 스타일/수식이 깨짐
`sw.js`/`english/sw.js` 모두 `response.type === 'basic'`만 캐시 → Tailwind/KaTeX CDN 응답 미캐시. 오프라인 재실행 시 CSS·수식 렌더링 불가. (로컬 `shared/*`는 수학 SW ASSETS에 추가되어 정상)

### C-07. 영어 결과가 마크다운 원문으로 표시됨
`english/index.html:426` — `escapeHtml`만 적용해 `##`, `**`가 그대로 노출. 프롬프트가 마크다운을 요구하므로 렌더러가 필요하거나 JSON 구조화 출력으로 전환.

### C-08. PWA scope 중첩 — 앱 안에서 영어로 이동하면 수학 앱 창이 영어가 됨
수학 `manifest.json`의 `scope: "./"`가 `/ai-math-tutor/` 전체를 포함. 홈 화면의 "AI数学"을 열고 헤더의 🇬🇧 링크를 누르면 같은 standalone 창이 `/english/`로 이동. 두 앱을 "별도 PWA"로 쓰려면 `target="_blank" rel="noopener"`로 새 창을 열거나, 최종적으로 `/math/` + `/english/`로 분리해야 함.

### C-09. 영어 앱 모델 하드코딩
`english/index.html:410` — `gemini-2.5-flash` 고정. 수학 앱의 모델 선택/폴백과 불일치. 설정에서 모델을 고르게 하거나 공유 설정을 사용.

### C-10. 영어 PIN 모달 세션 로직
`english/index.html:275` — `!savedPin && sessionStorage...` 조건이라 **커스텀 PIN을 설정하면 새로고침마다 PIN을 다시 요구**하고, 기본 PIN일 때만 세션 내 유지됨. 의도와 반대. `savedPin && unlocked`일 때 숨기는 형태로 정리.

---

## 6. P3 — 접근성/정리

- **D-01** 캡션 길이 제한 없음 — 200자 캡션도 그대로 렌더링. 모바일에서 카드가 과도하게 길어짐(말줄임/최대 2줄 권장).
- **D-02** 토스트/채팅에 `aria-live` 없음, 결과 카드에 `role="status"` 없음 → 스크린리더 미지원.
- **D-03** `prefers-reduced-motion` 미대응(단계 페이드/스크롤 애니메이션).
- **D-04** 수학 앱이 `TutorCore`/`TutorSpeech`/`TutorUI`를 로드만 하고 사용하지 않음(자체 중복 구현). `ui.css`도 대부분 덮어써짐 → 공유 모듈 정리 또는 실제 마이그레이션 필요.
- **D-05** 문서 불일치: `PROJECT_SPEC.md`는 다크모드/그래프/단계질문을 "완료"로 표기, `docs/ARCHITECTURE.md`는 캐시를 `v1.6`으로 표기(실제 `v1.7`), 디렉터리 구조에 `shared/`·`english/` 미반영.

---

## 7. 저장소 상태

```
524a9b7 feat: implement multi-app architecture with shared modules and english tutor skeleton
?? docs/AUDIT_v1.7.md
```

- v1.7 작업(`index.html`, `sw.js`, `shared/`, `english/`)은 **커밋 `524a9b7`로 정리되어 `origin/main`에 푸시됨** → GitHub Pages에 그대로 배포되는 구성. 감사 시점의 작업 트리와 커밋 내용이 일치함.
- `sw.js`는 `amt-cache-v1.7` + `/english/` 가드 + `shared/*` 프리캐시 반영 완료.
- `backup/v1.6-beta/`는 존재하나 v1.7 이전 스냅샷은 별도로 없음 → 롤백은 `git revert 524a9b7` 또는 `git checkout 55ea89e` 사용.
- `PROJECT_SPEC.md` / `docs/ARCHITECTURE.md`는 아직 v1.7 내용을 반영하지 못함(D-05).

---

## 8. 수정 순서 (권장)

1. **A-01, A-02** — 4択 채점/검증 (정답 신뢰성)
2. **A-03, B-03, B-04** — 단계 Q&A 상태/저장/초기화 (한 번에 정리)
3. **B-01, B-02** — Tailwind 로드 순서 + 선택지 CSS (다크모드)
4. **B-05, B-06** — SW 캐시 프리픽스, PIN 키 통일
5. **B-07, C-07, C-09, C-10** — 영어 앱 기능 정합성
6. **C-01~C-06** — 기록/시각화/오프라인
7. **C-08** — PWA 분리 정책 결정(`target="_blank"` 임시 vs `/math/` 이전)
8. 문서 동기화(`PROJECT_SPEC.md`, `ARCHITECTURE.md` → v1.7/캐시/구조) + `v1.7` 태그

---

## 9. 수정 후 재검증 체크리스트

- [ ] 콘솔 에러 0 (`tailwind is not defined` 포함)
- [ ] 라이트/다크 전환 시 카드·선택지 배경이 실제로 바뀜 (computed style)
- [ ] 다크 선택지 대비 ≥ 4.5:1
- [ ] 보기 3개/5개/중복/`correct_index` 범위 밖 → 채점 UI 미표시 또는 재생성
- [ ] 셔플 후 오답 해설이 **고른 보기**의 해설과 일치
- [ ] 오답 카드에 정답 표시
- [ ] 새 문제 해설 시 이전 문제 채팅 미노출
- [ ] 채팅 저장 → 새로고침/복원 후 대화 유지
- [ ] 6턴 초과 시 입력 비활성 + 안내
- [ ] 인용 질문이 프롬프트에 포함
- [ ] "もっとやさしく" 후 그래프 유지, 옛 채팅 미복원
- [ ] 수학/영어 SW 교차 활성화 후 각 캐시 유지
- [ ] 영어 PIN을 바꾸면 수학 앱도 같은 PIN 적용
- [ ] 영어 음성이 영어 본문만 읽음
- [ ] 오프라인 재실행 시 스타일·수식 유지
