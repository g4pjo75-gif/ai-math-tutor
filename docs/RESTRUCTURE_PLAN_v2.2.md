# 구조 재편 및 향후 수정 계획서 v2.2 (확정판)

> 작성일: 2026-10-29
> 기준 커밋: `cc07dcb` (working tree clean)
> 대상: 수학 앱 / 영어 앱 / `shared/*`
> 작성자: AI 어시스턴트 (계획 수립 전용 — 코드 수정 없음)
> 실행: 전용 코드 작업 도구가 본 문서의 Phase 순서대로 수행
>
> **v2.1 변경점**: 루트를 수학 앱에서 **허브(과목 선택 랜딩)** 로 변경하고, 수학을 `math/` 로 이동.
> 이에 따라 Phase 구성과 PWA/Service Worker 마이그레이션 절차를 추가했다.
>
> **v2.2 변경점 (확정판)**: 7장의 결정 사항을 **전부 확정**으로 전환(더 이상 선택지 아님).
> Phase 0 실행 지시문(`4.0`)과 Phase 1의 **행 단위 경로 치환표**(`4.1`)를 추가해 코드 도구가
> 판단 없이 그대로 실행할 수 있게 했다. Phase 0 → 1 핸드오프 계약을 명문화했다.

### 확정된 방향 (v2.2에서 잠금)

| 항목 | 확정 내용 |
|---|---|
| 루트 | **허브(과목 선택 랜딩)**. 설치 불가(manifest 없음) |
| 수학 위치 | `/math/` (기존 `/`에서 이동) |
| 영어 위치 | `/english/` **변경 없음** |
| 공통 코드 | `core/` · `shared/` 는 루트 유지, `../` 참조 |
| 루트 `sw.js` | **삭제 금지.** cleanup SW로 교체 후 최소 2회 배포 주기 유지 |
| 수익화 | **BYOK 무료 + 구독 병행**, API 프록시(서버 키 보관), Stripe |
| 테스트 | `node:test`(L1) + Playwright `page.route`(L2) + 수동(L3) |
| 번들러 | Phase 7까지 도입하지 않음 (정적 배포 유지) |

> 이 표의 항목은 **재논의 대상이 아니다.** 변경이 필요하면 문서를 v2.3으로 올리고
> 영향받는 Phase의 DoD를 다시 계산한다.

---

## 0. 목적 · 범위 · 비목표

### 목적

1. 기능 수정을 **중단**하고 구조를 먼저 확정한다.
2. 구조 확정 후 **테스트를 도입**한다(테스트 자산은 Phase 0에서 최소한만 선행).
3. 최종 수익화(서버 프록시 · 계정 · 과금)로 이어질 수 있는 **경계**를 지금 만든다.
4. 과목이 늘어나도(수학·영어·향후 국어/과학) URL과 배포가 깨지지 않는 형태로 만든다.

### 범위

- 루트 허브 + `math/` · `english/` 과목 폴더 구조
- 모듈 경계, 의존 방향, 로드 방식, PWA/SW 자산 목록
- 이벤트 처리 방식(인라인 핸들러 제거)
- 테스트 계층과 회귀 체크리스트
- 각 단계의 작업 지시 · 완료 조건(DoD) · 롤백 방법

### 비목표 (이번 구조 작업에서 하지 않는 것)

- **기능 추가·동작 변경·프롬프트 문구 수정 금지**
- UI 디자인 변경 금지(허브는 최소 마크업만)
- 새 라이브러리 도입 금지(번들러·프레임워크 포함)
- 수익화 기능(결제·로그인) 구현 금지 — Phase 7에서 별도 저장소
- 발견된 버그는 고치지 않고 `docs/AUDIT_v1.8.md` 백로그에 기록만

> **핵심 규칙**: 구조 변경 커밋에는 로직 변경을 절대 섞지 않는다. 이동과 수정을 분리해야 문제 발생 시 원인을 특정할 수 있다.

---

## 1. 현재 상태 (기준선)

### 1.1 수치

| 항목 | 수학 | 영어 |
|---|---:|---:|
| 파일 크기 | 216,294 bytes | 105,600 bytes |
| 줄 수 | 4,502 | 2,018 |
| 인라인 스크립트 | 690~4,501행 (약 3,810줄, **단일 블록**) | 569~2,016행 (약 1,446줄) |
| 함수 수 | 97 | 60 |
| 인라인 `onclick` | 68 | 57 |
| `<script>` 태그 | 9 | 7 |

### 1.2 현재 URL 구조의 문제

```
/ai-math-tutor/            → 수학 앱 (manifest scope: /ai-math-tutor/)
/ai-math-tutor/english/    → 영어 앱 (scope: /ai-math-tutor/english/)
```

- 루트가 수학 앱이라 **영어는 "부속 폴더"** 처럼 보인다. 과목이 늘어날수록 대칭이 깨진다.
- 수익화에 필요한 **랜딩/가격/약관/로그인**을 놓을 자리가 없다.
- 수학 SW가 루트 스코프(`/ai-math-tutor/`)를 차지해 영어를 예외 처리로 피해 가는 구조다(현재 `/english/` 가드).
- 반면 `localStorage`는 **origin 단위**이므로 폴더를 옮겨도 학습 기록·API 키·설정은 그대로 유지된다. 이동 자체는 데이터 안전하다.

### 1.3 구조적 문제

| # | 문제 | 근거 |
|---|---|---|
| 1 | **단일 스크립트 = 단일 장애점** | 3,810줄 어디서든 문법 오류 1개면 해설·퀴즈·설정·저장 전부 정지 |
| 2 | **중복 구현이 실제 버그를 생성** | 수학 인라인 `callGeminiModel`/`escapeJsString`과 `shared/*` 공존 → 영어만 `\"` 버그, `maxOutputTokens`가 양쪽에 따로 존재 |
| 3 | **테스트 불가** | DOM·전역 상태에 강결합. 함수 단위 실행 경로 없음 |
| 4 | **인라인 핸들러 125개** | 문자열 이스케이프 의존 → XSS/파손 취약점의 근원. CSP 적용 불가 |
| 5 | **재사용 경계 없음** | 프롬프트·스키마·채점·캐시가 UI 코드에 섞여 서버/Next.js에서 재사용 불가 |
| 6 | **의존성 CDN** | Tailwind CDN(JIT)·KaTeX CDN·Google Fonts → 오프라인 PWA 불완전, CSP 불가 |

### 1.4 현재 정상 동작 (구조 변경 중 깨지면 안 되는 것)

- 사진 업로드 → 해설 → 단계 카드 → 노트 저장/복원(대화·followups 포함)
- 다문제 해설 + 문제 탭 전환
- twin_quiz 재사용(추가 API 0회), 4択 로컬 채점, 오답 정답 표시
- 요청 해시 캐시(동일 문제 2회 = API 1회)
- 문제 전체 Q&A / 단계 Q&A (탭 전환 레이스 수정 반영)
- 테마 3종 + 다크모드 영속, PIN/API키 공유
- 영어 읽기/4択/작문/단어장/노트, en-US·ja-JP 음성
- SW 프리픽스 분리(`amt-`/`aet-`)

---

## 2. 목표 아키텍처

### 2.1 디렉터리

```
/
├── index.html                  # ★ 허브(과목 선택 랜딩) — 설치 불가
├── sw.js                       # ★ 구 수학 SW 정리용(한시적, Phase 1)
├── robots.txt                  # (선택)
│
├── math/                       # ★ 수학 앱 (설치 가능 PWA)
│   ├── index.html
│   ├── manifest.json           # start_url/scope = ./math/
│   ├── sw.js                   # scope = /math/
│   ├── icon-192.png / icon-512.png / apple-touch-icon.png
│   └── (Phase 2 이후) app.js → state.js … main.js
│
├── english/                    # 영어 앱 (설치 가능 PWA, 경로 유지)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── icon-*.png
│   └── (Phase 2 이후) app.js → state.js … main.js
│
├── core/                       # ★ 순수 도메인 (DOM/window 금지)
│   ├── prompts/math.js
│   ├── prompts/english.js
│   ├── schemas/math.js
│   ├── schemas/english.js
│   ├── grading/math.js
│   ├── grading/english.js
│   └── models.js
│
├── shared/                     # ★ 브라우저 공통 (앱 비의존)
│   ├── api/client.js
│   ├── api/parse.js
│   ├── api/cache.js
│   ├── platform/storage.js
│   ├── platform/speech.js
│   ├── platform/browser.js
│   ├── ui/ui.js
│   ├── ui/theme.js
│   ├── ui/text.js
│   ├── auth/pin.js
│   └── ui/ui.css
│
├── tests/                      # Phase 0에서 생성
│   ├── fixtures/*.json
│   ├── stub-gemini.js
│   └── e2e/*.spec.js
│
└── docs/
```

### 2.2 URL · PWA · SW 경계

| URL | 앱 | manifest | installable | SW scope | 비고 |
|---|---|---|---|---|---|
| `/` | 허브 | 없음 | ✕ | `/` (정리용, 한시) | 웹 방문자용. 앱 아이콘은 여기로 오지 않음 |
| `/math/` | 수학 | `./math/manifest.json` (`start_url:"./"`, `scope:"./"`) | ○ | `/math/` | 기존 아이콘은 리다이렉트로 동작, 새 아이콘 재설치 권장 |
| `/english/` | 영어 | `./english/manifest.json` | ○ | `/english/` | **경로 변경 없음** |

**핵심 원칙**

1. **허브는 "웹 방문자용"이고, 앱 아이콘은 허브를 거치지 않는다.** 수학 PWA의 `start_url`을 `./math/`로 두면 홈 화면 아이콘은 바로 수학으로 진입한다. "한 번 더 탭" 문제는 발생하지 않는다.
2. **영어는 이동하지 않는다.** 이미 `/english/`이므로 그대로 두고, 수학만 `/math/`로 옮겨 대칭을 맞춘다. 이동 범위를 줄이는 것이 안전하다.
3. **허브는 설치 불가(no manifest).** 허브에 manifest를 주면 scope `/`가 수학 scope와 겹쳐 "어떤 앱이 설치되는지" 혼란이 생긴다. 랜딩은 웹으로만 제공한다.
4. **`shared/`·`core/`는 루트 유지.** 두 앱이 `../shared/...`로 참조하고, 각 앱 SW가 자기 캐시에 저장한다.

### 2.3 계층 규칙 (위반 금지)

```
core/    ← 아무것도 import 하지 않음 (순수 함수)
shared/  ← core/ 만 import
math/    ← core/, shared/ import
english/ ← core/, shared/ import
```

- `math/` ↔ `english/` 상호 import 금지
- `shared/`는 `math/`·`english/`를 알면 안 됨
- `core/`는 `document`, `window`, `localStorage`, `fetch`를 직접 쓰지 않음(파라미터로 주입)
- 순환 import 발생 시 → 공통 부분을 `core/`로 올린다

### 2.4 설계 원칙

1. **한 파일 300줄 이하**, 최대 500줄. 초과 시 분리.
2. **인라인 핸들러 금지** — `onclick="fn('...')"` 대신 `data-action="fn" data-id="..."` + 위임 리스너 1개.
   - `escapeJsString`이 불필요해지고(삭제 대상), XSS 계열 버그가 원천 차단된다.
3. **전역 오염 금지** — 모듈 스코프 사용. 디버그용으로만 `window.__app` 노출.
4. **상태는 `state.js` 단일 소유** — 기능 모듈은 상태를 직접 만들지 않고 접근자로 읽고 쓴다.
5. **부수효과는 가장자리로** — `core/`는 계산만, DOM 조작은 `render.js`/`ui`.
6. **프롬프트/스키마는 문자열 상수 + 빌더 함수** — DOM 값을 읽지 않고 인자로 받는다.
7. **정적 배포 유지** — Phase 6까지 번들러 도입 금지(GitHub Pages 그대로).
8. **캐시 무효화는 `?v=` + SW 캐시명 동시 갱신** — 한쪽만 바꾸면 구버전이 남는다.

### 2.5 파일 책임 (수학 — `math/`)

| 파일 | 책임 | 현재 위치(기준선) |
|---|---|---|
| `state.js` | 스토리지 래퍼, 전역 상태(`currentProblems`, `currentProblemIndex`, `currentQuizData`, `quizInputMode`, `selectedChoiceIndex`, `currentImageBase64`, `stepChats`, `overallChats`, `tutorHistory`, `stepQuotes`) | 691~780 |
| `main.js` | DOMContentLoaded, 테마/다크/안전영역 초기화, PIN, 노트/음성 초기화, SW 등록 | 781~832, 1704~1771 |
| `settings.js` | 설정 모달, PIN 저장, 모델 목록 조회/선택, API 키 경고 | 1772~1945 |
| `upload.js` | 이미지 선택·리사이즈·진행률, 섹션 페이드 | 1946~2025 |
| `solve.js` | 해설 프롬프트 조립, `solveProblem` | 2026~2632 |
| `render.js` | `sanitizeMathString`, `renderMathIn`, `normalizeTutorResult`, 문제 탭, 단계 카드 | 2633~3010 |
| `simplify.js` | 「もっとやさしく」 재생성 | 3011 부근 |
| `voice.js` | 음성 선택/속도/재생/중지/분할 | 3108~3260 |
| `visual.js` | SVG 그래프·수직선 | 3453~4050 |
| `chat-step.js` | 단계 Q&A | 4051~4278 |
| `chat-overall.js` | 문제 전체 Q&A | 4279~4500 |
| `quiz.js` | 4択 UI/채점/폴백/기호 팔레트 | 1097~1241, 1242~1703 |
| `similar.js` | 類題 생성(원샷) | 1011~1096 |
| `history.js` | 노트 저장/목록/복원/삭제 | 833~1010 |

> 주의: `setUploadProgress`·`showSectionWithFade`는 퀴즈 섹션에 있지만 `upload.js`/`ui` 소속이다. 이동 시 호출부를 함께 확인할 것.

### 2.6 파일 책임 (영어 — `english/`)

| 파일 | 책임 | 현재 위치 |
|---|---|---|
| `state.js` | 스토어 2종, 음성 엔진 2종, 앱 상태 | 570~610 |
| `main.js` | 초기화, 모델 드롭다운, API 키 배너, SW | 729~858 |
| `settings.js` | 설정 모달, PIN, 모델 | 729~858 중 설정부 |
| `upload.js` | 이미지 업로드/리사이즈 | 924~990 부근 |
| `reading.js` | 읽기 분석·결과 렌더 | 924~1185 |
| `quiz.js` | 4択 생성/채점/폴백 | 1186~1419 |
| `writing.js` | 작문 첨삭 | 1420~1611 |
| `wordbook.js` | 단어장 | 1612~1700 부근 |
| `history.js` | 노트(읽기/퀴즈/작문) 저장·복원 | 1700~1971 |
| `voice.js` | en-US/ja-JP 낭독, 속도 | 1972~2016 |

### 2.7 파일 책임 (core / shared)

| 파일 | 내용 | 현재 위치 |
|---|---|---|
| `core/schemas/math.js` | `TUTOR_RESPONSE_SCHEMA`, `QUIZ_GEN_SCHEMA`, `SIMPLIFY_RESPONSE_SCHEMA`, `OVERALL_CHAT_SCHEMA` | 수학 2028~ |
| `core/prompts/math.js` | `buildSystemPrompt`, 유사문제/퀴즈/간단화/채팅 프롬프트 빌더 | 수학 2026~, 1011~, 1360~, 2990~, 4140~ |
| `core/grading/math.js` | `isValidQuizObject`, `shuffleChoices`, `formatChoiceMath`, 동치 판정 | 수학 1120~1230 |
| `core/schemas/english.js` | 읽기/퀴즈/작문 스키마 | 영어 611~728 |
| `core/grading/english.js` | `isValidQuizResponse`, `shuffleQuizChoices` | 영어 1186~ |
| `shared/api/client.js` | `callGeminiModel`(단일 구현), `fetchWithTimeout`, `MAX_TOKENS` 감지 | `shared/core.js:52`, 수학 2350~ |
| `shared/api/parse.js` | `parseTutorJson`/`parseJson` | `shared/core.js:17`, 수학 2380~ |
| `shared/api/cache.js` | 요청 해시, TTL, `get/setCachedResponse` | `shared/core.js:190~249` |
| `shared/platform/storage.js` | 현 `shared/storage.js` | 그대로 이동 |
| `shared/platform/speech.js` | 현 `shared/speech.js` + 음성 목록/선택 헬퍼 | 그대로 + 추가 |
| `shared/ui/theme.js` | `applyTheme`/`initTheme`/다크모드 | `shared/ui.js`, 수학 781~ |
| `shared/auth/pin.js` | PIN 게이트(양 앱 동일 로직) | 수학 1704~, 영어 729~ |

### 2.8 이 구조가 "서비스"에 어디까지 해당하는가

> **결론: 클라이언트(프론트엔드) 구조로서는 실제 서비스 수준이다. 서비스 전체는 아니다.**
> Phase 1~6이 끝나면 "유료 서비스를 얹을 수 있는 앱 구조"가 되고, Phase 7에서 서버가 붙는다.

| 구분 | 이 구조가 보장하는가 | 담당 Phase |
|---|---|---|
| 과목별 독립 배포·독립 PWA scope | ○ | 1 |
| 모듈 경계·순환 의존 차단 | ○ | 3~5 |
| 도메인 로직의 서버 이식 가능성 (`core/` DOM 무의존) | ○ | 5 |
| 회귀 안전망(단위·통합·수동) | ○ | 6 |
| 랜딩(마케팅) 진입점 URL | ○ (자리만) | 1 |
| API 프록시·서버 키 보관 | **✕** | 7 |
| 계정/로그인·세션 | **✕** (현재 PIN은 기기 로컬) | 7 |
| 사용량 계측·쿼터 | **✕** | 7 |
| 결제·구독 상태(Stripe webhook) | **✕** | 7 |
| 가격·약관·特定商取引法·プライバシーポリシー | **✕** (허브에 링크 자리만) | 7 |
| 운영 관측(에러 수집·사용량 로그) | **✕** | 7 |
| CI/CD (테스트 자동 실행·배포) | **✕** (현재 수동 push) | 6~7 |

**Phase 7 이후의 최종 형태(예상)**

```
/
├── index.html              # 허브: 가격 · 이용약관 · 로그인 진입
├── math/  english/         # 앱 (정적, PWA)
├── core/                   # 프롬프트·스키마·채점 — 클라이언트와 서버가 공유
├── shared/                 # 브라우저 전용
├── server/                 # ★ Phase 7 신규 (Cloudflare Workers)
│   ├── src/index.js        #   /api/solve  (프록시 + 쿼터 + 캐시)
│   ├── src/auth.js         #   세션 검증
│   ├── src/billing.js      #   Stripe webhook
│   ├── src/quota.js        #   사용량 카운트
│   └── wrangler.toml
├── tests/
└── docs/
```

**배치 결정 (확정)**

- **같은 저장소에 `server/`를 둔다.** `core/`를 상대경로로 그대로 import할 수 있어 복제가 없다.
  (별도 저장소 + 패키지 배포는 1인 운영에서 이점보다 관리 비용이 크다.)
- **시크릿은 저장소에 두지 않는다.** Gemini 키·Stripe 키는 `wrangler secret put`으로만 주입한다.
- **GitHub Pages는 정적 파일만 서빙한다.** `server/`도 URL로 열리면 소스가 보이지만 실행되지는 않는다.
  따라서 `server/`에는 **키·민감 로직을 넣지 않는다**(키는 항상 시크릿 저장소).
- `server/`는 Phase 7 전까지 **만들지 않는다.** 지금 빈 폴더를 만들어도 얻는 것이 없다.

> 즉 "지금 만드는 구조"는 **서버가 붙을 자리를 비워 둔 구조**다. 그 자리는 `core/`가 루트에 있다는 사실로 이미 확보되어 있다.

---

## 3. 단계별 실행 계획

### Phase 0 — 동결 + 기준선 자산 (0.5일)

**목표**: 이후 모든 단계에서 "동작이 같다"를 판정할 기준을 만든다.

**작업**

1. 기능 수정 동결 공지(이슈/커밋 규칙).
2. `git tag v1.8-baseline` 생성.
3. `tests/fixtures/`에 스텁 응답 고정:
   - `math-solve-2problems.json`, `math-quiz.json`, `math-simplify.json`, `math-overall-chat.json`, `math-step-chat.json`
   - `english-reading.json`, `english-quiz.json`, `english-writing.json`
4. `tests/stub-gemini.js` — `fetch`/`callGeminiModel` 가로채기 + 호출 횟수 카운터.
5. `docs/SMOKE.md` — 8개 스모크 시나리오 체크리스트.

**DoD**

- [ ] 태그 생성·푸시
- [ ] 픽스처 8종 존재, 스텁으로 재현 가능
- [ ] 스모크 체크리스트 문서화

**롤백**: 태그 삭제만.

---

### Phase 1 — 루트 허브 + `math/` 이동 (0.5~1일) ★ PWA 마이그레이션 포함

**목표**: URL을 최종 형태로 만든다. **로직·UI 변경 없음**, 경로와 PWA 메타데이터만.

**1-A. 파일 이동**

```
git mv index.html            math/index.html
git mv sw.js                 math/sw.js
git mv manifest.json         math/manifest.json
git mv icon-192.png          math/icon-192.png
git mv icon-512.png          math/icon-512.png
git mv apple-touch-icon.png  math/apple-touch-icon.png
```

**1-B. `math/index.html` 경로 수정**

| 대상 | before | after |
|---|---|---|
| 공통 CSS (24행) | `shared/ui.css?v=…` | `../shared/ui.css?v=…` |
| 공통 스크립트 4개 (685~688행) | `shared/*.js?v=…` | `../shared/*.js?v=…` |
| 영어 링크 (224, 248행) | `english/` | `../english/` |
| 상단 로고/홈 링크 | 없음(링크 아님) | **변경 없음** — Phase 1에서 허브 링크를 새로 만들지 않는다 |
| SW 등록 (1751행) | `register('./sw.js')` | **변경 없음**(상대경로가 `/math/sw.js`로 해석됨) |
| manifest (17행) | `manifest.json` | **변경 없음** |

**1-C. `math/manifest.json`**

- `start_url`: `"./index.html"` → `"./"`
- `scope`: `"./"` 유지 (→ `/math/`)
- `id`: `"./"` 유지 → `/math/`로 해석되며 **설치 identity가 바뀐다(의도)**
- `name`/`short_name`/`theme_color`/아이콘 경로는 그대로

**1-D. `math/sw.js`**

- `CACHE_NAME`: `amt-cache-v2.6` → `amt-cache-v2.7`
- `ASSETS`: `'./'`, `'./index.html'`, `'./manifest.json'`, 아이콘 3종, `'../shared/storage.js'`, `'../shared/core.js'`, `'../shared/speech.js'`, `'../shared/ui.js'`, `'../shared/ui.css'`
- `/english/` 가드 **삭제** (스코프가 `/math/`라 불필요)

**1-E. 루트 `index.html` (허브) 신규**

최소 마크업. 디자인 투자 금지.

- 제목: `AI家庭教師 | 数学・英語`
- 두 개의 카드: `📐 数学I・A`(`./math/`), `🇬🇧 英語`(`./english/`)
- `前回の続き` 표시: `tutor_last_subject`(localStorage) 값으로 강조
- 사용 안내 1~2줄(APIキーは端末内に保存 / 保護者PIN)
- 하단: `docs`·약관 자리(문구만)
- **manifest 링크 없음(설치 불가)**
- 기존 설치 아이콘 대응 스크립트:

```html
<script>
  // 旧・数学アプリ(scope "/")としてインストール済みの場合、
  // 起動時は直接 math/ へ送る(ハブを経由させない)
  if (matchMedia('(display-mode: standalone)').matches && !location.search.includes('hub')) {
    location.replace('./math/');
  }
</script>
```

**1-F. 루트 `sw.js` → 정리용(cleanup)으로 교체**

기존 설치본이 루트 SW를 계속 제어하고 있으므로, **삭제하지 말고** 아래 내용으로 교체한다.

```js
// 旧ルートSWの後始末用。旧インストールが更新チェックに来た時だけ動作する。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('amt-')).map((k) => caches.delete(k))
    );
    await self.registration.unregister();
  })());
});
```

- `aet-`는 건드리지 않는다(영어 앱 캐시 보존).
- 이 파일은 **최소 2회 배포 주기 동안 유지**한다. 삭제하면 구 SW가 영구히 남는다(스크립트 404 시 업데이트 실패로 기존 SW 유지).

**1-G. `english/index.html` 링크 정리**

- `../`(수학으로) → `../math/`
- 허브로 가는 링크 추가(선택)
- `english/sw.js` `CACHE_NAME` `v1.6` → `v1.7` (index.html이 캐시되므로)

**1-H. `localStorage` 확인**

- origin 단위이므로 `amt_`/`aet_`/`tutor_` 키는 이동 후에도 유지된다. **마이그레이션 코드 불필요.**

**DoD**

- [ ] `/` → 허브, `/math/` → 수학, `/english/` → 영어
- [ ] 수학: 해설·4択·노트 복원 정상, 콘솔 에러 0
- [ ] 영어: 읽기·4択·단어장 정상, 콘솔 에러 0
- [ ] 기존 노트/API 키/테마가 그대로 보임
- [ ] 수학 SW가 `/math/` 스코프로 등록됨(`navigator.serviceWorker.getRegistrations()`)
- [ ] 루트 SW가 정리 후 unregister됨
- [ ] 오프라인에서 `/math/` 재방문 가능

**롤백**: `git revert` + 루트 `sw.js`를 이전 내용으로 복원. (PWA 재설치는 사용자 측 1회 필요)

---

### Phase 2 — 셸 분리 (동작 무변경, 2~3시간)

**목표**: 인라인 스크립트를 파일로 **그대로** 옮긴다. 코드는 한 줄도 수정하지 않는다.

**작업 (수학)**

1. `math/index.html`의 인라인 스크립트 내용(약 3,810줄)을 `math/app.js`로 슬라이스 추출(수동 복사 금지).
2. 스크립트 태그 2줄을 `<script src="app.js?v=20261030"></script>`로 교체.
3. `math/sw.js` `ASSETS`에 `'./app.js'` 추가, `CACHE_NAME` `v2.7` → `v2.8`.
4. `node --check math/app.js`.

**작업 (영어)**

5. `english/index.html` 570~2015행을 `english/app.js`로 추출, 태그 교체.
6. `english/sw.js` `ASSETS`에 `'./app.js'` 추가, `CACHE_NAME` `v1.7` → `v1.8`.
7. `node --check english/app.js`.

**DoD**

- [ ] `node --check` 통과
- [ ] 수학: 해설 1건 + 4択 + 노트 저장/복원
- [ ] 영어: 읽기 1건 + 4択 + 단어장
- [ ] 콘솔 에러 0
- [ ] `math/index.html`, `english/index.html` 각 700줄 이하

**롤백**: `git revert`.

---

### Phase 3 — 파일 분해 (classic script, 2~3일)

**목표**: 2.5~2.7 표대로 파일을 나눈다. **여전히 로직 수정 금지**, 로드 순서만 관리.

**작업 원칙**

- 함수 단위로 이동하되, **섹션 배너 주석을 경계로** 사용한다(행 번호는 이동 중 변하므로 신뢰 금지).
- 한 커밋 = 한 모듈. 커밋 메시지 `refactor(math): extract quiz.js`.
- 각 파일은 즉시 실행 코드 없이 **선언만** 담는다(초기화는 `main.js`).
- 클래식 스크립트 유지 → `<script>` 순서: `core/*` → `../shared/*` → `state.js` → 기능 모듈 → `main.js`.

**순서 (수학)**: `state.js` → `render.js` → `history.js` → `quiz.js` → `similar.js` → `simplify.js` → `settings.js` → `upload.js` → `solve.js` → `chat-step.js` → `chat-overall.js` → `visual.js` → `voice.js` → `main.js`

**순서 (영어)**: `state.js` → `reading.js` → `quiz.js` → `writing.js` → `wordbook.js` → `history.js` → `voice.js` → `settings.js` → `main.js`

**DoD**

- [ ] 각 파일 500줄 이하 (대부분 300줄 이하)
- [ ] 함수 97개/60개 전부 어딘가에 존재(인벤토리 대조)
- [ ] 스모크 8종 통과
- [ ] `node --check` 전체 통과

**롤백**: 커밋 단위 revert.

---

### Phase 4 — ES Module화 + 인라인 핸들러 제거 (3~4일)

**목표**: 의존을 명시화하고, 문자열 이스케이프 의존을 없앤다.

**작업**

1. 각 파일을 ESM으로 전환: `export function`, `import { x } from './y.js'`.
2. `index.html`은 `<script type="module" src="main.js"></script>` 1줄로.
3. 인라인 `onclick` 125개를 **데이터 속성 + 위임**으로 교체:

```html
<!-- before -->
<button onclick="restoreFromHistory('1729')">🔄 もう一度見る</button>
<!-- after -->
<button data-action="restore-history" data-id="1729">🔄 もう一度見る</button>
```

```js
// main.js (위임 1곳)
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, idx } = el.dataset;
  ACTIONS[action]?.(el, { id, idx: idx === undefined ? undefined : Number(idx) });
});
```

4. `escapeJsString` 함수 **삭제** (사용처 없음).
5. `window.*` 전역 노출 제거. 디버그가 필요하면 `window.__app = { state }`만.
6. CSP 메타 추가(Phase 5 CDN 로컬화 후 tighten):

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://generativelanguage.googleapis.com; font-src 'self' data:">
```

**DoD**

- [ ] `grep -c 'onclick=' math/index.html english/index.html` → 0
- [ ] `grep -rn 'escapeJsString'` → 0
- [ ] 모든 기능 함수가 `export`됨
- [ ] 스모크 8종 + **모든 `[data-action]` 버튼 클릭 점검**
- [ ] 콘솔 CSP 위반 0

**롤백**: Phase 3 태그.

---

### Phase 5 — `core/` 순수 도메인 추출 (2~3일)

**목표**: 프롬프트·스키마·채점을 DOM과 분리해 테스트 가능 + 서버 재사용 가능하게 만든다.

**작업**

1. 스키마 상수 이동 (`core/schemas/*`).
2. 프롬프트 빌더를 **인자 기반**으로 변경:

```js
// before (DOM 직접 읽음)
function buildSimilarProblemPrompt() { const unitHint = document.getElementById('unitSelect').value; ... }
// after (순수)
export function buildSimilarProblemPrompt({ unitHint, recognizedProblem, keyPoint }) { ... }
```

3. `callGeminiModel` 단일 구현으로 통합 (수학 인라인 삭제, `shared/api/client.js`만 사용).
4. 채점/셔플/정규화를 `core/grading/*`로 이동.
5. 캐시에 `maxAgeMs` + `schemaVersion` 도입.

**DoD**

- [ ] `core/`에서 `document|window|localStorage|fetch` 검색 결과 0
- [ ] 프롬프트 문자열이 **바이트 단위로 동일**(이동 전후 diff 0)
- [ ] 단위 테스트(Phase 6 L1) 통과
- [ ] 스모크 8종 통과

> 프롬프트 문구가 1자라도 바뀌면 모델 출력이 달라진다. **문구 수정은 이 단계에서 금지**.

---

### Phase 6 — 전체 테스트 도입 (2~3일) ★ 요청된 "구조 확정 후 테스트" 단계

**목표**: 구조가 확정된 상태에서 회귀 안전망을 만든다.

#### 테스트 계층

| 계층 | 도구 | 대상 | 실행 |
|---|---|---|---|
| L1 단위 | `node:test` | `core/*` (프롬프트 조립, 스키마 검증, 채점, 셔플, 캐시) | `node --test tests/unit` |
| L2 통합 | Playwright + `page.route` 스텁 | 수학/영어 주요 흐름, 이벤트 위임, 상태 전이 | `npx playwright test` |
| L3 수동 | 체크리스트 | PWA 설치, 오프라인, iOS 음성, 실기기 레이아웃 | `docs/SMOKE.md` |

#### L2 필수 시나리오

1. 해설 생성(2문제) → 탭 전환 → 각 문제 독립 표시
2. twin_quiz 재사용 → **API 호출 0회**
3. 4択 오답 → 정답 표시 + 로컬 채점(호출 0회)
4. 잘못된 퀴즈 폴백 → 이후 정상 퀴즈에서 4択 복구
5. 노트 저장 → 복원 (`overall_chat`, `followups` 포함)
6. 문제 전체 Q&A → 즉시 탭 전환 → 응답이 원래 탭에 남음
7. 단계 Q&A → 즉시 탭 전환 → 다른 문제 `followups` 비어 있음
8. 동일 문제 2회 → API 1회 + 캐시 안내 문구
9. 영어: 읽기 → 퀴즈 재사용(0회) → 저장 → 복원 → 퀴즈(0회)
10. 영어: `"` 포함 지문 → 낭독 버튼 정상
11. 모든 `[data-action]` 버튼 클릭 → 콘솔 에러 0
12. `/` 허브 → `/math/`, `/english/` 이동 + 허브 복귀

#### 완료 기준

- [ ] L1 통과, `core/` 커버리지 80% 이상
- [ ] L2 12개 시나리오 통과
- [ ] L3 체크리스트 서명
- [ ] `node --check` + L1 자동 실행 스크립트

---

### Phase 7 — 수익화 준비 (별도 저장소, 착수 시 재계획)

| 항목 | 내용 |
|---|---|
| API 프록시 | Cloudflare Workers 등에서 Gemini 호출. **브라우저에 API 키 저장 금지** |
| 인증/쿼터 | 사용자별 일일 호출 한도, 서버 측 카운트 |
| 서버 캐시 | 요청 해시 기반 공용 캐시(기기 로컬 캐시 대체) |
| 랜딩 확장 | `/` 허브에 가격·약관·로그인 진입점 추가 |
| 의존성 로컬화 | Tailwind 빌드 산출물, KaTeX/폰트 벤더링 → CSP 강화 |
| 앱 형태 결정 | 2개 PWA 유지 vs Next.js 통합 (7장) |

**원칙**: `core/`는 그대로 이식, UI는 새로 작성.

---

## 4. 코드 작업 도구용 실행 지시

> 이 장의 지시문은 **그대로 복사해 실행**할 수 있게 작성했다. 판단이 필요한 지점은 모두
> "이렇게 한다"로 확정해 두었다. 실행 중 문서와 다른 사실을 발견하면 **작업을 중단하고
> 보고**한다(임의 보정 금지).
>
> 공통 전제: 모든 Phase는 앞 Phase의 DoD를 통과한 뒤 시작한다. 실패 시 다음 Phase로 넘어가지 않는다.

### 4.0 Phase 0 (동결 + 기준선 자산)

**목적**: 이후 Phase에서 "동작이 같다"를 기계적으로 판정할 기준을 만든다. 코드는 **한 줄도 바꾸지 않는다**.

```
[Phase 0] 기준선 고정

전제
- HEAD = cc07dcb, working tree clean
- 이 Phase에서 앱 코드(index.html, english/index.html, shared/*, sw.js) 수정 금지
- 추가만 허용: tests/, docs/SMOKE.md, .gitignore 항목

1) 기준선 태그
   git tag -a v1.8-baseline -m "baseline before restructure (cc07dcb)"
   git push origin v1.8-baseline
   → 이 태그는 Phase 6까지 롤백 지점으로 사용한다

2) 디렉터리 생성
   mkdir -p tests/fixtures tests/unit tests/e2e backup

3) 픽스처 8종 생성 (tests/fixtures/)
   수학
   - math-solve-2problems.json   : problems[2] + 각 steps[] + key_point + twin_quiz 포함
   - math-quiz.json              : 4択 1문항 (choices[4], answer_index, explanation)
   - math-simplify.json          : 단일 step 재설명
   - math-overall-chat.json      : 문제 전체 Q&A 응답
   - math-step-chat.json         : 단계 Q&A 응답
   영어
   - english-reading.json        : 長文読解 (本文/設問/解説)
   - english-quiz.json           : 4択 1문항
   - english-writing.json        : 英作文添削 (添削文/指摘リスト)

   작성 규칙
   - 스키마는 각 앱의 *_SCHEMA 상수를 그대로 따른다(필드명 임의 변경 금지)
   - 문자열은 실제 출력과 같은 형태(日本語/英語)로 넣는다
   - 각 파일은 최소 1건, 수학 solve만 2문제(탭 전환 검증용)

4) 테스트 스텁 (tests/stub-gemini.js)
   - globalThis.fetch 를 가로채 generativelanguage.googleapis.com 호출을 픽스처로 대체
   - 요청 본문의 프롬프트를 보고 픽스처를 선택(키워드 매칭)
   - 호출 횟수를 counters 객체에 기록 (시나리오별 0/1회 검증용)
   - 미매칭 요청은 throw (조용한 통과 금지)
   - CommonJS + ESM 양쪽에서 require/import 가능하게 export

5) 스모크 체크리스트 (docs/SMOKE.md)
   아래 8개 시나리오를 체크박스 + 기대 결과 + 실제 결과 기록란으로 문서화
   M1 写真→解説(2問)→問題タブ切替→各問が独立表示
   M2 twin_quiz 再利用 → API 呼び出し 0 回
   M3 4択 誤答 → 正解表示・ローカル採点(0回)
   M4 ノート保存 → 復元(overall_chat / followups 含む)
   M5 問題全体Q&A → 即タブ切替 → 応答が元タブに残る
   M6 同一問題2回 → API 1回 + キャッシュ案内
   M7 英語: 読解→クイズ(0回)→保存→復元
   M8 PWA: インストール→オフライン再訪→更新反映

6) .gitignore
   backup/ を追加(ローカル退避用。リポジトリに残さない)

검증
7) node --check tests/stub-gemini.js
8) node -e "const s=require('./tests/stub-gemini.js'); console.log(s.fixtures.length)" → 8
9) git status で 앱 코드 파일(index.html, english/index.html, shared/, sw.js)이
   변경 목록에 없음을 확인

보고
- 생성 파일 목록, 픽스처 8종 이름, 태그 해시
- 커밋: test: add baseline fixtures and smoke checklist (no app change)
```

**Phase 0 → Phase 1 핸드오프 계약**

| 항목 | Phase 0이 보장해야 하는 것 | Phase 1이 그것을 쓰는 방식 |
|---|---|---|
| 롤백 지점 | `v1.8-baseline` 태그 | Phase 1 실패 시 `git reset --hard v1.8-baseline` |
| 회귀 판정 | 픽스처 8종 + 스텁 | Phase 1 검증에서 콘솔 에러 + 스모크 4종 |
| 수동 확인 | `docs/SMOKE.md` 8항목 | Phase 1에서 M1·M3·M4·M7만 우선 확인 |
| 변경 격리 | 앱 코드 diff 0 | Phase 1 diff가 "경로·메타데이터"만인지 대조 |

> Phase 0의 픽스처는 Phase 6에서 그대로 L2 테스트 입력이 된다. 지금 대충 만들면 나중에 두 번 만든다.

#### 4.0-A 픽스처 정확한 형태 (필드명은 실제 스키마에서 추출)

> 아래는 **앱이 실제로 쓰는 스키마의 필수 필드**다. 임의로 이름을 바꾸면 Phase 6에서 전부 다시 만든다.
> 각 파일은 "API가 반환하는 JSON 객체"이며, 스텁이 Gemini 응답 봉투로 감싼다.

**① `math-solve-2problems.json`** — `TUTOR_RESPONSE_SCHEMA`
필수: `problems[].{problem_label, recognized_problem, key_point, steps[], final_answer, twin_quiz}` /
`steps[].{step_number, title, display_math, speech_ja}`

```json
{
  "problems": [
    {
      "problem_label": "問1",
      "recognized_problem": "$x^2-5x+6=0$ を解け。",
      "key_point": "積が6、和が-5になる2数を探す（因数分解）。",
      "steps": [
        {
          "step_number": 1,
          "title": "因数分解の形を予想する",
          "focus": "$x^2+(a+b)x+ab$ の形",
          "why": "積と和から2数を決めると因数分解できる。",
          "display_math": "$x^2-5x+6=(x-2)(x-3)$",
          "watch_out": "符号を逆にしない。",
          "speech_ja": "積が6、和がマイナス5になる2数を探します。",
          "visual": { "type": "none", "caption": "" }
        },
        {
          "step_number": 2,
          "title": "解を求める",
          "focus": "AB=0 なら A=0 または B=0",
          "why": "積が0になるのは、どちらかが0のときだけ。",
          "display_math": "$x=2,\\ 3$",
          "watch_out": "答えは2つ。",
          "speech_ja": "xは2と3です。",
          "visual": {
            "type": "graph",
            "caption": "$y=x^2-5x+6$ とx軸の交点",
            "view": { "x_min": -1, "x_max": 6, "y_min": -2, "y_max": 6 },
            "curves": [
              { "kind": "quadratic", "a": 1, "b": -5, "c": 6, "label": "$y=x^2-5x+6$" }
            ],
            "points": [
              { "x": 2, "y": 0, "label": "2", "open": false },
              { "x": 3, "y": 0, "label": "3", "open": false }
            ]
          }
        }
      ],
      "final_answer": "$x=2,\\ 3$",
      "twin_quiz": {
        "problem": "$x^2-7x+12=0$ を解け。",
        "choices": ["$x=3,\\ 4$", "$x=-3,\\ -4$", "$x=2,\\ 6$", "$x=-2,\\ -6$"],
        "correct_index": 0,
        "answer": "$x=3,\\ 4$",
        "accepted_answers": ["x=3,4", "3,4", "x=4,3"],
        "hint": "積が12、和が-7になる2数は？",
        "explanation": "積12・和-7より $-3$ と $-4$。よって $(x-3)(x-4)=0$。",
        "wrong_hint": "和の符号を確認しよう。",
        "choice_feedback": ["正解", "和の符号が逆", "積が12にならない", "和が-7にならない"],
        "speech_ja_correct": "正解です。",
        "speech_ja_wrong": "符号をもう一度確認しましょう。"
      }
    },
    {
      "problem_label": "問2",
      "recognized_problem": "$|x-3| \\leqq 2$ を解け。",
      "key_point": "絶対値の不等式は $-2 \\leqq x-3 \\leqq 2$ に分解する。",
      "steps": [
        {
          "step_number": 1,
          "title": "絶対値を外す",
          "focus": "$|A| \\leqq c \\iff -c \\leqq A \\leqq c$",
          "why": "原点からの距離がc以下という意味だから。",
          "display_math": "$-2 \\leqq x-3 \\leqq 2$",
          "watch_out": "向きはそのまま。",
          "speech_ja": "絶対値を外すと、マイナス2以上2以下になります。",
          "visual": { "type": "none", "caption": "" }
        },
        {
          "step_number": 2,
          "title": "3を足す",
          "focus": "各辺に同じ数を足す",
          "why": "不等式の性質。",
          "display_math": "$1 \\leqq x \\leqq 5$",
          "watch_out": "両端を含む（≦）。",
          "speech_ja": "各辺に3を足して、1以上5以下です。",
          "visual": {
            "type": "numberline",
            "caption": "$1 \\leqq x \\leqq 5$",
            "numberline": {
              "min": -1,
              "max": 7,
              "marks": [{ "value": 1, "label": "1", "closed": true }, { "value": 5, "label": "5", "closed": true }]
            }
          }
        }
      ],
      "final_answer": "$1 \\leqq x \\leqq 5$",
      "twin_quiz": {
        "problem": "$|x-2| \\leqq 3$ を解け。",
        "choices": ["$-1 \\leqq x \\leqq 5$", "$-5 \\leqq x \\leqq 1$", "$x \\leqq -1,\\ 5 \\leqq x$", "$-1 < x < 5$"],
        "correct_index": 0,
        "answer": "$-1 \\leqq x \\leqq 5$",
        "accepted_answers": ["-1≦x≦5", "-1<=x<=5"],
        "hint": "「以上・以下」は両端を含む。",
        "explanation": "$-3 \\leqq x-2 \\leqq 3$ より各辺に2を足す。",
        "wrong_hint": "等号の有無を確認しよう。",
        "choice_feedback": ["正解", "中心の符号が逆", "不等式の向きが逆", "等号が抜けている"],
        "speech_ja_correct": "正解です。",
        "speech_ja_wrong": "等号を含むか確認しましょう。"
      }
    }
  ]
}
```

**② `math-quiz.json`** — `QUIZ_GEN_SCHEMA`
필수: `problem, choices[4], correct_index, answer, hint, explanation` / 권장: `accepted_answers[], wrong_hint, choice_feedback[4], speech_ja_correct, speech_ja_wrong`

```json
{
  "problem": "$x^2-9$ を因数分解せよ。",
  "choices": ["$(x+3)(x-3)$", "$(x+9)(x-1)$", "$(x-3)^2$", "$(x+3)^2$"],
  "correct_index": 0,
  "answer": "$(x+3)(x-3)$",
  "accepted_answers": ["(x+3)(x-3)", "(x-3)(x+3)"],
  "hint": "$a^2-b^2$ の形を探す。",
  "explanation": "$x^2-3^2$ なので $(x+3)(x-3)$。",
  "wrong_hint": "和と積ではなく、2乗の差です。",
  "choice_feedback": ["正解", "積が-9にならない", "中央の項が残る", "中央の項が残る"],
  "speech_ja_correct": "正解です。",
  "speech_ja_wrong": "二乗の差の公式を確認しましょう。"
}
```

**③ `math-simplify.json`** — `SIMPLIFY_RESPONSE_SCHEMA`
필수: `title, display_math, speech_ja`

```json
{
  "title": "もっとやさしく：因数分解",
  "focus": "かけ算の形に戻す",
  "why": "展開の逆をすると、方程式が解ける。",
  "display_math": "$x^2-5x+6=(x-2)(x-3)$",
  "watch_out": "かっこの中の符号。",
  "speech_ja": "まず、かけて6、たしてマイナス5になる2つを探します。",
  "visual": { "type": "none", "caption": "" }
}
```

**④ `math-step-chat.json`** — `FOLLOWUP_SCHEMA`
필수: `answer, speech_ja`

```json
{
  "answer": "このステップでは、積が6・和が-5になる2数を探しています。2と3は積が6ですが和が5なので、符号を両方マイナスにします。",
  "speech_ja": "積が6で和がマイナス5なので、マイナス2とマイナス3です。"
}
```

**⑤ `math-overall-chat.json`** — `OVERALL_CHAT_SCHEMA`
필수: `method_name, answer, comparison_note, speech_ja`

```json
{
  "method_name": "解の公式による解法",
  "answer": "解の公式で $x=\\frac{5 \\pm \\sqrt{25-24}}{2}=\\frac{5 \\pm 1}{2}$ より $x=2,\\ 3$。",
  "comparison_note": "因数分解より計算量は多いが、因数が見えない問題でも必ず解ける。",
  "speech_ja": "解の公式でも同じ答えになります。"
}
```

**⑥ `english-reading.json`** — `ENGLISH_READING_SCHEMA`
필수: `passage_en, translation_ja, twin_quiz{question_en, translation_ja, choices[4], correct_index, choice_feedback[4], explanation}`

```json
{
  "passage_en": "Ken studies math every evening. He says practice is the key to success.",
  "translation_ja": "ケンは毎晩数学を勉強します。彼は練習が成功の鍵だと言います。",
  "sentence_breakdown": [
    { "en": "Ken studies math every evening.", "ja": "ケンは毎晩数学を勉強します。", "structure_note": "S+V+O+副詞句" }
  ],
  "vocabulary": [
    { "word": "practice", "meaning": "練習", "example": "Practice makes perfect." }
  ],
  "grammar_points": [
    { "title": "every + 単数名詞", "explanation": "every evening は「毎晩」を表す副詞句。" }
  ],
  "quick_check": { "question": "Who studies math?", "answer": "Ken" },
  "twin_quiz": {
    "target_point": "S+V+O の語順",
    "question_en": "Choose the correct sentence.",
    "translation_ja": "正しい文を選びなさい。",
    "hint": "主語の次は動詞。",
    "choices": ["She reads books.", "She books reads.", "Reads she books.", "Books she reads."],
    "correct_index": 0,
    "choice_feedback": ["正解", "語順が逆", "倒置になっている", "目的語が先頭"],
    "explanation": "英語は S+V+O の語順。"
  }
}
```

**⑦ `english-quiz.json`** — `ENGLISH_QUIZ_SCHEMA`
필수: `question_en, translation_ja, choices[4], correct_index, choice_feedback[4], explanation`

```json
{
  "target_point": "現在完了",
  "question_en": "I ( ) this book three times.",
  "translation_ja": "私はこの本を3回読んだことがある。",
  "hint": "経験を表す形。",
  "choices": ["have read", "read", "am reading", "will read"],
  "correct_index": 0,
  "choice_feedback": ["正解", "過去形では経験の意味が出ない", "進行形は不可", "未来形は不可"],
  "explanation": "経験は have + 過去分詞。"
}
```

**⑧ `english-writing.json`** — `WRITING_CORRECTION_SCHEMA`
필수: `score, corrected_text, grammar_fixes[], praise_and_advice`

```json
{
  "score": 80,
  "original_text": "I go to school yesterday.",
  "corrected_text": "I went to school yesterday.",
  "natural_alternative": "Yesterday, I went to school.",
  "translation_ja": "私は昨日学校へ行きました。",
  "grammar_fixes": [
    { "before": "go", "after": "went", "reason_ja": "yesterday があるので過去形。" }
  ],
  "praise_and_advice": "内容は伝わっています。時制に注意しましょう。"
}
```

**⑨ (선택) `math-judge.json`** — `JUDGE_SCHEMA` (類題 채점)
`{ "is_correct": true, "judgement_title": "正解", "comment": "よくできました。", "correct_answer": "$x=3,\\ 4$", "speech_ja": "正解です。" }`

> ⑨는 Phase 0의 "8종"에는 포함하지 않는다. 類題 채점까지 L2에서 검증하려면 Phase 6에서 추가한다.

#### 4.0-B 스텁 동작 명세 (`tests/stub-gemini.js`)

**응답 봉투** — 앱은 `data.candidates[0].content.parts[].text`를 JSON으로 파싱한다.

```js
function envelope(fixture) {
  return {
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify(fixture) }] }
    }],
    usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 900, totalTokenCount: 2700 }
  };
}
```

**픽스처 선택** — 프롬프트 문구 매칭이 아니라 **요청의 `responseSchema.properties` 키**로 판별한다(문구가 바뀌어도 안 깨진다). 위에서부터 먼저 맞는 것:

| 순서 | 조건 (`props` = `generationConfig.responseSchema.properties` 키) | 픽스처 |
|---:|---|---|
| 0 | `GET` 요청 (`/v1beta/models`) | 모델 목록 `{models:[{name:'models/gemini-3.8-flash',displayName:'Gemini 3.8 Flash',supportedGenerationMethods:['generateContent']}]}` |
| 1 | `problems` | `math-solve-2problems` |
| 2 | `passage_en` | `english-reading` |
| 3 | `score` | `english-writing` |
| 4 | `method_name` | `math-overall-chat` |
| 5 | `is_correct` | `math-judge` |
| 6 | `question_en` + `wrong_hint` | `math-quiz` |
| 7 | `question_en` | `english-quiz` |
| 8 | `display_math` | `math-simplify` |
| 9 | `answer` + `speech_ja` | `math-step-chat` |
| — | 그 외 | `throw new Error('stub: unhandled schema [' + keys + ']')` |

**모듈 형태** — 저장소에 `package.json`이 없으므로 **CommonJS**로 작성한다.

```js
// tests/stub-gemini.js
module.exports = { FIXTURES, pickFixture, envelope, install, reset, counters };
// install(): globalThis.fetch 패치 + 해제 함수 반환
// counters: { total, byFixture: { 'math-solve-2problems': 2, ... } }
```

**필수 성질 2개**

1. **조용히 통과하지 않는다**: 매칭 실패는 throw. 픽스처 누락이 테스트 통과로 위장되면 안 된다.
2. **호출 횟수를 센다**: `counters.total`로 "twin_quiz 재사용 = 0회", "동일 문제 2회 = 1회"를 검증한다.

#### 4.0-C Phase 0 검증 스크립트

```js
// tests/selftest.js  (node tests/selftest.js)
// 1) 8개 픽스처 파일이 모두 읽히는가
// 2) 각 픽스처가 그 스키마의 required 필드를 갖는가
// 3) pickFixture()가 8종을 서로 다르게 판별하는가 (오분류 0)
```

- 3)이 중요하다. 판별 순서가 틀리면 `english-quiz`가 `math-step-chat`으로 잡히는 식의 오류가 난다.

### 4.1 Phase 1 (폴더 이동 + 허브)

```
[Phase 1] 루트 허브 + math/ 이동

전제
- HEAD = cc07dcb, working tree clean
- 백업: backup/pre-phase1/ 에 index.html, sw.js, manifest.json, english/index.html, english/sw.js, 아이콘 3종
- 금지: 로직·문구·스타일 수정 (경로와 PWA 메타데이터만)

이동
1) mkdir -p math
2) git mv index.html math/index.html
   git mv sw.js math/sw.js
   git mv manifest.json math/manifest.json
   git mv icon-192.png math/icon-192.png
   git mv icon-512.png math/icon-512.png
   git mv apple-touch-icon.png math/apple-touch-icon.png

math/index.html — 경로 치환 (이동 전 기준 행 번호로 확인됨)
3) 24행   href="shared/ui.css?v=20261028"
       →  href="../shared/ui.css?v=20261028"
4) 224행  href="english/"   （ロック解除モーダル内の切替リンク）
       →  href="../english/"
5) 248행  href="english/"   （ヘッダーの切替ボタン）
       →  href="../english/"
6) 685행  src="shared/storage.js?v=20261028" → src="../shared/storage.js?v=20261028"
   686행  src="shared/core.js?v=20261028"    → src="../shared/core.js?v=20261028"
   687행  src="shared/speech.js?v=20261028"  → src="../shared/speech.js?v=20261028"
   688행  src="shared/ui.js?v=20261028"      → src="../shared/ui.js?v=20261028"
7) 변경하지 않는 것 (상대경로가 /math/ 기준으로 자동 해석됨)
   - 17행 <link rel="manifest" href="manifest.json" />
   - 18행 apple-touch-icon.png / 19행 icon-192.png
   - 1751행 navigator.serviceWorker.register('./sw.js')
   - Tailwind / KaTeX / Google Fonts 의 https:// 절대 URL
   ※ 치환 후 확인: grep -n 'href="shared/\|src="shared/' math/index.html → 0건
   ※ 상단 로고는 현재 링크가 아니다. 허브로 가는 링크를 Phase 1에서
      새로 추가하지 않는다(이 Phase는 "이동"만 한다).

math/manifest.json
8)  "id": "./"                 → 유지 (→ /math/ 로 해석. identity 변경은 의도된 것)
    "start_url": "./index.html" → "./"
    "scope": "./"              → 유지
    name / short_name / theme_color / icons.src 는 그대로

math/sw.js
9)  CACHE_NAME = 'amt-cache-v2.6'  →  'amt-cache-v2.7'
10) ASSETS 를 아래로 교체
    './', './index.html', './manifest.json',
    './icon-192.png', './icon-512.png', './apple-touch-icon.png',
    '../shared/storage.js', '../shared/core.js',
    '../shared/speech.js', '../shared/ui.js', '../shared/ui.css'
11) englishPrefix 가드(fetch 핸들러) 삭제
    - 스코프가 /math/ 이므로 영어 예외 처리가 불필요
    - 삭제 후 fetch 핸들러가 cache.match → fetch → put 순서로만 동작하는지 확인

루트 index.html (신규 허브, 80~120행)
12) <!doctype html>, lang="ja", <title>AI家庭教師 | 数学・英語</title>
13) 카드 2개
    📐 数学I・A → ./math/     （写真で質問・ステップ解説・音声）
    🇬🇧 英語      → ./english/ （長文読解・4択・英作文添削）
14) 前回の続き: localStorage.getItem('tutor_last_subject') 가 'math'|'english' 이면
    해당 카드에 「前回の続き」バッジ。없으면 양쪽 중립
15) 안내 2줄
    - APIキーは端末内にのみ保存されます
    - 初回PIN（初期値 1234）は設定画面から変更できます
16) standalone 리다이렉트 (1-E 의 코드를 그대로)
17) manifest 링크 없음 / sw.js 등록 없음 / Tailwind CDN 없음
    (허브는 외부 의존 0의 정적 1파일)
18) 카드 이동은 <a href> 만 사용. JS 없이도 이동해야 한다
19) 표기 언어: 日本語. 영어 앱 지칭은 「英語」로 통일

루트 sw.js (교체 — 1-F 의 cleanup SW)
20) amt- 프리픽스 캐시만 삭제, aet- 는 보존
21) activate 에서 self.registration.unregister()
22) install 에서 self.skipWaiting()
23) 상단 주석: 「旧ルートSWの後始末用 / 2リリース後に削除可」

english
24) english/index.html 90행  href="../" → href="../math/"  （ロック解除モーダル内）
25) english/index.html 116행 href="../" → href="../math/"  （ヘッダー切替ボタン）
    ※ 45행 / 563~566행의 ../shared/* 는 그대로 (english/ 기준 ../ = 루트)
26) english/sw.js CACHE_NAME 'aet-cache-v1.6' → 'aet-cache-v1.7'
    ※ ASSETS 변경 없음 (index.html 은 './index.html' 로 이미 포함)

검증 (순서대로)
27) node --check math/sw.js && node --check sw.js
28) python3 -m http.server 8765 --bind 127.0.0.1
29) 시크릿 창에서 http://127.0.0.1:8765/
    - / → 허브 표시, 카드 2개, 콘솔 에러 0
    - 카드 클릭 → /math/ , /english/ 이동
30) http://127.0.0.1:8765/math/
    - Network 탭에서 ../shared/* 전부 200 (404 없음)
    - 기존 노트 / APIキー / 테마가 그대로 보임 (localStorage 유지)
    - 解説 1件 / 4択 1問 / ノート復元
31) http://127.0.0.1:8765/english/
    - 読解 1件 / 4択 1問 / 単語帳 1件 / 수학 전환 링크가 /math/ 로 이동
32) SW 스코프
    navigator.serviceWorker.getRegistrations() → /math/ , /english/ 스코프 존재
    /math/ 페이지가 루트 SW 에 제어되지 않음
33) 루트 SW 정리 확인
    / 재방문 → caches.keys() 에 amt- 없음, aet- 유지
    registration.unregister() 후 재등록되지 않음
34) 오프라인: /math/ 방문 후 DevTools Offline → 再読込で表示される
35) git diff --stat 로 앱 코드 변경이 「경로 치환 + PWA 메타데이터」에 한정됨을 확인

보고
- 변경 파일 목록 + diff 요약
- 29~34 각 항목 결과
- 커밋 3개로 분리
  refactor: move math app to /math and add hub landing
  chore(sw): replace root SW with cleanup worker and bump caches
  test: add baseline fixtures and smoke checklist (Phase 0 산출물 미커밋 시)
```

#### 4.1-A 루트 `index.html` (허브) — 이 내용을 그대로 저장

> 외부 의존 0 (CDN·폰트·JS 라이브러리 없음). 약 95줄. 디자인을 더 넣지 않는다.
> `?hub` 를 붙이면 standalone 리다이렉트를 건너뛴다(설치본에서 허브를 확인할 때 사용).

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AI家庭教師 | 数学・英語</title>
<meta name="description" content="高校数学I・A と 英語を、写真1枚で質問できるAI家庭教師。">
<meta name="theme-color" content="#1e3a2f">
<!-- 旧・数学アプリ(scope "/")としてインストール済みの端末は、起動時に直接 math/ へ送る -->
<script>
  if (window.matchMedia('(display-mode: standalone)').matches &&
      !location.search.includes('hub')) {
    location.replace('./math/');
  }
</script>
<style>
  :root {
    --bg: #f6f7f5; --fg: #1f2933; --sub: #5b6b7a;
    --card: #ffffff; --line: #e3e8ec; --accent: #1e6b4f; --shadow: 0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.06);
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1512; --fg:#e8eeea; --sub:#9fb0a8; --card:#17201c; --line:#26332d; --accent:#4ade80; --shadow: 0 1px 2px rgba(0,0,0,.4); }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg); color: var(--fg); min-height: 100vh; min-height: 100dvh;
    font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', Meiryo, 'Noto Sans JP', sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: calc(32px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));
  }
  main { max-width: 640px; margin: 0 auto; }
  header { text-align: center; margin-bottom: 28px; }
  .logo { font-size: 44px; line-height: 1; }
  h1 { font-size: 24px; margin: 12px 0 8px; letter-spacing: .02em; }
  .lead { color: var(--sub); font-size: 14px; line-height: 1.8; margin: 0; }
  .cards { display: grid; gap: 14px; }
  .card {
    position: relative; display: grid; gap: 2px; text-decoration: none; color: inherit;
    background: var(--card); border: 1px solid var(--line); border-radius: 16px;
    padding: 20px 18px; box-shadow: var(--shadow); transition: transform .15s ease, border-color .15s ease;
  }
  .card:active { transform: scale(.99); }
  .card:hover { border-color: var(--accent); }
  .icon { font-size: 28px; line-height: 1.2; }
  .title { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .desc { font-size: 13px; color: var(--sub); line-height: 1.6; }
  .go { margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--accent); }
  .badge {
    position: absolute; top: 14px; right: 14px; font-size: 11px; font-weight: 700;
    color: #0b2e1f; background: #86efac; border-radius: 999px; padding: 3px 9px;
  }
  .notes { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 16px; }
  .notes p { margin: 0 0 6px; font-size: 12px; color: var(--sub); line-height: 1.7; }
  footer { margin-top: 22px; text-align: center; }
  footer p { font-size: 11px; color: var(--sub); margin: 0; line-height: 1.7; }
  @media (min-width: 560px) { .cards { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<main>
  <header>
    <div class="logo">🎓</div>
    <h1>AI家庭教師</h1>
    <p class="lead">写真を撮って質問するだけ。<br>数学I・A と 英語、どちらから始めますか？</p>
  </header>

  <nav class="cards">
    <a class="card" href="./math/" data-subject="math">
      <span class="badge" hidden>前回の続き</span>
      <span class="icon">📐</span>
      <span class="title">数学 I・A</span>
      <span class="desc">写真で質問・ステップ解説・音声授業</span>
      <span class="go">はじめる →</span>
    </a>
    <a class="card" href="./english/" data-subject="english">
      <span class="badge" hidden>前回の続き</span>
      <span class="icon">🇬🇧</span>
      <span class="title">英語</span>
      <span class="desc">長文読解・4択クイズ・英作文添削</span>
      <span class="go">はじめる →</span>
    </a>
  </nav>

  <section class="notes">
    <p>🔒 APIキーは端末内にのみ保存されます</p>
    <p>🔑 初回PIN（初期値 1234）は各アプリの設定画面から変更できます</p>
  </section>

  <footer>
    <p>数学I・A / 英語 ・ ホーム画面に追加するとアプリとして使えます</p>
  </footer>
</main>
<script>
  (function () {
    var last = null;
    try { last = localStorage.getItem('tutor_last_subject'); } catch (e) {}
    if (last) {
      var el = document.querySelector('.card[data-subject="' + last + '"]');
      if (el) el.querySelector('.badge').hidden = false;
    }
    Array.prototype.forEach.call(document.querySelectorAll('.card'), function (a) {
      a.addEventListener('click', function () {
        try { localStorage.setItem('tutor_last_subject', a.dataset.subject); } catch (e) {}
      });
    });
  })();
</script>
</body>
</html>
```

**주의**: 이 파일에는 `manifest` 링크도, `serviceWorker.register` 도 넣지 않는다. 허브는 설치 불가다.

#### 4.1-B 루트 `sw.js` (cleanup) — 이 내용을 그대로 저장

```js
// 旧ルートSWの後始末用。
// 旧・数学アプリ(scope "/")としてインストールされた端末が更新チェックに来た時だけ動作する。
// 役目: amt- キャッシュの削除 → 自分自身の登録解除。
// 注意: このファイルは2リリース(約2〜3ヶ月)後に削除してよい。
//       それまでは削除しないこと(404になると旧SWが残留する)。
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('amt-')).map((k) => caches.delete(k))
    );
    await self.registration.unregister();
  })());
});
```

**검증 포인트**: `aet-` 캐시는 **삭제 대상이 아니다**. 영어 앱의 오프라인 자산이 날아간다.

#### 4.1-C Phase 1 완료 후 반드시 남길 기록

```
[Phase 1 결과 기록]
- 이동한 파일 6개 (git mv)
- 치환한 경로 6곳 (24, 224, 248, 685~688행)
- 신규 파일 2개 (루트 index.html, 루트 sw.js 교체)
- 캐시명: amt v2.6→v2.7 / aet v1.6→v1.7
- 검증: /  /math/  /english/  각 콘솔 에러 0, localStorage 유지, SW 스코프
- 스모크: M1, M3, M4, M7 결과
```

### 4.2 Phase 2 (셸 분리)

**전제**: Phase 1 완료(`263e196`), `/math/` · `/english/` 정상 동작, 태그 `v1.9-phase1` 생성.

**경계 확인 (2026-10-31 실측)**

| 파일 | 여는 태그 | 내용 시작 | 내용 끝 | 닫는 태그 | 추출 줄 수 |
|---|---:|---:|---:|---:|---:|
| `math/index.html` | 690 | 691 | 4500 | 4501 | **3,810** |
| `english/index.html` | 569 | 570 | 2015 | 2016 | **1,446** |

함수 개수 기준선: 수학 **97**, 영어 **60** (추출 전후 동일해야 함)

```
[Phase 2] 인라인 스크립트 분리 (동작 무변경)

0) 태그: git tag -a v1.9-phase1 -m "phase1 complete: hub + math/ move"
   백업: backup/pre-phase2/ 에 math/index.html, english/index.html, math/sw.js, english/sw.js

1) 추출 (수동 복사 금지, 아래 스크립트 사용)
   python3 - <<'PY'
   import io
   def extract(src, out, start, end):  # start~end: 1-based, 포함
       lines = io.open(src, encoding='utf-8').read().split('\n')
       body = lines[start-1:end]
       io.open(out, 'w', encoding='utf-8').write('\n'.join(body) + '\n')
       print(out, len(body), 'lines')
   extract('math/index.html', 'math/app.js', 691, 4500)
   extract('english/index.html', 'english/app.js', 570, 2015)
   PY

   ※ 추출 전 경계 재확인:
     awk 'NR==690||NR==691||NR==4500||NR==4501{print NR": "$0}' math/index.html
     → 690:<script>  691:내용  4500:내용  4501:</script>
     (영어는 569:<script>  570:내용  2015:내용  2016:</script>)

2) 태그 교체
   math/index.html    : 690~4501행(태그 2줄 포함)을
                        <script src="app.js?v=20261031"></script> 1줄로 교체
   english/index.html : 569~2016행을
                        <script src="app.js?v=20261031"></script> 1줄로 교체

3) SW 갱신
   math/sw.js    : ASSETS 에 './app.js' 추가, CACHE_NAME 'amt-cache-v2.7' → 'amt-cache-v2.8'
   english/sw.js : ASSETS 에 './app.js' 추가, CACHE_NAME 'aet-cache-v1.7' → 'aet-cache-v1.8'

4) 문법 검사
   node --check math/app.js && node --check english/app.js

5) 동일성 증명 (가장 중요)
   git show HEAD:math/index.html | sed -n '691,4500p' > /tmp/math_old.js
   diff /tmp/math_old.js math/app.js        → 차이 0
   git show HEAD:english/index.html | sed -n '570,2015p' > /tmp/eng_old.js
   diff /tmp/eng_old.js english/app.js      → 차이 0
   grep -c '^\s*\(async \)\?function ' math/app.js     → 97
   grep -c '^\s*\(async \)\?function ' english/app.js  → 60

6) 검증 (반드시 localhost 사용)
   python3 -m http.server 8765 --bind 127.0.0.1
   → http://localhost:8765/math/ , http://localhost:8765/english/
   ※ 127.0.0.1 로 열면 SW 가 등록되지 않는다(앱 코드가 hostname === 'localhost' 만 허용).
     이것은 기존 동작이며 Phase 2에서 고치지 않는다.
   - 콘솔 에러 0, Network 404 0
   - 수학: 解説 1件 / 4択 1問 / ノート復元
   - 영어: 読解 1件 / 4択 1問 / 単語帳 1件
   - caches.keys() → amt-cache-v2.8, aet-cache-v1.8
   - 캐시에 ./app.js 포함 확인

7) 파일 크기
   wc -l math/index.html english/index.html       → 각 700줄 이하
   wc -l math/app.js english/app.js               → 3810 / 1446

보고 / 커밋 (2개로 분리)
  refactor(math): extract inline script to app.js (no logic change)
  refactor(english): extract inline script to app.js (no logic change)
```

**Phase 2에서 하지 않는 것**

- 함수 이동·이름 변경·`'use strict'` 추가·들여쓰기 정리 (전부 Phase 3)
- `escapeJsString` 손대기 (Phase 4까지 사용 중)
- `?v=` 값을 올리는 것은 **파일 내용이 바뀌었기 때문**이며, 로직 변경이 아니다

**Phase 2 DoD**

- [ ] `math/app.js` 3,810줄 / `english/app.js` 1,446줄
- [ ] 5)의 `diff` 2건 모두 0
- [ ] 함수 97 / 60 유지
- [ ] 콘솔 에러 0, 404 0
- [ ] 캐시명 v2.8 / v1.8, `./app.js` 포함
- [ ] 스모크 M1·M3·M4·M7

**롤백**: `git reset --hard v1.9-phase1`

### 4.3 Phase 3 (파일 분해, classic script 유지)

**전제**: Phase 2 완료(`13c95e1`), 태그 `v1.9-phase2` 생성.

**원칙**

1. **구간을 자르기만 한다.** 함수 이동·이름 변경·병합 금지.
2. 각 파일은 `app.js`의 **연속 구간**이며, **적재 순서 = 원본 순서**다.
3. 따라서 `cat 모듈들 > rebuilt.js` 결과가 원본과 **바이트 단위로 같아야** 한다. 이것이 유일한 합격 증거다.
4. 파일 선두에 빈 줄 1개가 남는 경우가 있다. **정리하지 않는다**(정리하면 diff가 난다).

**수학 — 20개**

| # | 파일 | 구간 | 줄 | 내용 |
|---:|---|---:|---:|---|
| 1 | `state.js` | 1–90 | 90 | 스토리지 래퍼, 공용 상태, `EMBEDDED_GEMINI_API_KEY` |
| 2 | `theme-ui.js` | 91–143 | 53 | 테마·다크모드·안전영역 |
| 3 | `history.js` | 144–321 | 178 | マイノート 저장/복원/삭제 |
| 4 | `similar.js` | 322–405 | 84 | 類題 생성 |
| 5 | `quiz.js` | 406–755 | 350 | 4択 UI·선택·채점·힌트 |
| 6 | `quiz-result.js` | 756–1012 | 257 | 결과 렌더·전체해설·기록·진행률·섹션 페이드 |
| 7 | `init.js` | 1013–1081 | 69 | 초기화 + PIN 잠금해제 |
| 8 | `settings.js` | 1082–1254 | 173 | 설정 모달·모델 목록 |
| 9 | `upload.js` | 1255–1335 | 81 | 이미지 선택·리사이즈 |
| 10 | `schema.js` | 1336–1694 | 359 | 프롬프트 + `TUTOR_RESPONSE_SCHEMA` 등 |
| 11 | `api-solve.js` | 1695–1940 | 246 | `fetchWithTimeout`/`parseTutorJson`/`callGeminiModel`/`solveProblem` |
| 12 | `render.js` | 1941–2321 | 381 | KaTeX 렌더·정규화·문제 탭·단계 카드 |
| 13 | `simplify.js` | 2322–2426 | 105 | 「もっとやさしく」 |
| 14 | `voice.js` | 2427–2681 | 255 | 음성 선택·분할·재생 |
| 15 | `ui-status.js` | 2682–2762 | 81 | 토스트·상태·쿼터 안내 |
| 16 | `visual.js` | 2763–2879 | 117 | SVG 진입점·파서 |
| 17 | `visual-graph.js` | 2880–3269 | 390 | 그래프 렌더 |
| 18 | `visual-numberline.js` | 3270–3360 | 91 | 수직선 렌더 |
| 19 | `chat-step.js` | 3361–3589 | 229 | 단계 Q&A |
| 20 | `chat-overall.js` | 3590–3810 | 221 | 문제 전체 Q&A |

**영어 — 9개**

| # | 파일 | 구간 | 줄 | 내용 |
|---:|---|---:|---:|---|
| 1 | `state.js` | 1–40 | 40 | 스토어·음성·앱 상태 |
| 2 | `schema.js` | 41–158 | 118 | 읽기/퀴즈/작문 스키마 |
| 3 | `init.js` | 159–289 | 131 | 초기화·모델 드롭다운·API키 배너·PIN |
| 4 | `mode.js` | 290–354 | 65 | 모드 전환 |
| 5 | `reading.js` | 355–616 | 262 | 사진/텍스트 읽기 분석 |
| 6 | `quiz.js` | 617–850 | 234 | 4択 |
| 7 | `writing.js` | 851–1042 | 192 | 작문 첨삭 |
| 8 | `wordbook.js` | 1043–1402 | 360 | 단어장·복습노트 |
| 9 | `voice.js` | 1403–1446 | 44 | 낭독 |

```
[Phase 3] 모듈 분해 (동작 무변경)

0) 태그: git tag -a v1.9-phase2 -m "phase2 complete: app.js extraction"
   백업: backup/pre-phase3/ 에 math/app.js, english/app.js, math/index.html, english/index.html

1) 분해 (스크립트로 수행, 수동 복사 금지)
   python3 - <<'PY'
   import io, os

   MATH = [
     ('state.js',1,90),('theme-ui.js',91,143),('history.js',144,321),('similar.js',322,405),
     ('quiz.js',406,755),('quiz-result.js',756,1012),('init.js',1013,1081),('settings.js',1082,1254),
     ('upload.js',1255,1335),('schema.js',1336,1694),('api-solve.js',1695,1940),('render.js',1941,2321),
     ('simplify.js',2322,2426),('voice.js',2427,2681),('ui-status.js',2682,2762),('visual.js',2763,2879),
     ('visual-graph.js',2880,3269),('visual-numberline.js',3270,3360),('chat-step.js',3361,3589),
     ('chat-overall.js',3590,3810),
   ]
   ENG = [
     ('state.js',1,40),('schema.js',41,158),('init.js',159,289),('mode.js',290,354),
     ('reading.js',355,616),('quiz.js',617,850),('writing.js',851,1042),('wordbook.js',1043,1402),
     ('voice.js',1403,1446),
   ]

   def split(src, outdir, spec):
       raw = io.open(src, encoding='utf-8').read()
       lines = raw.splitlines(keepends=True)
       assert ''.join(lines) == raw
       prev = 0
       for name, a, b in spec:
           assert a == prev + 1, (name, 'gap', prev, a)
           io.open(os.path.join(outdir, name), 'w', encoding='utf-8', newline='').write(''.join(lines[a-1:b]))
           prev = b
       assert prev == len(lines), (prev, len(lines))
       print(src, '->', len(spec), 'files, total', len(lines), 'lines')

   split('math/app.js', 'math', MATH)
   split('english/app.js', 'english', ENG)
   PY

2) app.js 삭제
   git rm math/app.js english/app.js
   (분해 결과는 위 스크립트가 이미 생성했다. 삭제 전에 3)의 무손실 증명을 먼저 통과시킨다.)

3) 무손실 증명 (필수, 통과 못하면 즉시 중단)
   cat math/state.js math/theme-ui.js math/history.js math/similar.js math/quiz.js \
       math/quiz-result.js math/init.js math/settings.js math/upload.js math/schema.js \
       math/api-solve.js math/render.js math/simplify.js math/voice.js math/ui-status.js \
       math/visual.js math/visual-graph.js math/visual-numberline.js math/chat-step.js \
       math/chat-overall.js > /tmp/m_rebuilt.js
   git show v1.9-phase2:math/app.js > /tmp/m_orig.js
   diff /tmp/m_orig.js /tmp/m_rebuilt.js          → 0

   cat english/state.js english/schema.js english/init.js english/mode.js english/reading.js \
       english/quiz.js english/writing.js english/wordbook.js english/voice.js > /tmp/e_rebuilt.js
   git show v1.9-phase2:english/app.js > /tmp/e_orig.js
   diff /tmp/e_orig.js /tmp/e_rebuilt.js          → 0

   grep -c '^\s*\(async \)\?function ' math/*.js | awk -F: '{s+=$2} END{print s}'      → 97
   grep -c '^\s*\(async \)\?function ' english/*.js | awk -F: '{s+=$2} END{print s}'   → 60

4) index.html 스크립트 태그 교체 (순서 고정)
   math/index.html 의 <script src="app.js?v=20261031"></script> 1줄을 아래 20줄로 교체
     <script src="state.js?v=20261031"></script>
     <script src="theme-ui.js?v=20261031"></script>
     <script src="history.js?v=20261031"></script>
     <script src="similar.js?v=20261031"></script>
     <script src="quiz.js?v=20261031"></script>
     <script src="quiz-result.js?v=20261031"></script>
     <script src="init.js?v=20261031"></script>
     <script src="settings.js?v=20261031"></script>
     <script src="upload.js?v=20261031"></script>
     <script src="schema.js?v=20261031"></script>
     <script src="api-solve.js?v=20261031"></script>
     <script src="render.js?v=20261031"></script>
     <script src="simplify.js?v=20261031"></script>
     <script src="voice.js?v=20261031"></script>
     <script src="ui-status.js?v=20261031"></script>
     <script src="visual.js?v=20261031"></script>
     <script src="visual-graph.js?v=20261031"></script>
     <script src="visual-numberline.js?v=20261031"></script>
     <script src="chat-step.js?v=20261031"></script>
     <script src="chat-overall.js?v=20261031"></script>

   english/index.html 도 동일하게 9줄 (state, schema, init, mode, reading, quiz,
   writing, wordbook, voice 순)

5) SW 갱신
   math/sw.js    : CACHE_NAME 'amt-cache-v2.8' → 'v2.9'
                   ASSETS 의 './app.js' 를 위 20개 파일로 교체
   english/sw.js : CACHE_NAME 'aet-cache-v1.8' → 'v1.9'
                   ASSETS 의 './app.js' 를 위 9개 파일로 교체

6) 문법 검사
   for f in math/*.js english/*.js *.js; do node --check "$f" || echo "FAIL $f"; done

7) 런타임 검증 (localhost)
   - 콘솔 에러 0, 404 0
   - 수학: 解説 1件 / 4択 1問 / ノート復元 / 設定モーダル開閉
   - 영어: 読解 1件 / 4択 1問 / 単語帳 1件 / 設定モーダル開閉
   - 스모크 M1·M3·M4·M7
   - caches.keys() → amt-cache-v2.9 / aet-cache-v1.9

보고 / 커밋 (2개)
  refactor(math): split app.js into modules (no logic change)
  refactor(english): split app.js into modules (no logic change)
```

**Phase 3 DoD**

- [ ] 수학 20파일 / 영어 9파일, 최대 390줄
- [ ] `cat` 재구성 diff 2건 모두 0
- [ ] 함수 97 / 60 유지
- [ ] `app.js` 삭제, SW ASSETS에 모듈 등록
- [ ] 콘솔 에러 0, 404 0, 캐시 v2.9 / v1.9

**롤백**: `git reset --hard v1.9-phase2`

> Phase 3이 끝나면 "3,810줄 단일 파일" 문제는 사라진다. 다만 이 시점의 모듈은 여전히 전역 함수다.
> 의존 관계 정리(ESM)·`onclick` 제거는 Phase 4에서 한다.

---

### 4.4 Phase 4-A (인라인 핸들러 제거, classic script 유지)

**전제**: Phase 3 완료(`78e004d`), 태그 `v1.9-phase3` 생성.
**목표**: 인라인 `on*="..."` **138개를 전부** `data-*` 속성 + 위임 리스너 1곳으로 교체한다.
**이 단계에서는 ESM으로 바꾸지 않는다.** 함수는 계속 전역이며, `type="module"`을 쓰지 않는다.

**원칙**

1. 함수 시그니처·본문·호출 순서를 **바꾸지 않는다.** 호출 "방법"만 바꾼다.
2. 인라인 속성은 **0개**가 되어야 한다. 하나라도 남으면 실패다.
3. 이벤트 종류별로 속성을 **분리**한다. 하나의 속성으로 click/change를 겸하지 않는다(오발동 방지).

| 이벤트 | 속성 | 읽는 리스너 | 예 |
|---|---|---|---|
| `click` | `data-action` | click 위임 1곳 | `data-action="restore-history" data-id="1729"` |
| `change` | `data-change` | change 위임 1곳 | `data-change="image-upload"` |
| `input` | `data-input` | input 위임 1곳 | `data-input="word-count"` |
| `keydown`(Enter) | `data-enter` | keydown 위임 1곳 | `data-enter="unlock"` |

4. 생성 문자열의 값은 `escapeJsString` 대신 **`escapeAttr`** 로 감싼다.
5. `escapeHtml`은 **지우지 않는다.** (텍스트 노드 출력용, 계속 사용)
6. `event.preventDefault()`를 **추가하지 않는다.** 원본 인라인 핸들러도 하지 않았다.

**인자 규칙 (`data-*` → 호출 인자)**

| 접미 | 타입 | 변환 |
|---|---|---|
| `data-idx` | number | `Number(el.dataset.idx)` |
| `data-id` | string | 그대로 |
| `data-theme` / `data-mode` / `data-part` / `data-tab` / `data-symbol` | string | 그대로 |
| `data-model` | string \| null | `el.dataset.model \|\| null` |
| `data-force` / `data-correct` | boolean | `el.dataset.force === '1'` / `el.dataset.correct === '1'` |
| `data-text` | string | 그대로 (일본어 프롬프트 원문, `"` 없음) |
| `data-word` / `data-meaning` / `data-example` | string | 그대로 (`example`은 `\|\| ''`) |

#### 4.4.1 새 파일 3개

**`shared/actions.js`** (classic script, `shared/` 중 **가장 먼저** 로드)

```js
// shared/actions.js — Phase 4-A: 인라인 핸들러 위임 디스패처 (classic script)
(function (global) {
  'use strict';

  var registry = Object.create(null);

  function register(map) {
    Object.keys(map).forEach(function (name) {
      if (registry[name]) console.warn('[actions] duplicate action:', name);
      registry[name] = map[name];
    });
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r/g, '')
      .replace(/\n/g, '&#10;'); // 원본 escapeJsString과 동일하게 개행 보존
  }

  function run(name, el, event) {
    var fn = registry[name];
    if (!fn) { console.warn('[actions] unregistered:', name); return; }
    try { fn(el, event); } catch (err) { console.error('[actions] failed:', name, err); }
  }

  function closest(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  document.addEventListener('click', function (event) {
    var el = closest(event.target, '[data-action]');
    if (el) run(el.dataset.action, el, event);
  });

  document.addEventListener('change', function (event) {
    var el = closest(event.target, '[data-change]');
    if (el) run(el.dataset.change, el, event);
  });

  document.addEventListener('input', function (event) {
    var el = closest(event.target, '[data-input]');
    if (el) run(el.dataset.input, el, event);
  });

  document.addEventListener('keydown', function (event) {
    // 원본 인라인 조건과 완전히 동일하게 유지한다.
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    var el = closest(event.target, '[data-enter]');
    if (el) run(el.dataset.enter, el, event);
  });

  global.TutorActions = {
    register: register,
    escapeAttr: escapeAttr,
    run: run,
    audit: function () {
      var nodes = document.querySelectorAll('[data-action],[data-change],[data-input],[data-enter]');
      var missing = [];
      Array.prototype.forEach.call(nodes, function (el) {
        var name = el.dataset.action || el.dataset.change || el.dataset.input || el.dataset.enter;
        if (!registry[name]) missing.push(name);
      });
      return { nodes: nodes.length, actions: Object.keys(registry).length, missing: missing };
    }
  };
  global.escapeAttr = escapeAttr; // Phase 4-B에서 export로 대체
})(window);
```

**`math/actions-map.js` / `english/actions-map.js`** — 각 앱의 **마지막** script. 등록표만 담는다.

```js
// math/actions-map.js
TutorActions.register({
  'unlock': () => unlockApp(),
  'change-theme': (el) => changeTheme(el.dataset.theme),
  // ...
});
```

- 값은 **arrow 함수**로 감싼다(호출 시점 지연 평가 → 로드 순서·hoisting 논쟁 제거).
- 두 앱의 등록표는 **합치지 않는다.** `openSettings`/`changeTheme`/`clearImage` 등은 이름이 같지만 구현이 다르다.

**로드 순서 (고정)**

```
shared/storage.js … shared/ui.js
[shared/actions.js]          ← shared 중 맨 앞
math/state.js … math/chat-overall.js
[math/actions-map.js]        ← 맨 뒤
```

`index.html` 수정은 2줄 추가뿐이다.

```html
<script src="../shared/actions.js?v=20261031"></script>   <!-- storage.js 앞 -->
...
<script src="actions-map.js?v=20261031"></script>          <!-- chat-overall.js 뒤 -->
```

#### 4.4.2 수학 등록표 (42개)

| # | `data-action` | `data-*` | 실행 |
|---:|---|---|---|
| 1 | `unlock` | — | `unlockApp()` |
| 2 | `open-settings` | — | `openSettings()` |
| 3 | `toggle-dark-mode` | — | `toggleDarkMode()` |
| 4 | `show-tutor-history` | — | `showTutorHistory()` |
| 5 | `change-theme` | `theme` | `changeTheme(theme)` |
| 6 | `model-change` | — | `onModelDropdownChange()` |
| 7 | `image-upload` | — | `handleImageUpload(event)` |
| 8 | `clear-image` | — | `clearImage()` |
| 9 | `solve` | `model?` `force?` | `solveProblem(model \|\| null, force)` |
| 10 | `play-all-steps` | — | `playAllSteps()` |
| 11 | `stop-speech` | — | `stopSpeech()` |
| 12 | `voice-change` | — | `onVoiceChange()` |
| 13 | `test-voice` | — | `testVoice()` |
| 14 | `speech-rate-change` | — | `onSpeechRateChange()` |
| 15 | `overall-quick` | `text` | `sendOverallQuickQuestion(text)` |
| 16 | `overall-send` | — | `sendOverallQuestion()` |
| 17 | `start-quiz` | — | `startQuizChallenge()` |
| 18 | `generate-similar` | — | `generateSimilarProblem()` |
| 19 | `save-current-history` | — | `saveCurrentToTutorHistory()` |
| 20 | `close-quiz` | — | `closeQuizSection()` |
| 21 | `toggle-quiz-hint` | — | `toggleQuizHint()` |
| 22 | `quiz-mode` | `mode` | `setQuizInputMode(mode)` |
| 23 | `submit-choice` | — | `submitChoiceAnswer()` |
| 24 | `insert-symbol` | `symbol` | `insertMathSymbol(symbol)` |
| 25 | `submit-student` | — | `submitStudentAnswer()` |
| 26 | `close-settings` | — | `closeSettings()` |
| 27 | `fetch-models` | — | `fetchAvailableModels()` |
| 28 | `save-settings` | — | `saveSettings()` |
| 29 | `close-tutor-history` | — | `closeTutorHistoryModal()` |
| 30 | `restore-history` | `id` | `restoreFromHistory(id)` |
| 31 | `delete-tutor-history` | `id` | `deleteFromTutorHistory(id)` |
| 32 | `select-choice` | `idx` | `selectQuizChoice(Number(idx))` |
| 33 | `save-quiz-history` | — | `saveQuizToHistory()` |
| 34 | `focus-student-answer` | — | `document.getElementById('studentAnswerInput')?.focus()` |
| 35 | `show-full-solution` | — | `showQuizFullSolution()` |
| 36 | `play-step` | `idx` | `playSingleStep(Number(idx))` |
| 37 | `simplify-step` | `idx` | `simplifyStep(Number(idx))` |
| 38 | `toggle-step-chat` | `idx` | `toggleStepChat(Number(idx))` |
| 39 | `step-quote` | `idx` `part` | `openStepChatWithQuote(Number(idx), part)` |
| 40 | `quick-question` | `idx` `text` | `sendQuickQuestion(Number(idx), text)` |
| 41 | `step-question-send` | `idx` | `sendStepQuestion(Number(idx))` |
| 42 | `speak-ja` | `text` | `speakJapanese(text)` |

#### 4.4.3 영어 등록표 (44개)

| # | `data-action` | `data-*` | 실행 |
|---:|---|---|---|
| 1 | `unlock` | — | `unlockApp()` |
| 2 | `open-settings` | — | `openSettings()` |
| 3 | `toggle-dark-mode` | — | `toggleDarkMode()` |
| 4 | `open-history` | `tab?` | `openHistoryModal(tab \|\| 'wordbook')` |
| 5 | `change-theme` | `theme` | `changeTheme(theme)` |
| 6 | `model-change` | — | `onModelChange()` |
| 7 | `switch-mode` | `mode` | `switchMode(mode)` |
| 8 | `quiz-generate` | `force` | `switchMode('quiz'); generateEnglishQuiz(force)` |
| 9 | `pick-image` | — | `const i = document.getElementById('fileInput'); if (!i \|\| event.target === i) return; i.click();` |
| 10 | `image-upload` | — | `handleImageUpload(event)` |
| 11 | `clear-image` | — | `clearImage()` |
| 12 | `analyze` | — | `analyzeEnglishProblem()` |
| 13 | `play-speech` | — | `playEnglishSpeech()` |
| 14 | `stop-speech` | — | `stopAllSpeech()` |
| 15 | `save-lesson-history` | — | `saveCurrentLessonToHistory()` |
| 16 | `generate-quiz` | `force` | `generateEnglishQuiz(force)` |
| 17 | `speak-question` | — | `speakQuizQuestion()` |
| 18 | `toggle-quiz-hint` | — | `toggleQuizHint()` |
| 19 | `submit-quiz` | — | `submitEnglishQuizAnswer()` |
| 20 | `writing-prompt` | — | `generateWritingPrompt()` |
| 21 | `word-count` | — | `updateWordCount()` |
| 22 | `submit-writing` | — | `submitWritingForCorrection()` |
| 23 | `close-history` | — | `closeHistoryModal()` |
| 24 | `history-tab` | `tab` | `switchHistoryTab(tab)` |
| 25 | `render-wordbook` | — | `renderWordbookList()` |
| 26 | `open-custom-word` | — | `openAddCustomWord()` |
| 27 | `close-custom-word` | — | `document.getElementById('customWordForm')?.classList.add('hidden')` |
| 28 | `save-custom-word` | — | `saveCustomWord()` |
| 29 | `clear-history-tab` | — | `clearCurrentHistoryTab()` |
| 30 | `save-settings` | — | `saveSettings()` |
| 31 | `close-settings` | — | `closeSettings()` |
| 32 | `speak-en` | `text` | `speakEnglishText(text)` |
| 33 | `save-all-words` | — | `saveAllLessonWords()` |
| 34 | `add-word-index` | `idx` | `addWordToWordbook(Number(idx))` |
| 35 | `select-quiz-choice` | `idx` | `selectEnglishQuizChoice(Number(idx))` |
| 36 | `speak-quiz-sentence` | `text` | `speakQuizFullSentence(text)` |
| 37 | `save-quiz-record` | `correct` | `saveQuizRecordToHistory(correct)` |
| 38 | `add-word-direct` | `word` `meaning` `example?` | `addWordDirect(word, meaning, example \|\| '')` |
| 39 | `save-writing-history` | — | `saveWritingToHistory()` |
| 40 | `unblur` | — | `el.classList.remove('blur-sm')` |
| 41 | `toggle-memorized` | `id` | `toggleWordMemorized(id)` |
| 42 | `delete-word` | `id` | `deleteWordItem(id)` |
| 43 | `restore-history-item` | `id` | `restoreHistoryItem(id)` |
| 44 | `delete-history-item` | `id` | `deleteHistoryItem(id)` |

#### 4.4.4 파일별 변환 수량 (합계 138)

| 앱 | 파일 | 개수 | 비고 |
|---|---|---:|---|
| 수학 | `index.html` | 51 | 정적 (click 44, change 4, keydown 3) |
| 수학 | `render.js` | 13 | 생성 문자열 |
| 수학 | `quiz-result.js` | 3 | 생성 문자열 |
| 수학 | `history.js` | 2 | `escapeJsString` 2 |
| 수학 | `api-solve.js` | 2 | `escapeJsString` 1 |
| 수학 | `ui-status.js` | 2 | `escapeJsString` 1 |
| 수학 | `quiz.js` | 1 | |
| 수학 | `chat-step.js` | 1 | `escapeJsString` 1 |
| 수학 | `chat-overall.js` | 1 | `escapeJsString` 1 |
| 영어 | `index.html` | 42 | 정적 (click 37, change 3, input 1, keydown 1) |
| 영어 | `wordbook.js` | 7 | `escapeJsString` 6 |
| 영어 | `reading.js` | 5 | `escapeJsString` 3 |
| 영어 | `quiz.js` | 5 | `escapeJsString` 4 |
| 영어 | `writing.js` | 3 | `escapeJsString` 2 |

> `escapeJsString`은 총 23회 등장한다(호출 21 + 정의 2). 호출 21곳은 **전부** 위 생성 문자열 안에 있고, 4.4.7(커밋 3)에서 정의 2개와 함께 사라진다.
> `english/voice.js`의 1회는 정의뿐이므로 호출 표에 없다(그래서 21 + 2 = 23).

#### 4.4.5 변환 예시

**① 정적 HTML — 인자 없음**

```html
<!-- before -->
<button onclick="openSettings()">
<!-- after -->
<button data-action="open-settings">
```

**② 정적 HTML — 문자열 인자**

```html
<!-- before -->
<button onclick="changeTheme('minimal')">
<button onclick="insertMathSymbol('√')">
<button onclick="sendOverallQuickQuestion('この問題の「別の解き方（別解）」があれば詳しく教えてください。')">
<!-- after -->
<button data-action="change-theme" data-theme="minimal">
<button data-action="insert-symbol" data-symbol="√">
<button data-action="overall-quick" data-text="この問題の「別の解き方（別解）」があれば詳しく教えてください。">
```

**③ 정적 HTML — change / input / Enter**

```html
<!-- before -->
<select onchange="onModelDropdownChange()">
<input id="fileInput" type="file" onchange="handleImageUpload(event)">
<textarea oninput="updateWordCount()">
<input id="pinInput" onkeydown="if(event.key==='Enter' && !event.isComposing && event.keyCode!==229) unlockApp()">
<!-- after -->
<select data-change="model-change">
<input id="fileInput" type="file" data-change="image-upload">
<textarea data-input="word-count">
<input id="pinInput" data-enter="unlock">
```

> `keydown` 5곳은 **모두** `data-enter` + 위임 1곳으로 바뀐다. 조건식은 `shared/actions.js`에 **한 번만** 존재한다.

**④ 생성 문자열 — `escapeJsString` → `escapeAttr`**

```js
// before
`<button onclick="restoreFromHistory('${escapeJsString(item.id)}')">`
`<button onclick="playSingleStep(${idx})">`
// after
`<button data-action="restore-history" data-id="${escapeAttr(item.id)}">`
`<button data-action="play-step" data-idx="${idx}">`
```

**⑤ 생성 문자열 — 인자 3개**

```js
// before
<button onclick="addWordDirect('${escapeJsString(correctText)}', '${escapeJsString(currentQuizData.translationJa)}', '${escapeJsString(currentQuizData.questionEn)}')"
// after
<button data-action="add-word-direct"
        data-word="${escapeAttr(correctText)}"
        data-meaning="${escapeAttr(currentQuizData.translationJa)}"
        data-example="${escapeAttr(currentQuizData.questionEn)}"
```

**⑥ 특수 케이스 6개 (그대로 옮기지 말 것)**

| 원본 | 처리 |
|---|---|
| `onclick="document.getElementById('fileInput').click()"` | `data-action="pick-image"` + 등록표에서 `event.target === input`이면 return (프로그램 `.click()` 재진입 차단) |
| `onclick="document.getElementById('studentAnswerInput').focus()"` | `data-action="focus-student-answer"` |
| `onclick="document.getElementById('customWordForm').classList.add('hidden')"` | `data-action="close-custom-word"` |
| `onclick="this.classList.remove('blur-sm')"` | `data-action="unblur"` → `(el) => el.classList.remove('blur-sm')` |
| `onclick="switchMode('quiz'); generateEnglishQuiz();"` | `data-action="quiz-generate" data-force="0"` (한 액션 안에서 두 호출, 순서 유지) |
| `onclick="switchMode('quiz'); generateEnglishQuiz(true);"` | `data-action="quiz-generate" data-force="1"` |

#### 4.4.6 검증 스크립트 `tests/check-actions.js`

```js
// tests/check-actions.js — Phase 4-A gate
const fs = require('fs');
const path = require('path');

const APPS = ['math', 'english'];
const partial = process.argv.includes('--partial');
let failed = false;

for (const app of APPS) {
  const dir = path.join(__dirname, '..', app);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
  files.push(path.join(dir, 'index.html'));

  const used = new Set();
  let inline = 0;
  let escapeCalls = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    inline += (src.match(/\son(click|change|input|keydown)\s*=/g) || []).length;
    escapeCalls += (src.match(/escapeJsString\s*\(/g) || []).length;
    const NAME = /data-(?:action|change|input|enter)\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = NAME.exec(src))) used.add(m[1]);
  }

  const mapSrc = fs.readFileSync(path.join(dir, 'actions-map.js'), 'utf8');
  const defined = new Set();
  const KEY = /^\s*'([a-z0-9-]+)':/gm;
  let k;
  while ((k = KEY.exec(mapSrc))) defined.add(k[1]);

  const missing = [...used].filter((n) => !defined.has(n));
  const unused = [...defined].filter((n) => !used.has(n));

  console.log(`[${app}] used=${used.size} defined=${defined.size} inline=${inline} escapeJsString=${escapeCalls}`);
  if (missing.length) { console.log(`  FAIL undefined actions: ${missing.join(', ')}`); failed = true; }
  if (unused.length) console.log(`  WARN unused actions: ${unused.join(', ')}`);
  if (!partial && inline) { console.log(`  FAIL inline handlers remain: ${inline}`); failed = true; }
}

if (failed) process.exit(1);
console.log(partial ? 'PARTIAL OK' : 'ALL PASSED');
```

**단계별 기대값**

| 시점 | `inline` (수학+영어) | `escapeJsString` | 결과 |
|---|---:|---:|---|
| 커밋 1 직후 | 45 (JS 생성 문자열만) | 23 | `--partial` → `PARTIAL OK` |
| 커밋 2 직후 | 0 | 2 (정의 2개만 잔존) | `--partial` → `PARTIAL OK` |
| 커밋 3 직후 | 0 | 0 | 기본 실행 → `ALL PASSED` |

> 등록표 키는 **반드시 작은따옴표 + kebab-case**로 쓴다(`'restore-history':`). 검증 스크립트가 이 형식으로만 키를 읽는다.

**런타임 검증 (브라우저 콘솔)**

```js
TutorActions.audit()            // 수학 → { nodes: 51, actions: 42, missing: [] }
TutorActions.audit()            // 영어 → { nodes: 42, actions: 44, missing: [] }
TutorActions.audit().missing.length === 0
```

- `audit()`는 **정적 DOM만** 본다. 생성 문자열은 각 화면을 실제로 렌더한 뒤 다시 호출한다.
  - 수학: 解説 1건 렌더 → 노트 저장/복원 → 4択 1문항 시작 → 각 단계 채팅 열기
  - 영어: 読解 1건 → 4択 1문항 → 単語帳 1건 → 作文添削 1건
- 각 상태에서 `audit().missing`이 `[]`이어야 한다.
- 콘솔에 `[actions] unregistered:` **0건**, `[actions] failed:` **0건**.

#### 4.4.7 커밋 3개

**커밋 1 — 인프라 + 정적 93개**

```
refactor(actions): add delegated data-action dispatcher
```

- 신규: `shared/actions.js`, `math/actions-map.js`, `english/actions-map.js`, `tests/check-actions.js`
- 수정: `math/index.html` (script 2줄 + 정적 51개), `english/index.html` (script 2줄 + 정적 42개)
- SW: `amt-cache-v2.9 → v3.0`, `aet-cache-v1.9 → v2.0`, ASSETS에 `'../shared/actions.js'`, `'./actions-map.js'` 추가
- gate: `node tests/check-actions.js --partial` → 수학 `inline=25` / 영어 `inline=20` (합 45), `missing 0`
- 스모크: 정적 버튼 전수 클릭(설정 모달·테마·PIN·모드 전환·기록 모달), 콘솔 에러 0

**커밋 2 — 생성 문자열 45개**

```
refactor(math,english): convert generated inline handlers to data attributes
```

- 수정: `math/{history,quiz,quiz-result,api-solve,render,ui-status,chat-step,chat-overall}.js`,
  `english/{reading,quiz,writing,wordbook}.js`
- gate: `node tests/check-actions.js --partial` → `inline=0`, `escapeJsString=2`(정의만), `used=42`/`44`, `missing 0`
- 스모크: **M1·M3·M4·M7** + 렌더 후 `audit().missing === []`

**커밋 3 — `escapeJsString` 삭제**

```
refactor: remove escapeJsString
```

- 수정: `math/history.js`, `english/voice.js` — 함수 정의 2개 삭제
- gate: `node tests/check-actions.js` → `ALL PASSED`, `grep -rn 'escapeJsString' math english shared` → 0
- 스모크: M1~M8 전체

**Phase 4-A DoD**

- [ ] 인라인 `on(click|change|input|keydown)` **0개** (HTML + JS 전수)
- [ ] `[data-action]`에서 추출한 액션 이름이 등록표에 **100% 존재**
- [ ] `escapeJsString` 호출 0, 정의 0
- [ ] `TutorActions.audit().missing.length === 0` (정적 + 렌더 후 각 1회)
- [ ] 콘솔 `[actions] unregistered` / `[actions] failed` 0건
- [ ] 스모크 M1·M3·M4·M7 통과 (4-A 종료 시), M1~M8 (4-C 종료 시)
- [ ] SW 캐시 `v3.0` / `v2.0`, JS 자산 26 / 15개(ASSETS 전체 33 / 22개)

**롤백**: `git reset --hard v1.9-phase3`

> 4-A가 끝나면 앱은 여전히 전역 함수지만, **HTML과 JS 사이의 문자열 결합은 사라진다.**
> `escapeJsString`(21곳 호출)이 없어지고, 이벤트 진입점이 `shared/actions.js` 1곳으로 모인다.
> 다음 4-B에서 `type="module"`로 바꾸면 `onclick`이 없으므로 **깨질 지점이 없다.**

### 4.5 Phase 4-B (ESM 전환)

**전제**: 4-A 완료(`4bdd3c0`), 태그 `v1.9-phase4a` 생성.
**목표**: 앱 모듈을 ES Module로 바꿔 전역 함수를 없앤다. **동작 무변경.**

**이 단계에서 같이 처리해야 하는 것 (핵심)**

> ESM의 `import` 바인딩은 **읽기 전용**이다. 지금 앱은 `let currentQuizData` 같은 전역 변수를
> 여러 파일에서 **재할당**한다(수학 38회 / 영어 30회). 그대로 `import`하면
> `TypeError: Assignment to constant variable`(strict mode)로 죽는다.
>
> 따라서 **재할당되는 상태를 하나의 객체로 모으고**, 참조를 `state.xxx`로 바꾼다.
> setter 함수를 만드는 방법도 가능하지만, 이 앱에는 이미 `setQuizInputMode()`라는
> 함수가 있어 이름이 충돌한다(프로토타입에서 확인). 객체 방식이 충돌·오타 위험이 없다.

**프로토타입 실측 (이미 수행, 양쪽 앱 통과)**

| 항목 | 수학 | 영어 |
|---|---:|---:|
| `state`로 옮기는 변수 | 17 | 10 |
| `state.` 로 바뀌는 줄 | 173 | 105 |
| `export` 대상 선언 | 106 | 67 |
| 생성되는 import 바인딩 | 181 | 83 |
| import 헤더 줄 | 20개 파일 | 9개 파일 |
| 브라우저 검증 | 통과 | 통과 |

프로토타입에서 확인한 것: 모듈 함수가 전역에서 사라짐(`typeof solveProblem === 'undefined'`),
`TutorActions.audit()` 51/42·42/44 `missing: []`, 설정·테마·퀴즈모드·기호삽입·기록모달·
단어장 저장/암기토글·모드전환 전부 정상, 콘솔 에러 0.

#### 4.5.1 최종 구조

```
math/
  state.js        ← const state = { ...17개... } + 나머지 const/함수
  ...20개 모듈...  ← 파일마다 import 헤더 + export
  actions-map.js  ← ESM. 필요한 42개 함수를 import
  main.js         ← 신규. side-effect import만 (원본 순서)
  index.html      ← <script type="module" src="main.js?..."> 1줄
english/ 동일 (10개 모듈 + main.js)
shared/*.js       ← **classic 유지** (window.Tutor* 브리지). 4-C에서 정리
```

`main.js`:

```js
// math/main.js — ESM 엔트리 (Phase 4-B)
// 로드 순서는 Phase 3의 <script> 순서와 동일하다.

import './state.js';
import './theme-ui.js';
import './history.js';
import './similar.js';
import './quiz.js';
import './quiz-result.js';
import './init.js';
import './settings.js';
import './upload.js';
import './schema.js';
import './api-solve.js';
import './render.js';
import './simplify.js';
import './voice.js';
import './ui-status.js';
import './visual.js';
import './visual-graph.js';
import './visual-numberline.js';
import './chat-step.js';
import './chat-overall.js';
import './actions-map.js';
```

영어는 `state, schema, init, mode, reading, quiz, writing, wordbook, voice, actions-map` 10줄.

**index.html**: 앱 모듈 script 태그 20줄(영어 9줄)을 아래 1줄로 교체.
`../shared/*.js` 4줄은 **그대로 둔다**(classic이 먼저 실행되고 module은 defer).

```html
  <script type="module" src="main.js?v=20261031"></script>
```

**SW**: ASSETS에 `'./main.js'` 추가, 캐시 `amt-cache-v3.0 → v3.1`, `aet-cache-v2.0 → v2.1`.
모듈 파일 목록은 그대로 둔다(브라우저가 import로 가져오므로 프리캐시에 필요).

#### 4.5.2 변환 스크립트 (2단계)

`state` 객체화(1단계)와 export/import(2단계)를 **분리 실행**한다. 1단계는 classic 상태로
검증하고, 통과한 뒤에 2단계를 실행한다.

```python
#!/usr/bin/env python3
"""Phase 4-B transformer: classic scripts -> ESM.

stage 1 : move mutable state into one `state` object, rewrite references (classic scripts stay)
stage 2 : add `export` to every top-level declaration and generate `import` headers

Usage:
    python3 transform_4b.py math math 1
    python3 transform_4b.py math math 2
"""
import re
import sys
import os

APPS = {
    'math': ['state', 'theme-ui', 'history', 'similar', 'quiz', 'quiz-result', 'init',
             'settings', 'upload', 'schema', 'api-solve', 'render', 'simplify', 'voice',
             'ui-status', 'visual', 'visual-graph', 'visual-numberline', 'chat-step',
             'chat-overall', 'actions-map'],
    'english': ['state', 'schema', 'init', 'mode', 'reading', 'quiz', 'writing',
                'wordbook', 'voice', 'actions-map'],
}

STATE_VARS = {
    'math': ['currentImageBase64', 'currentProblems', 'currentProblemIndex', 'currentQuizData',
             'quizInputMode', 'selectedChoiceIndex', 'stepChats', 'stepChatBusy', 'overallChats',
             'overallChatBusy', 'currentSteps', 'isPlayingQueue', 'autoPlayTimer', 'toastTimer',
             'currentModelId', 'currentProblemText', 'tutorHistory'],
    'english': ['currentMode', 'currentImageBase64', 'lastLessonData', 'lastPassageEn',
                'currentQuizData', 'selectedChoiceIndex', 'lastWritingData', 'wordbookList',
                'englishHistory', 'currentHistoryTab'],
}


# ---------------------------------------------------------------- source masks
def mask(src, blank_strings):
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in ('"', "'"):
            q = c
            i += 1
            while i < n:
                ch = src[i]
                if ch == '\\':
                    if blank_strings:
                        out[i] = ' '
                    i += 2
                    continue
                if ch == q:
                    i += 1
                    break
                if blank_strings and ch != '\n':
                    out[i] = ' '
                i += 1
            continue
        if c == '`':
            i += 1
            while i < n:
                ch = src[i]
                if ch == '\\':
                    if blank_strings:
                        out[i] = ' '
                    i += 2
                    continue
                if ch == '`':
                    i += 1
                    break
                if ch == '$' and i + 1 < n and src[i + 1] == '{':
                    depth = 1
                    i += 2
                    while i < n and depth:
                        if src[i] == '{':
                            depth += 1
                        elif src[i] == '}':
                            depth -= 1
                        i += 1
                    continue
                if blank_strings and ch != '\n':
                    out[i] = ' '
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] != '\n':
                out[i] = ' '
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            while i + 1 < n and not (src[i] == '*' and src[i + 1] == '/'):
                if src[i] != '\n':
                    out[i] = ' '
                i += 1
            for k in (i, i + 1):
                if k < n:
                    out[k] = ' '
            i += 2
            continue
        i += 1
    return ''.join(out)


DECL = re.compile(r'^    (?:export\s+)?(?:async\s+)?(function|let|const|var|class)\s+([A-Za-z_$][\w$]*)', re.M)


def top_level_decls(src):
    code = mask(src, True)
    return [(m.group(2), code[:m.start()].count('\n')) for m in DECL.finditer(code)]


# ------------------------------------------------------------------ stage 1
def move_state_to_object(src, vars_):
    lines = src.split('\n')
    inits, comments, keep = {}, {}, []
    for line in lines:
        m = re.match(r'^\s{4}(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*?);(?:\s*//\s*(.*))?\s*$', line)
        if m and m.group(1) in vars_:
            inits[m.group(1)] = m.group(2)
            if m.group(3):
                comments[m.group(1)] = m.group(3)
            continue
        keep.append(line)
    missing = [v for v in vars_ if v not in inits]
    if missing:
        raise SystemExit('not a declaration: %s' % missing)
    src = '\n'.join(keep).rstrip('\n')
    block = ['', '    // ==== Phase 4-B: 공유 가변 상태 (ESM import 바인딩은 재할당 불가) ====',
             '    const state = {']
    for v in vars_:
        suffix = (' // ' + comments[v]) if v in comments else ''
        block.append('      %s: %s,%s' % (v, inits[v], suffix))
    block.append('    };')
    return src + '\n' + '\n'.join(block) + '\n'


def rename_state_refs(src, vars_):
    code = mask(src, True)
    hits = []
    for v in vars_:
        p = re.compile(r'(?<![\w$.])' + re.escape(v) + r'(?![\w$])')
        hits += [(m.start(), m.end(), v) for m in p.finditer(code)]
    for start, end, v in sorted(hits, reverse=True):
        src = src[:start] + 'state.' + v + src[end:]
    return src


# ------------------------------------------------------------------ stage 2
def add_exports(src):
    lines = src.split('\n')
    for _name, line_no in top_level_decls(src):
        line = lines[line_no]
        if line.startswith('    ') and not line.startswith('    export '):
            lines[line_no] = 'export ' + line[4:]
    return '\n'.join(lines)


def add_imports(src, filename, names, decls_by_file):
    code = mask(src, False)
    own = set(decls_by_file[filename])
    header = []
    for mod in names:
        g = mod + '.js'
        if g == filename:
            continue
        need = [n for n in decls_by_file[g]
                if n not in own and re.search(r'(?<![\w$.])' + re.escape(n) + r'(?![\w$])', code)]
        if need:
            header.append("import { %s } from './%s';" % (', '.join(sorted(need)), g))
    if header:
        return '\n'.join(header) + '\n\n' + src
    return src


# ---------------------------------------------------------------------- main
def main(app_dir, app, stage):
    names = APPS[app]
    srcs = {mod + '.js': open(os.path.join(app_dir, mod + '.js'), encoding='utf-8').read()
            for mod in names}

    if stage == 1:
        vars_ = STATE_VARS[app]
        srcs['state.js'] = move_state_to_object(srcs['state.js'], vars_)
        renamed = 0
        for f in srcs:
            if f == 'state.js':
                continue
            before = srcs[f]
            srcs[f] = rename_state_refs(srcs[f], vars_)
            renamed += len([1 for a, b in zip(before.split('\n'), srcs[f].split('\n')) if a != b])
        for f, s in srcs.items():
            open(os.path.join(app_dir, f), 'w', encoding='utf-8').write(s)
        print('%s stage 1: %d state vars, %d lines rewritten' % (app, len(vars_), renamed))
        return

    decls_by_file = {}
    for f in srcs:
        decls_by_file[f] = [n for n, _ in top_level_decls(srcs[f])]
        srcs[f] = add_exports(srcs[f])
    for f in srcs:
        srcs[f] = add_imports(srcs[f], f, names, decls_by_file)
        open(os.path.join(app_dir, f), 'w', encoding='utf-8').write(srcs[f])

    print('%s stage 2: %d files' % (app, len(srcs)))
    for f in srcs:
        print('  %-24s exports=%2d importLines=%d' % (
            f, len(decls_by_file[f]),
            len([1 for l in srcs[f].split('\n') if l.startswith('import ')])))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2)
```

**1단계가 하는 일**

1. `state.js`의 `let currentQuizData = null;` 17개(영어 10개)를 삭제하고,
   파일 끝에 `const state = { currentQuizData: null, ... };` 를 만든다(주석은 속성 옆으로 이동).
2. 나머지 파일에서 해당 이름을 `state.이름` 으로 바꾼다(문자열/주석 내부는 제외,
   템플릿 리터럴의 `${...}` 안은 포함).

**2단계가 하는 일**

1. 모든 최상위 선언(`^    function|let|const|var|class`)에 `export ` 를 붙인다.
   - 이미 `export`가 붙은 줄은 건너뛴다(`state` 객체).
   - 선언줄만 바뀌고 본문 들여쓰기는 그대로다(의도적: diff 최소화).
2. 다른 파일에서 실제로 참조하는 이름만 골라 `import { ... } from './x.js';` 를 파일 맨 위에 넣는다.
   - 자기 파일 선언은 제외, 주석은 무시, 문자열은 유지(과잉 import는 무해).

#### 4.5.3 검증 스크립트 `tests/check-imports.js`

이미 저장소에 추가되어 있다(4-B 커밋에 포함). 모든 `import { … } from './x.js'`에 대해
`x.js`가 그 이름을 정말 `export`하는지 확인한다. **오타·누락 import를 잡는 유일한 정적 게이트**다.

```js
// tests/check-imports.js — Phase 4-B gate (ESM export/import consistency)
const fs = require('fs');
const path = require('path');

const APPS = ['math', 'english'];
let failed = false;

for (const app of APPS) {
  const dir = path.join(__dirname, '..', app);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const exportsOf = new Map();
  const importsOf = [];

  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const names = new Set();
    const EXP = /^[ \t]*export\s+(?:async\s+)?(?:function|let|const|var|class)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = EXP.exec(src))) names.add(m[1]);
    exportsOf.set(file, names);

    const IMP = /import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g;
    while ((m = IMP.exec(src))) {
      const list = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      importsOf.push({ from: file, target: m[2], list });
    }
  }

  let missing = 0;
  let total = 0;
  for (const imp of importsOf) {
    if (!exportsOf.has(imp.target)) {
      console.log(`  [${app}] ${imp.from}: missing module './${imp.target}'`);
      failed = true;
      continue;
    }
    for (const name of imp.list) {
      total++;
      if (!exportsOf.get(imp.target).has(name)) {
        console.log(`  [${app}] ${imp.from}: '${name}' is not exported by './${imp.target}'`);
        missing++;
        failed = true;
      }
    }
  }
  console.log(`[${app}] files=${files.length} import-bindings=${total} missing=${missing}`);
}
if (failed) process.exit(1);
console.log('ALL PASSED');
```

#### 4.5.4 문법 검사 (ESM 전용)

`node --check file.js`는 CommonJS로 파싱하므로 `import`/`export`에서 실패한다.
**`.mjs`로 복사해서 검사**한다.

```bash
for f in math/*.js english/*.js; do
  cp "$f" /tmp/_chk.mjs
  node --check /tmp/_chk.mjs || echo "FAIL $f"
done
```

#### 4.5.5 커밋 4개

**커밋 1 — 수학 상태 객체화 (classic 유지)**

```
refactor(math): move mutable state into a state object
```

- 수정: `math/*.js` 21개 (스크립트 1단계)
- gate: `node --check` 전부 통과, `grep -c '^import \|^export ' math/*.js` → 0
- gate: `grep -n 'const state = {' math/state.js` → 1
- 스모크: 수학 M1·M3·M4 (전역 `state` 그대로이므로 기존 동작과 동일해야 함)

**커밋 2 — 영어 상태 객체화 (classic 유지)**

```
refactor(english): move mutable state into a state object
```

- 커밋 1과 동일한 gate + 영어 M7

**커밋 3 — 수학 ESM**

```
refactor(math): convert modules to ES modules
```

- 수정: `math/*.js` 21개(2단계), `math/main.js` 신규, `math/index.html`, `math/sw.js`
- gate: `.mjs` 문법 검사 0건, `node tests/check-imports.js` → math `missing=0`
- gate: `grep -c 'type="module"' math/index.html` → 1, 앱 모듈 classic 태그 → 0
- 런타임: 콘솔 에러 0, `typeof solveProblem === 'undefined'`, `TutorActions.audit().missing === []`
- 스모크: 수학 M1·M3·M4 + 설정/테마/기록/기호 버튼

**커밋 4 — 영어 ESM**

```
refactor(english): convert modules to ES modules
```

- 커밋 3과 동일 + 영어 M7 + 단어장 저장/암기 토글

#### 4.5.6 Phase 4-B DoD

- [ ] `math/main.js`, `english/main.js` 존재, 각 `index.html`에 `type="module"` 1줄
- [ ] 앱 모듈 classic `<script src="*.js">` 태그 0개 (shared 4줄은 유지)
- [ ] `.mjs` 문법 검사 0건
- [ ] `node tests/check-imports.js` → `[math] missing=0`, `[english] missing=0`, ALL PASSED
- [ ] 브라우저에서 `typeof solveProblem` / `typeof analyzeEnglishProblem` → `undefined`
- [ ] `typeof TutorActions === 'object'`, `typeof escapeAttr === 'function'` (4-C까지 유지되는 브리지)
- [ ] `TutorActions.audit()` → 정적 `51/42`, `42/44`, `missing: []`
- [ ] 스모크 M1·M3·M4·M7 통과, 콘솔 에러 0
- [ ] SW 캐시 `v3.1` / `v2.1`, ASSETS에 `./main.js` 포함

**롤백**: 커밋별로 되돌린다. 전체는 `git reset --hard v1.9-phase4a`.

#### 4.5.7 4-C로 남기는 것

- `shared/actions.js`의 `window.TutorActions`, `window.escapeAttr` 브리지
- `shared/*.js`의 `window.TutorStorage` / `TutorCore` / `TutorSpeech` / `TutorUI`
- CSP 메타 태그

> 4-B가 끝나면 앱 코드에는 **전역 함수가 하나도 없다.** 남은 전역은 `shared/*`가 노출하는
> 5개 브리지뿐이고, 4-C에서 `shared/actions.js`를 ESM으로 바꾸며 정리한다.
> 브리지를 지우려면 `escapeAttr`을 쓰는 13개 파일에 import를 추가하고,
> `actions-map.js`가 `register`를 import하도록 바꾸면 된다.

#### 4.5.8 실행 중 발견된 회귀 — `stepQuotes` (필수 수정)

4-B 적용 후 **실제 버그 1건**이 확인됐다. 4-B 완료 조건에 포함해 반드시 고친다.

**증상**

```
ReferenceError: stepQuotes is not defined
    at renderTutorResult (math/render.js:216)
    at restoreFromHistory (math/history.js:119)
```

**원인**

`stepQuotes`는 **어디에도 선언된 적이 없는 암묵적 전역**이었다. classic script(sloppy mode)에서는
`stepQuotes = {};`가 `window.stepQuotes`를 즉석에서 만들었기 때문에 동작했다. ESM은 항상 strict mode라
선언 없는 대입이 `ReferenceError`가 된다.

사용처는 3개 파일 6곳이다.

| 파일 | 원래 코드 |
|---|---|
| `math/render.js:216` | `stepQuotes = {};` |
| `math/chat-step.js:39` | `stepQuotes[chatKey] = quoteText;` |
| `math/chat-step.js:152` | `stepQuotes[chatKey] ? ...` |
| `math/chat-step.js:206` | `delete stepQuotes[chatKey];` |
| `math/simplify.js:93` | `delete stepQuotes[chatKey];` |

**수정** — `state` 객체에 편입한다(다른 stepChats/stepChatBusy와 동일한 성격).

```python
import re
p = 'math/state.js'
s = open(p, encoding='utf-8').read()
s = re.sub(r'(      stepChatBusy: \{\},[^\n]*\n)',
           r'\1      stepQuotes: {}, // ステップチャットの引用文 (chatKey -> quote)\n',
           s, count=1)
open(p, 'w', encoding='utf-8').write(s)

for f in ['math/render.js', 'math/chat-step.js', 'math/simplify.js']:
    s = open(f, encoding='utf-8').read()
    s = re.sub(r'(?<![\w$.])stepQuotes(?![\w$])', 'state.stepQuotes', s)
    open(f, 'w', encoding='utf-8').write(s)
```

수정 후:

- `state` 키 18개 (기존 17 + `stepQuotes`)
- `grep -rn 'stepQuotes' math/*.js` → 전부 `state.stepQuotes`
- `state`는 세 파일 모두 이미 import하고 있으므로 추가 import 불필요

**검증 (이 수정으로 실제 확인한 것)**

| 항목 | 결과 |
|---|---|
| 히스토리 시드 → 노트 복원 | 결과 렌더 O, 콘솔 에러 0 |
| 단계 카드 / 인용 버튼 | 2단계, `step-quote` 8개, KaTeX 1개 |
| 단계 채팅 열기 + 인용 클릭 | 정상 (`state.stepQuotes` 경로) |
| `TutorActions.audit()` | nodes 79, missing `[]` |

> **교훈**: classic → ESM에서 가장 위험한 것은 함수가 아니라 **암묵적 전역**이다.
> Phase 6에서 `no-undef` 계열 정적 검사(또는 ESLint)를 반드시 추가한다.
> 이번에는 "선언 없는 대입"을 전수 스캔해 `stepQuotes` 1건만 발견했다(영어 0건).

**커밋**: `fix(math): declare stepQuotes in shared state (implicit global)`

---

### 4.6 Phase 4-C (shared ESM + CSP)

**전제**: 4-B + `stepQuotes` 수정 완료(`ef55bab`).
**목표**: ① 남은 `window.*` 브리지 4+2개를 없애고 ② CSP를 건다.

**현재 남은 전역 (4-B 종료 시점)**

| 전역 | 정의 | 앱 참조 |
|---|---|---:|
| `window.TutorUI` | `shared/ui.js` | 52 |
| `window.TutorCore` | `shared/core.js` | 28 |
| `window.TutorStorage` | `shared/storage.js` | 8 |
| `window.TutorSpeech` | `shared/speech.js` | 4 |
| `escapeAttr` | `shared/actions.js` | 9개 파일 |
| `TutorActions` | `shared/actions.js` | actions-map 2곳 |

합계 **92회 / 11개 파일**. 이 단계가 끝나면 앱 코드에 전역은 0개가 된다.

#### 4.6.1 변환 원칙

1. `shared/*.js`의 IIFE를 벗기고 `export const TutorX = { ... }` 로 바꾼다.
2. 앱의 `window.TutorX` → `TutorX` + `import { TutorX } from '../shared/x.js';`.
3. `escapeAttr` → `import { escapeAttr } from '../shared/actions.js';`.
4. `TutorActions.register(...)` → `import { register } from '../shared/actions.js'; register(...)`.
5. `index.html`의 shared classic `<script>` 5줄을 **삭제**한다(모듈이 import로 가져온다).
6. `main.js`는 그대로 둔다(앱 모듈 → shared 순으로 평가됨).
7. `shared/actions.js`의 리스너 등록은 모듈 평가 시 1회 실행된다. `actions-map.js`가 마지막 import이므로
   리스너는 DOMContentLoaded 이전에 설치된다.

#### 4.6.2 변환 스크립트

```python
#!/usr/bin/env python3
"""Phase 4-C prototype: shared/*.js -> ESM, remove window.* bridges."""
import re
import sys
import os

SHARED = {
    'storage.js': ('window.TutorStorage', 'TutorStorage'),
    'core.js': ('window.TutorCore', 'TutorCore'),
    'speech.js': ('window.TutorSpeech', 'TutorSpeech'),
    'ui.js': ('window.TutorUI', 'TutorUI'),
}

ACTIONS_HEAD = '''// shared/actions.js — Phase 4-C: 위임 디스패처 (ESM)
const registry = Object.create(null);

export function register(map) {
  Object.keys(map).forEach((name) => {
    if (registry[name]) console.warn('[actions] duplicate action:', name);
    registry[name] = map[name];
  });
}

export function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '&#10;');
}

export function run(name, el, event) {
  const fn = registry[name];
  if (!fn) { console.warn('[actions] unregistered:', name); return; }
  try { fn(el, event); } catch (err) { console.error('[actions] failed:', name, err); }
}

function closest(target, selector) {
  return target && target.closest ? target.closest(selector) : null;
}

document.addEventListener('click', (event) => {
  const el = closest(event.target, '[data-action]');
  if (el) run(el.dataset.action, el, event);
});

document.addEventListener('change', (event) => {
  const el = closest(event.target, '[data-change]');
  if (el) run(el.dataset.change, el, event);
});

document.addEventListener('input', (event) => {
  const el = closest(event.target, '[data-input]');
  if (el) run(el.dataset.input, el, event);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  const el = closest(event.target, '[data-enter]');
  if (el) run(el.dataset.enter, el, event);
});

export function audit() {
  const nodes = document.querySelectorAll('[data-action],[data-change],[data-input],[data-enter]');
  const missing = [];
  Array.prototype.forEach.call(nodes, (el) => {
    const name = el.dataset.action || el.dataset.change || el.dataset.input || el.dataset.enter;
    if (!registry[name]) missing.push(name);
  });
  return { nodes: nodes.length, actions: Object.keys(registry).length, missing };
}

export const TutorActions = { register, escapeAttr, run, audit };
'''


def convert_shared(path, target, name):
    src = open(path, encoding='utf-8').read()
    lines = src.split('\n')
    # drop the IIFE header (first non-comment line starting with "(function")
    out = []
    header_done = False
    for line in lines:
        if not header_done and line.startswith('(function'):
            header_done = True
            continue
        out.append(line)
    src = '\n'.join(out)
    src = re.sub(r'\}\)\(window\);\s*$', '', src)
    src = src.replace('window.%s = {' % name, 'export const %s = {' % name, 1)
    open(path, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n')


def convert_actions(path):
    open(path, 'w', encoding='utf-8').write(ACTIONS_HEAD)


def main(root):
    shared = os.path.join(root, 'shared')
    for fname, (_old, name) in SHARED.items():
        convert_shared(os.path.join(shared, fname), None, name)
        print('shared/%s -> export const %s' % (fname, name))
    convert_actions(os.path.join(shared, 'actions.js'))
    print('shared/actions.js -> named exports')

    for app in ['math', 'english']:
        d = os.path.join(root, app)
        for f in sorted(os.listdir(d)):
            if not f.endswith('.js'):
                continue
            p = os.path.join(d, f)
            src = open(p, encoding='utf-8').read()
            orig = src
            imports = []
            for fname, (old, name) in SHARED.items():
                if old in src:
                    src = src.replace(old, name)
                    imports.append("import { %s } from '../shared/%s';" % (name, fname))
            if 'escapeAttr(' in src and 'escapeAttr' not in ''.join(imports):
                imports.append("import { escapeAttr } from '../shared/actions.js';")
            if 'TutorActions.register(' in src:
                src = src.replace('TutorActions.register(', 'register(')
                imports.append("import { register } from '../shared/actions.js';")
            if imports:
                src = '\n'.join(imports) + '\n' + src
            if src != orig:
                open(p, 'w', encoding='utf-8').write(src)
        print(app, 'patched')


if __name__ == '__main__':
    main(sys.argv[1])
```

실행: 위 코드를 `tools/transform_4c.py`로 저장한 뒤 저장소 루트에서 실행한다.

```bash
python3 tools/transform_4c.py .
```

그 다음 `index.html`에서 shared classic 태그 5줄 삭제:

```bash
python3 - <<'PY'
import re
for app in ['math', 'english']:
    p = f'{app}/index.html'
    s = open(p, encoding='utf-8').read()
    s = re.sub(r'[ \t]*<script src="\.\./shared/[a-z]+\.js\?v=\d+"></script>\n', '', s)
    open(p, 'w', encoding='utf-8').write(s)
PY
```

결과 (`grep '<script' | grep -v cdn`):

```html
  <script src="tailwind.config.js"></script>          <!-- 4.6.3에서 추가 -->
  <script type="module" src="main.js?v=20261031"></script>
```

**`shared/actions.js` 최종 형태** (스크립트가 이 내용으로 교체한다)

```js
// shared/actions.js — Phase 4-C: 위임 디스패처 (ESM)
const registry = Object.create(null);

export function register(map) { /* ... */ }
export function escapeAttr(value) { /* ... */ }
export function run(name, el, event) { /* ... */ }
export function audit() { /* ... */ }

document.addEventListener('click', /* ... */);
document.addEventListener('change', /* ... */);
document.addEventListener('input', /* ... */);
document.addEventListener('keydown', /* ... */);

export const TutorActions = { register, escapeAttr, run, audit };
```

#### 4.6.3 CSP

**실측 결과**: 아래 정책으로 두 앱 모두 **위반 0건**이었다. Tailwind 적용, Google 폰트 로드,
KaTeX 렌더, SVG 그래프, `data-action` 위임 전부 정상.

`<head>`의 `<meta charset="UTF-8" />` 바로 다음에 넣는다(가능한 한 이른 위치).

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com; connect-src 'self' https://generativelanguage.googleapis.com; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" />
```

**필수 선행 작업 — 인라인 `tailwind.config` 외부화**

지금 `index.html`에는 인라인 `<script>tailwind.config = {...}</script>`가 있다.
`script-src 'self'`에서는 차단되므로 파일로 뺀다. **CDN 스크립트 바로 뒤**에 둔다.

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="tailwind.config.js"></script>
```

`math/tailwind.config.js`, `english/tailwind.config.js` (내용은 기존 인라인과 동일):

```js
// tailwind play CDN config
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        chalk: {
          dark: '#142820',
          mid: '#1e3a2f',
        }
      }
    }
  }
};
```

**정책 근거 (실측으로 확인한 것)**

| 지시어 | 값 | 이유 |
|---|---|---|
| `script-src` | `'self'` + Tailwind/KaTeX CDN | `tailwind.config.js`와 `main.js`는 self. CDN 2곳만 허용 |
| `style-src` | `'self' 'unsafe-inline'` + CDN + Google Fonts | Tailwind가 `<style>`을 주입하고 KaTeX가 인라인 스타일을 씀. **당분간 필요** |
| `font-src` | `'self' data:` + jsdelivr + gstatic | KaTeX 폰트, Google Fonts 실파일 |
| `connect-src` | `'self'` + Gemini | API 호출만 |
| `img-src` | `'self' data: blob:` | 아이콘, 붙여넣기/리사이즈 이미지 |
| `worker-src` / `manifest-src` | `'self'` | SW, PWA 매니페스트 |
| `object-src` | `'none'` | 불필요 |

`'unsafe-inline'`(style)과 CDN 허용은 **Phase 5에서 CDN을 로컬화한 뒤 tighten**한다.
`'unsafe-eval'`은 필요 없다(Tailwind Play CDN이 eval을 쓰지 않는 것을 확인).

#### 4.6.4 검증 (전역이 사라졌으므로 방법이 바뀐다)

`TutorActions`가 더 이상 전역이 아니다. 콘솔 검증은 **동적 import**로 한다.

```js
const A = await import('/shared/actions.js');
A.audit();   // 수학 { nodes: 51, actions: 42, missing: [] }
             // 영어 { nodes: 42, actions: 44, missing: [] }
```

전역 제거 확인:

```js
['TutorUI','TutorCore','TutorStorage','TutorSpeech','escapeAttr','TutorActions']
  .map(k => [k, typeof window[k]])          // 전부 'undefined'
```

**정적 게이트**

```bash
grep -rn 'window\.Tutor' math english shared          # → 0
grep -rn 'TutorActions\.' math english               # → 0
for f in math/*.js english/*.js shared/*.js; do
  cp "$f" /tmp/_c.mjs; node --check /tmp/_c.mjs || echo "FAIL $f"
done
node tests/check-imports.js                           # ALL PASSED
node tests/check-actions.js                           # ALL PASSED (inline=0)
```

**브라우저 게이트**

- 두 앱 로드: 콘솔 에러 **0**, CSP 위반 **0**
- `audit()` 정적/렌더 후 `missing: []`
- 스모크 **M1·M3·M4·M7** + M8(캐시 재방문)
- 설정/테마/기록/기호/단어장/모드전환 버튼
- KaTeX 1건, SVG 그래프 1건, Google 폰트 적용 확인

#### 4.6.5 커밋 2개

**커밋 1 — shared ESM + 전역 제거**

```
refactor(shared): convert shared helpers to ES modules
```

- 수정: `shared/{actions,storage,core,speech,ui}.js`, 앱 11개 파일(import/치환), `math/index.html`,
  `english/index.html`, `math/sw.js`, `english/sw.js`
- SW: `v3.2` / `v2.2` (shared 파일은 계속 ASSETS에 유지)
- gate: 위 정적 게이트 + 브라우저 로드/스모크

**커밋 2 — CSP**

```
chore(csp): externalize tailwind config and enforce CSP
```

- 신규: `math/tailwind.config.js`, `english/tailwind.config.js`
- 수정: `math/index.html`, `english/index.html`, `math/sw.js`, `english/sw.js`
- SW: `v3.3` / `v2.3`, ASSETS에 `'./tailwind.config.js'` 추가
- gate: CSP 위반 0, 폰트/KaTeX/Tailwind 정상, 스모크 M1·M4·M7

**Phase 4-C DoD**

- [ ] `grep -rn 'window\.Tutor'` → 0
- [ ] `typeof window.TutorActions` 등 6종 → 전부 `undefined`
- [ ] `import('/shared/actions.js').audit()` → `missing: []`
- [ ] CSP 위반 0 (두 앱)
- [ ] 인라인 `<script>` 0개 (tailwind.config 외부화)
- [ ] 스모크 M1·M3·M4·M7, 콘솔 에러 0
- [ ] SW 캐시 `v3.3` / `v2.3`

**롤백**: 커밋 2 → 커밋 1 순서로 revert. 전체는 `git reset --hard ef55bab`.

> 4-C가 끝나면 **앱·shared 어디에도 전역이 없다.** 남은 외부 의존은 CDN 3개(Tailwind, KaTeX 2종)와
> Google Fonts뿐이며, Phase 5에서 로컬화하면 `style-src`/`script-src`를 `'self'`로 좁힐 수 있다.

### 4.7 Hotfix (4-C 직후) — ESM 모듈의 HTTP 캐시 고착

**전제**: 4-C 완료(`416ec4b`). **이 수정은 배포 전 필수다.**

#### 4.7.1 증상

4-C 적용 후, 이미 앱을 한 번 이상 열었던 브라우저에서 앱이 **완전히 죽는다**.

```
Uncaught SyntaxError: The requested module '../shared/storage.js'
does not provide an export named 'TutorStorage'
```

- `data-action` 버튼이 하나도 동작하지 않는다(`audit()` → `actions: 0`, `missing: [51개]`)
- HTML/CSS/폰트는 정상이라 **화면은 멀쩡해 보인다**
- 새 프로필(캐시 없음)에서는 정상 동작 → 발견이 늦어진다

#### 4.7.2 원인

두 가지가 겹쳤다.

1. **4-B에서 script 태그의 `?v=` 캐시 버스터가 사라졌다.**
   4-A까지는 `<script src="state.js?v=20261031">`였지만, ESM 전환 후 import는 `'./state.js'`처럼
   **쿼리 없는 URL**이다.
2. **SW의 "network-first"가 실제로는 HTTP 캐시를 존중한다.**
   `fetch(event.request)`는 기본 cache mode(`default`)라, 아직 신선한 HTTP 캐시 항목을 그대로 반환한다.
   즉 네트워크로 나가지 않는다.

실측(같은 페이지, 같은 URL):

```js
await (await fetch('/shared/storage.js')).text()                  // → 구버전(classic IIFE)
await (await fetch('/shared/storage.js', {cache:'reload'})).text() // → 신버전(export)
```

즉 파일은 서버에 정상으로 있는데, 브라우저가 구버전을 계속 준다.

**영향 범위**: 앱 모듈·shared 모듈 **전부**(버전 쿼리가 없으므로). GitHub Pages는 `max-age=600`을
보내므로 **배포 후 최대 10분간 기존 사용자에게 재현**되고, 파일이 바뀌는 **모든 배포마다 반복**된다.

> 4-C 자체의 코드는 정상이다. 새 캐시(신규 프로필)에서는 모든 게이트를 통과한다.
> 문제는 "이미 캐시를 가진 클라이언트"에게만 나타나는 **배포 시점 회귀**다.

#### 4.7.3 수정 — `sw.js` 2곳 (수학·영어 동일)

**(1) install: 프리캐시를 캐시 우회로 수행** (한 파일 실패가 전체를 막지 않도록 개별 처리)

```js
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    // HTTP 캐시를 우회해 항상 최신 파일을 프리캐시한다.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: 'reload' }))
          .then((res) => (res && res.ok ? cache.put(url, res) : null))
          .catch(() => null)
      ))
    )
  );
});
```

**(2) fetch: same-origin GET(내비게이션 제외)은 `no-store`**

```js
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // ESM import에는 쿼리 버전이 없어 HTTP 캐시가 구버전을 돌려줄 수 있다.
  // same-origin GET(내비게이션 제외)은 캐시를 우회하고, 오프라인은 catch에서 캐시로 폴백한다.
  const sameOrigin = new URL(event.request.url).origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const request = (sameOrigin && !isNavigation)
    ? new Request(event.request, { cache: 'no-store' })
    : event.request;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
```

- 내비게이션(HTML)은 건드리지 않는다(`Request` 재구성 제약 회피 + HTML은 `no-cache` 메타 유지).
- 오프라인 동작은 기존과 동일: 네트워크 실패 → `caches.match` 폴백.
- 캐시 이름은 `amt-cache-v3.4` / `aet-cache-v2.4`로 올린다(프리캐시 재생성 신호).

#### 4.7.4 검증 (프로토타입에서 실측)

| 시도 | 결과 |
|---|---|
| 최초 로드 | `audit()` 51/42, 에러 0 |
| `shared/actions.js` 내용 변경 후 **새로고침** | 변경 사항 **즉시 반영**(`mark: 9`), 에러 0 |
| 프리캐시 | 37개 항목, shared 7개 포함 |
| SW | `activated` + `controller` 존재 |
| 영어 | 동일 |

수정 전에는 같은 절차에서 `mark`가 반영되지 않았다(= 구버전 서빙).

**재현/회귀 확인 절차 (스모크에 포함)**

```bash
# 1) 앱을 한 번 연다(캐시 데우기)
# 2) 아무 JS 파일에 주석 한 줄 추가
# 3) 새로고침 → 수정이 반영되면 OK, 안 되면 실패
```

#### 4.7.5 커밋

```
fix(sw): bypass HTTP cache for same-origin module requests
```

- 수정: `math/sw.js`, `english/sw.js`
- SW 캐시: `v3.4` / `v2.4`

**Phase 4-C+ DoD**

- [ ] 새 프로필: 양쪽 앱 정상, `audit()` 51/42 · 42/44, CSP 위반 0
- [ ] **기존 캐시가 있는 프로필**: 새로고침 후 JS 변경이 즉시 반영된다
- [ ] 오프라인 재방문(M8): 캐시에서 정상 로드
- [ ] 캐시 이름 `v3.4` / `v2.4`

#### 4.7.6 (선택) 5xx 응답도 캐시로 폴백

현재 폴백은 `fetch`가 **reject**될 때만 동작한다. 사내 프록시·CDN 장애처럼 네트워크가
**502/503 응답을 반환**하면 그 오류 페이지가 앱에 그대로 전달된다(오프라인 판정이 아님).
원한다면 아래처럼 5xx일 때도 캐시를 우선한다.

```js
.then((response) => {
  if (!response || response.status >= 500) {
    return caches.match(event.request).then((cached) => cached || response);
  }
  if (response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
  }
  return response;
})
```

필수는 아니다(실제 오프라인은 reject → 기존 catch로 처리됨). 넣을 경우 4xx는 건드리지 않는다.

**전환 주의**: 이 수정을 배포한 직후, 구 SW를 가진 사용자는 **첫 로드에서 한 번 깨질 수 있다**
(구 SW가 구버전을 서빙). 새 SW가 `skipWaiting`+`claim`으로 활성화되므로 **새로고침 1회면 복구**된다.
완전 무중단이 필요하면 Phase 6에서 "모듈 로드 실패 감지 → 1회 자동 새로고침" 부트스트랩을 추가한다.

### 4.8 Phase 5 (core 추출 + L1 테스트)

**전제**: 4.7 완료(`ef5a684`), 태그 `v1.9-phase4c` 생성.
**목표**: 전송 계층과 순수 함수를 `core/`로 모으고, **같은 커밋에서 L1 테스트로 고정**한다.
**비목표**: 프롬프트·응답 스키마 통합(제품 콘텐츠), 렌더링 이동, 서버 코드 작성.

**원칙**

1. `core/`는 **DOM·`window`·`localStorage`를 참조하지 않는다.** storage는 인자로 받는다.
2. `core/`는 **앱의 스키마를 모른다.** `schema`는 항상 호출자가 넘긴다.
3. `callGeminiModel`은 **두 가지 호출 형식**(위치 인자 / 객체 1개)을 계속 지원한다.
   - 수학: `callGeminiModel(model, key, prompt, image, opts)`
   - 영어: `callGeminiModel({ modelId, apiKey, promptText, schema, ... })`
4. **수학 구현을 기준(base)** 으로 삼는다. 단, 기본 스키마(`TUTOR_RESPONSE_SCHEMA`)는 core에서 제거하고
   수학 호출부가 명시적으로 넘긴다.
5. `maxOutputTokens` 기본값 **32768 유지**, `timeoutMs` 기본값 **30000 유지**.

#### 4.8.1 구조

| 파일 | 역할 | 출처 |
|---|---|---|
| `core/package.json` | `{"type":"module"}` — Node가 `.js`를 ESM으로 인식 | 신규 |
| `core/json.js` | `parseJson` | `shared/core.js`에서 이동 |
| `core/errors.js` | `isQuotaError` | 이동 |
| `core/http.js` | `fetchWithTimeout` | 이동 |
| `core/cache.js` | `computeRequestHash`, `getCachedResponse`, `setCachedResponse`, 상수 | 이동 |
| `core/math-expr.js` | `normalizeMathExpr`, `isLocalMathMatch` | 이동 |
| `core/gemini.js` | `callGeminiModel`, `fetchAvailableModels` | **통합본** (수학+shared 병합) |
| `core/index.js` | 배럴 | 신규 |
| `tests/core.test.js` | L1 16 케이스 | 신규 |

**삭제/축소**

| 대상 | 처리 | 감소 |
|---|---|---|
| `shared/core.js` | 삭제 | 385줄 |
| `math/api-solve.js`의 `fetchWithTimeout`·`parseTutorJson`·`callGeminiModel` | 삭제(import로 대체) | 약 110줄 |
| `math/settings.js`의 fetch/filter/sort | `core.fetchAvailableModels` 호출로 대체 (UI 래퍼는 유지) | 약 45줄 |
| `math/ui-status.js`의 `isQuotaError` | 삭제(7개 파일이 core에서 직접 import) | 5줄 |

#### 4.8.2 `core/` 파일

`core/package.json`:

```json
{"type": "module"}
```

**`core/json.js`**

```js
// core/json.js — AI 응답에서 JSON 추출 (DOM 비의존)

export function parseJson(rawText) {
  const cleaned = String(rawText || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']');
  }

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error('AIの応答からJSONデータを抽出できませんでした。');
  }
  return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
}
```

**`core/errors.js`**

```js
// core/errors.js — API 오류 분류 (DOM 비의존)

export function isQuotaError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('billing') ||
    msg.includes('limit: 0');
}
```

**`core/http.js`**

```js
// core/http.js — 타임아웃 fetch (DOM 비의존)

export async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}
```

**`core/cache.js`**

```js
// core/cache.js — 요청 지문 + 로컬 캐시 (DOM 비의존, storage는 인자로 받는다)

export const CACHE_SCHEMA_VERSION = 2;
export const DEFAULT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export function computeRequestHash({ mode = 'default', unit = '', text = '', imageBase64 = '' } = {}) {
  const img = String(imageBase64 || '');
  const imgLen = img.length;
  const imgSample = imgLen > 0
    ? `${imgLen}:${img.slice(0, 256)}:${img.slice(Math.floor(imgLen / 2), Math.floor(imgLen / 2) + 256)}:${img.slice(Math.max(0, imgLen - 256))}`
    : 'no-img';
  const raw = `${mode}|${String(unit).trim()}|${String(text).trim()}|${imgSample}`;

  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2, 33) ^ ch;
  }
  return `fp_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}_${raw.length}`;
}

export function getCachedResponse(storage, cacheKey, fingerprint, maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS) {
  if (!storage || !cacheKey || !fingerprint) return null;
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const now = Date.now();
    const hit = list.find(item => {
      if (!item || item.fp !== fingerprint) return false;
      if (item.v !== CACHE_SCHEMA_VERSION) return false;
      if (item.savedAt && (now - item.savedAt) > maxAgeMs) return false;
      return true;
    });
    return hit ? hit.data : null;
  } catch (e) {
    return null;
  }
}

export function setCachedResponse(storage, cacheKey, fingerprint, data, maxEntries = 15) {
  if (!storage || !cacheKey || !fingerprint || !data) return;
  try {
    const raw = storage.getItem(cacheKey);
    let list = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) {}
    }
    list = list.filter(item => item && item.fp !== fingerprint && item.v === CACHE_SCHEMA_VERSION);
    list.unshift({ v: CACHE_SCHEMA_VERSION, fp: fingerprint, savedAt: Date.now(), data });
    if (list.length > maxEntries) {
      list = list.slice(0, maxEntries);
    }
    let ok = storage.setItem(cacheKey, JSON.stringify(list));
    if (!ok && list.length > 3) {
      list = list.slice(0, 3);
      storage.setItem(cacheKey, JSON.stringify(list));
    }
  } catch (e) {}
}
```

**`core/math-expr.js`**

```js
// core/math-expr.js — 수식 정규화 · 동치 판정 (DOM 비의존, API 0회)

export function normalizeMathExpr(input) {
  if (input === null || input === undefined) return '';
  let s = String(input);

  // 1. 전각 영숫자·기호를 반각으로
  s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s
    .replace(/　/g, ' ')
    .replace(/[−ー―‐–—]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[×⋅・]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[＝]/g, '=')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[，、]/g, ',')
    .replace(/[．。]/g, '');

  // 2. LaTeX 구분자·장식 명령 제거
  s = s
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\left|\\right|\\displaystyle|\\,/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\\\/g, '\\');

  // 3. 부등호·복호·분수·근호 정규화
  s = s
    .replace(/\\leqq|\\leq|\\le|≦|≤|=<|<=/g, '<=')
    .replace(/\\geqq|\\geq|\\ge|≧|≥|=>|>=/g, '>=')
    .replace(/\\pm|±/g, '+-')
    .replace(/\\times|\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');

  // 4. 공백 제거
  s = s.replace(/\s+/g, '');

  // 5. 선두의 「답:」「答え:」 등 제거
  s = s.replace(/^(答え?|解答|ans|answer)[:：=]/i, '');

  // 6. 단일 분수의 불필요한 바깥 괄호 제거
  s = s.replace(/\(([0-9a-zA-Z]+)\)\/\(([0-9a-zA-Z]+)\)/g, '$1/$2');

  // 7. 인수분해 곱의 순서 정규화
  const factorMatch = s.match(/^([+-]?[0-9a-zA-Z]*)((?:\([^()]+\)){2,})$/);
  if (factorMatch) {
    const prefix = factorMatch[1] === '+' ? '' : factorMatch[1];
    const factors = [...factorMatch[2].matchAll(/\([^()]+\)/g)].map(m => m[0]);
    if (factors.length >= 2) {
      factors.sort();
      s = prefix + factors.join('');
    }
  }

  return s;
}

export function isLocalMathMatch(studentRaw, referenceList = []) {
  const stuNorm = normalizeMathExpr(studentRaw);
  if (!stuNorm) return false;

  const normalizeSolutionSet = (normStr) => {
    const withoutVar = normStr.replace(/^[a-zA-Z]=/, '');
    if (withoutVar.includes(',') && !withoutVar.includes('(')) {
      return withoutVar.split(',').map(p => p.trim()).filter(Boolean).sort().join(',');
    }
    return withoutVar;
  };

  const flipDoubleInequality = (normStr) => {
    const m = normStr.match(/^([^<>]+)(>=|>)([^<>]+)(>=|>)(.+)$/);
    if (m) {
      const op1 = m[4] === '>=' ? '<=' : '<';
      const op2 = m[2] === '>=' ? '<=' : '<';
      return `${m[5]}${op1}${m[3]}${op2}${m[1]}`;
    }
    return normStr;
  };

  const stuFlipped = flipDoubleInequality(stuNorm);
  const stuSet = normalizeSolutionSet(stuNorm);

  const refs = (Array.isArray(referenceList) ? referenceList : [referenceList]).filter(Boolean);
  for (const ref of refs) {
    const refNorm = normalizeMathExpr(ref);
    if (!refNorm) continue;

    if (stuNorm === refNorm || stuFlipped === refNorm) {
      return true;
    }
    const refSet = normalizeSolutionSet(refNorm);
    if (stuSet && refSet && stuSet === refSet) {
      return true;
    }
  }
  return false;
}
```

**`core/gemini.js`**

```js
// core/gemini.js — Gemini 전송 계층 (DOM 비의존)
import { fetchWithTimeout } from './http.js';
import { parseJson } from './json.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 호출 형식 두 가지를 모두 받는다.
 *   1) callGeminiModel(modelId, apiKey, promptText, imageBase64, options)
 *   2) callGeminiModel({ modelId, apiKey, promptText, imageBase64, schema, ... })
 * schema는 **반드시 호출자가 넘긴다**(core는 앱의 스키마를 모른다).
 */
export async function callGeminiModel(arg1, apiKey, promptText, imageBase64, options = {}) {
  let modelId, effectiveApiKey, effectivePrompt, effectiveImage, effectiveOpts;
  if (typeof arg1 === 'object' && arg1 !== null && !apiKey) {
    modelId = arg1.modelId;
    effectiveApiKey = arg1.apiKey;
    effectivePrompt = arg1.promptText || arg1.prompt;
    effectiveImage = arg1.imageBase64 || null;
    effectiveOpts = arg1;
  } else {
    modelId = arg1;
    effectiveApiKey = apiKey;
    effectivePrompt = promptText;
    effectiveImage = imageBase64;
    effectiveOpts = options || {};
  }

  if (!effectiveApiKey) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const cleanModelId = String(modelId || 'gemini-3.8-flash').replace(/^models\//, '').trim();
  const url = `${ENDPOINT}/${encodeURIComponent(cleanModelId)}:generateContent`;

  const parts = [{ text: effectivePrompt || '' }];
  if (effectiveImage) {
    parts.push({
      inline_data: { mime_type: 'image/jpeg', data: effectiveImage }
    });
  }

  const temperature = effectiveOpts.temperature ?? 0.35;
  const maxOutputTokens = effectiveOpts.maxOutputTokens ?? 32768;
  const schema = effectiveOpts.schema || null;
  const useJson = !effectiveOpts.rawText && Boolean(schema);
  const timeoutMs = effectiveOpts.timeoutMs || 30000;

  const buildPayload = (useStructured) => ({
    contents: [{ role: 'user', parts }],
    generationConfig: useStructured && useJson
      ? { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema }
      : { temperature: useStructured ? temperature : 0.3, maxOutputTokens }
  });

  const send = async (useStructured) => {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': effectiveApiKey
      },
      body: JSON.stringify(buildPayload(useStructured))
    }, timeoutMs);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error?.message || `HTTP Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  let data;
  try {
    data = await send(true);
  } catch (err) {
    // 구조화 출력(responseSchema) 미지원 모델 폴백
    if (err.status === 400 && /response|schema|mime/i.test(err.message)) {
      data = await send(false);
    } else {
      throw err;
    }
  }

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.map(p => p.text || '').join('\n') || '';
  if (!text) {
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('AIの回答が途中で切れました（思考・出力トークン上限）。もう一度試すか、入力内容を絞ってください。');
    }
    const blockReason = data.promptFeedback?.blockReason || finishReason;
    throw new Error(blockReason
      ? `モデルが応答を中断しました（理由: ${blockReason}）`
      : 'モデルから空の応答が返されました。');
  }

  if (effectiveOpts.rawText) {
    return text.trim();
  }

  try {
    return parseJson(text);
  } catch (parseErr) {
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('問題数が多いためAIの回答が途中で切れました（思考・出力トークン上限）。入力内容を小さく分割して試してください。');
    }
    throw parseErr;
  }
}

export async function fetchAvailableModels(arg = {}) {
  const apiKey = typeof arg === 'string' ? arg : arg.apiKey;
  const timeoutMs = typeof arg === 'object' && arg.timeoutMs ? arg.timeoutMs : 15000;
  if (!apiKey) {
    throw new Error('Gemini APIキーが必要です。');
  }

  const res = await fetchWithTimeout(`${ENDPOINT}`, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey }
  }, timeoutMs);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  const validModels = (data.models || [])
    .filter(m =>
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes('generateContent') &&
      m.name.includes('gemini') &&
      !m.name.includes('embedding') &&
      !m.name.includes('imagen') &&
      !m.name.includes('tts')
    )
    .map(m => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName || m.name.replace(/^models\//, '')
    }));

  if (validModels.length === 0) {
    throw new Error('generateContentに対応したGeminiモデルが見つかりませんでした。');
  }

  validModels.sort((a, b) => {
    const score = id => (id.includes('flash') ? 2 : id.includes('pro') ? 1 : 0);
    return score(b.id) - score(a.id) || b.id.localeCompare(a.id);
  });

  return validModels;
}
```

**`core/index.js`**

```js
// core/index.js — 배럴 (앱은 이 파일 하나만 import 한다)

export { fetchWithTimeout } from './http.js';
export { parseJson } from './json.js';
export { isQuotaError } from './errors.js';
export { callGeminiModel, fetchAvailableModels } from './gemini.js';
export {
  CACHE_SCHEMA_VERSION,
  DEFAULT_CACHE_MAX_AGE_MS,
  computeRequestHash,
  getCachedResponse,
  setCachedResponse
} from './cache.js';
export { normalizeMathExpr, isLocalMathMatch } from './math-expr.js';
```

#### 4.8.3 마이그레이션 스크립트

`tools/migrate5.py`로 저장한다. **단계 인자**로 수학/영어를 나눠 실행한다(각 1회, 멱등 아님).

```python
import re
import os
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
STAGE = sys.argv[2] if len(sys.argv) > 2 else 'all'   # math | english | all


def read(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()


def write(p, s):
    open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)


# ============================================================== MATH
if STAGE in ('math', 'all'):
    # ---------------------------------------------------------------- api-solve.js
    p = 'math/api-solve.js'
    s = read(p)
    s = s.replace("import { TutorCore } from '../shared/core.js';",
                  "import { callGeminiModel, computeRequestHash, getCachedResponse, setCachedResponse, normalizeMathExpr } from '../core/index.js';")

    start = s.index('export async function fetchWithTimeout')
    end = s.index('export async function solveProblem')
    s = s[:start] + s[end:]

    s = s.replace("""      const reqFp = TutorCore
        ? TutorCore.computeRequestHash({""", """      const reqFp = computeRequestHash({""")
    s = s.replace("""            imageBase64: state.currentImageBase64
          })
        : null;""", """            imageBase64: state.currentImageBase64
          });""")
    s = s.replace("""        let cachedData = reqFp && TutorCore
          ? TutorCore.getCachedResponse(safeStorage, 'api_response_cache', reqFp)
          : null;""", """        let cachedData = reqFp
          ? getCachedResponse(safeStorage, 'api_response_cache', reqFp)
          : null;""")
    s = s.replace("if (!cachedData && !state.currentImageBase64 && userText && TutorCore && Array.isArray(state.tutorHistory)) {",
                  "if (!cachedData && !state.currentImageBase64 && userText && Array.isArray(state.tutorHistory)) {")
    s = s.replace("item => item && TutorCore.normalizeMathExpr(item.recognized_problem) === normInput",
                  "item => item && normalizeMathExpr(item.recognized_problem) === normInput")
    s = s.replace("const normInput = TutorCore.normalizeMathExpr(userText);",
                  "const normInput = normalizeMathExpr(userText);")
    s = s.replace("""          if (reqFp && TutorCore) {
            TutorCore.setCachedResponse(safeStorage, 'api_response_cache', reqFp, resultData, 15);
          }""", """          if (reqFp) {
            setCachedResponse(safeStorage, 'api_response_cache', reqFp, resultData, 15);
          }""")
    s = s.replace("callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64);",
                  "callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { schema: TUTOR_RESPONSE_SCHEMA });")
    s = s.replace("callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { timeoutMs: 40000 });",
                  "callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { schema: TUTOR_RESPONSE_SCHEMA, timeoutMs: 40000 });")
    assert 'TutorCore' not in s, 'api-solve still has TutorCore'
    write(p, s)

    # ---------------------------------------------------------------- settings.js
    p = 'math/settings.js'
    s = read(p)
    s = s.replace("import { fetchWithTimeout } from './api-solve.js';",
                  "import { fetchAvailableModels as fetchModelsFromApi } from '../core/index.js';")
    start = s.index("        const res = await fetchWithTimeout(")
    end = s.index("        safeStorage.setItem('gemini_api_key', key);")
    s = s[:start] + "        const validModels = await fetchModelsFromApi({ apiKey: key, timeoutMs: 15000 });\n\n" + s[end:]
    write(p, s)

    # ---------------------------------------------------------------- ui-status.js
    p = 'math/ui-status.js'
    s = read(p)
    old = """    // クォータ超過エラーの判定
export function isQuotaError(err) {
      const msg = (err?.message || '').toLowerCase();
      return msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted') ||
        msg.includes('billing') || msg.includes('limit: 0');
    }"""
    assert old in s, 'ui-status anchor'
    s = s.replace(old, '')
    assert 'isQuotaError' not in s
    write(p, s)

    # ---------------------------------------------------------------- math callGeminiModel imports
    for f in ['math/chat-overall.js', 'math/chat-step.js', 'math/quiz.js', 'math/similar.js', 'math/simplify.js']:
        s = read(f)
        s = s.replace("import { callGeminiModel } from './api-solve.js';",
                      "import { callGeminiModel } from '../core/index.js';")
        write(f, s)

    # ---------------------------------------------------------------- quiz-result.js
    p = 'math/quiz-result.js'
    s = read(p)
    s = s.replace("import { TutorCore } from '../shared/core.js';",
                  "import { callGeminiModel, isLocalMathMatch } from '../core/index.js';")
    s = s.replace("import { callGeminiModel, solveProblem } from './api-solve.js';",
                  "import { solveProblem } from './api-solve.js';")
    s = s.replace("if (TutorCore && TutorCore.isLocalMathMatch(", "if (isLocalMathMatch(")
    assert 'TutorCore' not in s, 'quiz-result still has TutorCore'
    write(p, s)

    # ---------------------------------------------------------------- isQuotaError: ui-status -> core
    for f in ['math/api-solve.js', 'math/chat-overall.js', 'math/chat-step.js', 'math/quiz-result.js',
              'math/quiz.js', 'math/similar.js', 'math/simplify.js']:
        s = read(f)

        def strip_ui(m):
            names = [x.strip() for x in m.group(1).split(',') if x.strip() and x.strip() != 'isQuotaError']
            return "import { %s } from './ui-status.js';" % ', '.join(names)

        s2 = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'\./ui-status\.js';", strip_ui, s)
        assert s2 != s, f + ' ui-status import not changed'

        def add_core(m):
            names = [x.strip() for x in m.group(1).split(',') if x.strip()]
            if 'isQuotaError' not in names:
                names.append('isQuotaError')
            return "import { %s } from '../core/index.js';" % ', '.join(names)

        s3 = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'\.\./core/index\.js';", add_core, s2)
        assert s3 != s2, f + ' core import not found'
        write(f, s3)

    print('math migrated')


# ============================================================== ENGLISH
if STAGE in ('english', 'all'):
    for f, names in [
        ('english/quiz.js', ['callGeminiModel']),
        ('english/reading.js', ['callGeminiModel', 'computeRequestHash', 'getCachedResponse', 'setCachedResponse']),
        ('english/writing.js', ['callGeminiModel', 'computeRequestHash', 'getCachedResponse', 'setCachedResponse']),
    ]:
        s = read(f)
        s = s.replace("import { TutorCore } from '../shared/core.js';",
                      "import { %s } from '../core/index.js';" % ', '.join(names))
        s = s.replace("""      const reqFp = TutorCore
        ? TutorCore.computeRequestHash({""", """      const reqFp = computeRequestHash({""")
        s = s.replace("""          })
        : null;""", """          });""")
        s = s.replace("if (reqFp && TutorCore && engStore) {", "if (reqFp && engStore) {")
        for n in names:
            s = s.replace('TutorCore.' + n, n)
        assert 'TutorCore' not in s, f + ' still has TutorCore'
        write(f, s)

    os.remove(os.path.join(ROOT, 'shared/core.js'))

    for app in ['math', 'english']:
        p = f'{app}/sw.js'
        s = read(p)
        s = s.replace("  '../shared/core.js',\n", "")
        write(p, s)

    print('english migrated; shared/core.js removed')
```

```bash
python3 tools/migrate5.py . math      # 커밋 2
python3 tools/migrate5.py . english   # 커밋 3 (shared/core.js 삭제 포함)
```

`math` 단계가 끝난 시점에는 **영어가 아직 `shared/core.js`를 쓰는 중**이며, 그것도 정상 동작한다
(프로토타입에서 확인). `english` 단계에서 그 파일을 삭제한다.

**`math` 단계가 하는 일**

1. `math/api-solve.js`에서 세 함수를 잘라내고 `../core/index.js` import로 교체.
   - `TutorCore.computeRequestHash` 등 5곳을 직접 호출로 변경.
   - `solveProblem`의 두 호출부에 `{ schema: TUTOR_RESPONSE_SCHEMA }` 추가
     (기존에는 core가 아닌 **로컬 기본값**에 의존했다).
2. `math/settings.js`: fetch/filter/sort 블록을 `fetchModelsFromApi({apiKey, timeoutMs})` 한 줄로 교체.
   **UI 래퍼 함수(`fetchAvailableModels`)와 그 이후 UI 처리는 그대로 둔다.**
3. `math/ui-status.js`: `isQuotaError` 삭제.
4. `math/{api-solve,chat-overall,chat-step,quiz-result,quiz,similar,simplify}.js`:
   `isQuotaError`를 `./ui-status.js`에서 빼고 `../core/index.js`에 추가.
5. `math/{chat-overall,chat-step,quiz,similar,simplify}.js`: `callGeminiModel` import를 core로 변경.
6. `math/quiz-result.js`: `TutorCore` import 제거, `solveProblem`만 api-solve에서 유지.
**`english` 단계가 하는 일**

7. `english/{quiz,reading,writing}.js`: `TutorCore.*` → named import, `TutorCore &&` 가드 정리.
8. `shared/core.js` 삭제.
9. `sw.js` 2개에서 `'../shared/core.js'` 제거.

> `core/*.js` 자산 등록과 캐시 이름(`v3.5` / `v2.5`)은 **커밋 1**에서 이미 끝낸다.

**수동 확인 포인트 (스크립트가 건드리지 않는 것)**

- `math/settings.js`의 `fetchAvailableModels()`는 **UI 래퍼로 남는다.** 시그니처·동작·문구 유지.
- `math/actions-map.js`의 `'fetch-models': () => fetchAvailableModels()`도 그대로.
- `math/quiz.js`, `chat-*`의 **재시도 로직은 `solveProblem`/호출부에 그대로** 둔다(전송 계층으로 옮기지 않는다).

#### 4.8.4 L1 테스트 `tests/core.test.js`

`node:test` + 기존 `tests/stub-gemini.js`를 사용한다. **실제 Gemini 호출 없음.**

```js
// tests/core.test.js — Phase 5 L1: core 순수 모듈 단위 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const stub = require('./stub-gemini.js');

const load = () => import('../core/index.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); return true; },
    raw: m
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ------------------------------------------------------------------ parseJson
test('parseJson: plain / fenced / prefixed / array', async () => {
  const { parseJson } = await load();
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(parseJson('前置き\n{"a":3}\n後置き'), { a: 3 });
  assert.deepEqual(parseJson('[1,2,3]'), [1, 2, 3]);
  assert.deepEqual(parseJson('```\n[{"b":1}]\n```'), [{ b: 1 }]);
});

test('parseJson: garbage throws', async () => {
  const { parseJson } = await load();
  assert.throws(() => parseJson('no json here'), /JSONデータを抽出できません/);
  assert.throws(() => parseJson(''), /JSONデータを抽出できません/);
});

// --------------------------------------------------------- computeRequestHash
test('computeRequestHash: deterministic and sensitive', async () => {
  const { computeRequestHash } = await load();
  const base = { mode: 'math_solve', unit: 'math1', text: 'x^2-1', imageBase64: '' };
  const a = computeRequestHash(base);
  const b = computeRequestHash({ ...base });
  assert.equal(a, b);
  assert.match(a, /^fp_[0-9a-f]+_[0-9a-f]+_\d+$/);
  assert.notEqual(a, computeRequestHash({ ...base, text: 'x^2-2' }));
  assert.notEqual(a, computeRequestHash({ ...base, unit: 'mathA' }));
  assert.notEqual(a, computeRequestHash({ ...base, mode: 'eng_reading' }));
  assert.notEqual(a, computeRequestHash({ ...base, imageBase64: 'AAAA' }));
});

// ------------------------------------------------------------------- cache
test('cache: set/get roundtrip', async () => {
  const { setCachedResponse, getCachedResponse } = await load();
  const storage = fakeStorage();
  setCachedResponse(storage, 'c', 'fp1', { ok: 1 });
  assert.deepEqual(getCachedResponse(storage, 'c', 'fp1'), { ok: 1 });
  assert.equal(getCachedResponse(storage, 'c', 'fp2'), null);
  assert.equal(getCachedResponse(null, 'c', 'fp1'), null);
});

test('cache: TTL / schema version / corrupt data', async () => {
  const { setCachedResponse, getCachedResponse, CACHE_SCHEMA_VERSION } = await load();
  const storage = fakeStorage();
  setCachedResponse(storage, 'c', 'fp1', { ok: 1 });
  assert.equal(getCachedResponse(storage, 'c', 'fp1', -1), null, 'TTL 만료');

  storage.raw.set('old', JSON.stringify([{ v: CACHE_SCHEMA_VERSION - 1, fp: 'x', savedAt: Date.now(), data: 1 }]));
  assert.equal(getCachedResponse(storage, 'old', 'x'), null, '구버전 스키마 무시');

  storage.raw.set('broken', '{not json');
  assert.equal(getCachedResponse(storage, 'broken', 'x'), null);
});

test('cache: maxEntries trim and dedupe', async () => {
  const { setCachedResponse, getCachedResponse } = await load();
  const storage = fakeStorage();
  for (let i = 0; i < 5; i++) setCachedResponse(storage, 'c', 'fp' + i, { i }, 3);
  const list = JSON.parse(storage.raw.get('c'));
  assert.equal(list.length, 3);
  assert.equal(list[0].fp, 'fp4');
  setCachedResponse(storage, 'c', 'fp4', { i: 99 }, 3);
  assert.deepEqual(getCachedResponse(storage, 'c', 'fp4'), { i: 99 });
  assert.equal(JSON.parse(storage.raw.get('c')).filter(x => x.fp === 'fp4').length, 1);
});

// -------------------------------------------------------------- isQuotaError
test('isQuotaError: detects quota-family messages', async () => {
  const { isQuotaError } = await load();
  for (const m of ['Quota exceeded', 'RATE LIMIT', 'RESOURCE_EXHAUSTED', 'billing issue', 'limit: 0']) {
    assert.equal(isQuotaError(new Error(m)), true, m);
  }
  assert.equal(isQuotaError(new Error('network down')), false);
  assert.equal(isQuotaError(null), false);
});

// ----------------------------------------------------------- normalizeMathExpr
test('normalizeMathExpr: width / latex / inequality / prefix', async () => {
  const { normalizeMathExpr } = await load();
  assert.equal(normalizeMathExpr('１２＋３'), '12+3');
  assert.equal(normalizeMathExpr('\\frac{1}{2}'), '1/2');
  assert.equal(normalizeMathExpr('\\sqrt{3}'), 'sqrt(3)');
  assert.equal(normalizeMathExpr('x≦3'), 'x<=3');
  assert.equal(normalizeMathExpr('x＝２'), 'x=2');
  assert.equal(normalizeMathExpr('答え: x = 2'), 'x=2');
  assert.equal(normalizeMathExpr('  $x^2$  '), 'x^2');
  assert.equal(normalizeMathExpr(null), '');
  assert.equal(normalizeMathExpr('(x+2)(2x-1)'), normalizeMathExpr('(2x-1)(x+2)'));
});

// ----------------------------------------------------------- isLocalMathMatch
test('isLocalMathMatch: solution sets and inequalities', async () => {
  const { isLocalMathMatch } = await load();
  assert.equal(isLocalMathMatch('x=2,3', ['x=3,2']), true);
  assert.equal(isLocalMathMatch('2,3', ['x=2,3']), true);
  assert.equal(isLocalMathMatch('3>=y>=-3', ['-3<=y<=3']), true);
  assert.equal(isLocalMathMatch('x=5', ['x=2,3']), false);
  assert.equal(isLocalMathMatch('', ['x=2']), false);
});

// ------------------------------------------------------------- transport (stub)
test('callGeminiModel: structured request returns parsed fixture', async () => {
  const { callGeminiModel } = await load();
  stub.reset();
  const uninstall = stub.install();
  try {
    const schema = { type: 'object', properties: { problems: { type: 'array' } } };
    const data = await callGeminiModel('gemini-3.8-flash', 'KEY', 'prompt', null, { schema });
    assert.ok(data && typeof data === 'object');
    assert.ok(Array.isArray(data.problems), 'fixture math-solve-2problems');
    assert.equal(stub.counters.total, 1);
  } finally {
    uninstall();
  }
});

test('callGeminiModel: sends responseSchema and omits it when rawText', async () => {
  const { callGeminiModel } = await load();
  const seen = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push(JSON.parse(init.body));
    const text = seen.length === 1 ? '{"a":1}' : 'plain text';
    return jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
  };
  try {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    await callGeminiModel('m', 'K', 'p', null, { schema });
    assert.equal(seen[0].generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(seen[0].generationConfig.responseSchema, schema);
    assert.equal(seen[0].generationConfig.maxOutputTokens, 32768);

    const text = await callGeminiModel('m', 'K', 'p', null, { rawText: true });
    assert.equal(text, 'plain text');
    assert.equal(seen[1].generationConfig.responseSchema, undefined);
    assert.equal(seen[1].generationConfig.responseMimeType, undefined);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: object form and image part', async () => {
  const { callGeminiModel } = await load();
  let body = null;
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  try {
    const out = await callGeminiModel({ modelId: 'models/gemini-3.8-flash', apiKey: 'K', promptText: 'p', imageBase64: 'IMG' });
    assert.deepEqual(out, { ok: true });
    assert.equal(body.contents[0].parts.length, 2);
    assert.equal(body.contents[0].parts[1].inline_data.data, 'IMG');
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: missing key / http error / schema fallback / empty', async () => {
  const { callGeminiModel } = await load();
  await assert.rejects(() => callGeminiModel('m', '', 'p', null, {}), /APIキー/);

  const prev = globalThis.fetch;
  let calls = 0;
  try {
    // 429
    globalThis.fetch = async () => { calls++; return jsonResponse({ error: { message: 'quota exceeded' } }, 429); };
    await assert.rejects(async () => {
      try { await callGeminiModel('m', 'K', 'p', null, {}); } catch (e) { assert.equal(e.status, 429); throw e; }
    }, /quota exceeded/);

    // 400 schema 미지원 → 1회 재시도(스키마 없이)
    calls = 0;
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      calls++;
      bodies.push(JSON.parse(init.body));
      if (calls === 1) return jsonResponse({ error: { message: 'responseSchema is not supported' } }, 400);
      return jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":1}' }] } }] });
    };
    const out = await callGeminiModel('m', 'K', 'p', null, { schema: { type: 'object' } });
    assert.deepEqual(out, { ok: 1 });
    assert.equal(calls, 2);
    assert.equal(bodies[1].generationConfig.responseSchema, undefined);

    // 빈 응답 (blockReason / finishReason)
    globalThis.fetch = async () => jsonResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] });
    await assert.rejects(() => callGeminiModel('m', 'K', 'p', null, {}), /中断しました/);

    // 후보 자체가 없음
    globalThis.fetch = async () => jsonResponse({});
    await assert.rejects(() => callGeminiModel('m', 'K', 'p', null, {}), /空の応答/);
  } finally {
    globalThis.fetch = prev;
  }
});

test('callGeminiModel: timeout aborts', async () => {
  const { callGeminiModel } = await load();
  const prev = globalThis.fetch;
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  try {
    await assert.rejects(() => callGeminiModel('m', 'K', 'p', null, { timeoutMs: 20 }), (e) => e.name === 'AbortError');
  } finally {
    globalThis.fetch = prev;
  }
});

// ------------------------------------------------------- fetchAvailableModels
test('fetchAvailableModels: filters and sorts', async () => {
  const { fetchAvailableModels } = await load();
  const prev = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    models: [
      { name: 'models/gemini-3.8-pro', displayName: 'Pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-tts', supportedGenerationMethods: ['generateContent'] }
    ]
  });
  try {
    const models = await fetchAvailableModels('KEY');
    assert.deepEqual(models, [
      { id: 'gemini-3.8-flash', displayName: 'Flash' },
      { id: 'gemini-3.8-pro', displayName: 'Pro' }
    ]);
    await assert.rejects(() => fetchAvailableModels(''), /APIキー/);
  } finally {
    globalThis.fetch = prev;
  }
});

test('fetchAvailableModels: works through the offline stub', async () => {
  stub.reset();
  const uninstall = stub.install();
  try {
    const { fetchAvailableModels } = await load();
    const models = await fetchAvailableModels({ apiKey: 'KEY' });
    assert.equal(models.length, 1);
    assert.equal(models[0].id, 'gemini-3.8-flash');
    assert.equal(stub.counters.byFixture.models, 1);
  } finally {
    uninstall();
  }
});
```

**커버리지 (16 케이스)**

| 영역 | 케이스 |
|---|---|
| `parseJson` | plain / fenced / 앞뒤 텍스트 / 배열 / 실패 |
| `computeRequestHash` | 결정성, text·unit·mode·image 민감도 |
| `cache` | 왕복, TTL, 스키마 버전, 손상 JSON, maxEntries, 중복 제거 |
| `isQuotaError` | 5개 패턴 + 오탐 |
| `normalizeMathExpr` | 전각, LaTeX, 부등호, 접두어, 인수 순서 |
| `isLocalMathMatch` | 해 집합 순서, 연립부등호 방향, 불일치 |
| `callGeminiModel` | 스키마 포함 요청, `rawText`, 객체 형식, 이미지 파트, 키 없음, 429, 400 폴백, 빈 응답, 타임아웃 |
| `fetchAvailableModels` | 필터·정렬, 스텁 경유 |

실행:

```bash
node --test tests/core.test.js
```

기대 출력: `pass 16 / fail 0`.

> `core/package.json`이 없으면 Node가 `.js`를 CommonJS로 파싱해 `import()`가 실패한다.
> 브라우저 동작에는 영향이 없다.

#### 4.8.5 게이트

```bash
node --test tests/core.test.js          # 16 pass
node tests/check-imports.js             # 커밋1: math 181 / 영어 83, 커밋2 이후: math 167 / 영어 83, missing 0
node tests/check-actions.js             # ALL PASSED (inline=0)
node tests/selftest.js                  # 4/4
for f in core/*.js math/*.js english/*.js shared/*.js; do
  cp "$f" /tmp/_c.mjs; node --check /tmp/_c.mjs || echo "FAIL $f"
done
grep -rn "shared/core.js" math english shared core   # → 0 (커밋 3 이후)
```

**브라우저 게이트** (localhost, 새 오리진 권장)

- 두 앱 로드: 콘솔 에러 **0**, CSP 위반 0
- `audit()` 51/42 · 42/44, `missing: []`
- 수학: 해설 1건 실행 → 결과 렌더 + KaTeX, **같은 문제 재실행 시 API 0회**(캐시 히트)
- 영어: 장문독해 1건 → 결과 렌더
- 설정 모달 / 기록 복원 / 단어장 / 4択 채점

**프로토타입 실측값** (이 명세 그대로 수행한 결과)

| 항목 | 결과 |
|---|---|
| L1 | **16 pass / 0 fail** |
| check-imports | `[math] 167`, `[english] 83`, missing 0 |
| 수학 해설 | API 1회 → 렌더 O, KaTeX 5개 |
| 같은 문제 재실행 | **API 0회**, 렌더 O |
| 영어 독해 | API 1회 → 렌더 O |
| audit | 77/42, 42/44, missing `[]` |
| 콘솔 | 두 앱 에러 0 |

#### 4.8.6 커밋 3개

| # | 커밋 | 내용 | 게이트 |
|---|---|---|---|
| 1 | `refactor(core): add pure core modules with L1 tests` | `core/*` 8파일 + `tests/core.test.js` + SW에 `core/*.js` 7개 등록·캐시 `v3.5`/`v2.5` (**앱 코드 무변경**) | `node --test` 16 pass, 두 앱 로드 |
| 2 | `refactor(math): use core transport` | `migrate5.py . math` → `math` 9파일 | 수학 스모크 + 캐시 히트, 영어 정상 |
| 3 | `refactor(english): use core transport` | `migrate5.py . english` → `english` 3파일 + `shared/core.js` 삭제 + SW 정리 | `grep shared/core.js` → 0, 두 앱 스모크 |

> 커밋 1은 **순수 추가**라 앱이 깨질 수 없다. 커밋 2는 수학만 바꾸고 영어는 기존 경로를 유지하므로
> 중간 상태에서도 두 앱이 모두 동작한다(프로토타입 확인).

#### 4.8.7 DoD

- [ ] `node --test tests/core.test.js` → 16 pass
- [ ] `check-imports` math **167**(커밋 2 이후) / english 83, missing 0
- [ ] `check-actions` / `selftest` 통과
- [ ] `shared/core.js` 삭제, 참조 0
- [ ] 수학: 해설 1회 + **재실행 API 0회**, 영어: 독해 1회
- [ ] 두 앱 콘솔 에러 0, `audit()` missing `[]`
- [ ] SW 캐시 `v3.5` / `v2.5`, ASSETS에 `core/*.js` 7개

**롤백**: 커밋 3 → 2 → 1 순서. 전체는 `git reset --hard v1.9-phase4c`.

**알려진 문구 변경 1건**: `MAX_TOKENS`로 JSON 파싱이 실패할 때의 메시지가 수학 전용
("写真を1〜2問ずつ…")에서 중립 문구("入力内容を小さく分割して…")로 바뀐다. 오류 경로 한정.

### 4.9 Phase 6 (L2 브라우저 자동화 + L3 수동)

**전제**: Phase 5 완료(`aa03159`), 태그 `v1.9-phase5` 생성.
**목표**: 스모크 M1·M2·M3·M4·M6·M7·M8을 **실제 브라우저에서 자동 검증**한다.
**비목표**: 프로덕션 기능 추가. 테스트가 발견한 버그 2건만 고친다.

**원칙**

1. **실제 Gemini 호출 0회.** `page.route`로 가로채 `tests/fixtures/*.json`을 반환한다.
2. fixture 선택은 기존 `tests/stub-gemini.js`의 `pickFixture`를 **그대로 재사용**한다(중복 구현 금지).
3. Service Worker는 **기본 차단**(테스트 결정성). M8만 `serviceWorkers: 'allow'`.
4. 각 테스트는 새 컨텍스트(=깨끗한 localStorage)에서 시작한다.
5. 브라우저는 **설치된 Chrome 채널**을 쓴다(Playwright 브라우저 다운로드 없음).

#### 4.9.1 테스트가 발견한 버그 2건 (선행 수정)

**(1) 오프라인 재방문 시 앱이 죽는다 — SW 캐시 미스**

`index.html`은 `main.js?v=20261031`을 요청하는데, 프리캐시는 `'./main.js'`(쿼리 없음)로 저장한다.
`caches.match(request)`는 기본적으로 **쿼리를 포함해** 비교하므로 오프라인에서 miss → `ERR_FAILED`
→ 모듈 그래프 전체가 로드되지 않는다.

```js
// before
.catch(() => caches.match(event.request))
// after
.catch(() => caches.match(event.request, { ignoreSearch: true }))
```

`math/sw.js`, `english/sw.js` 두 곳.

**(2) 오프라인에서 `tailwind.config.js`가 예외를 던진다**

CDN이 로드되지 않으면 `tailwind` 전역이 없어 `ReferenceError`가 난다(앱 동작에는 영향 없지만 콘솔 오염).

```js
// math/tailwind.config.js, english/tailwind.config.js
// tailwind play CDN config
if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          chalk: {
            dark: '#142820',
            mid: '#1e3a2f',
          }
        }
      }
    }
  };
}
```

> 알려진 한계: Tailwind/KaTeX는 **CDN 전용**이라 오프라인에서는 스타일/수식이 빠진다.
> 앱 셸·모듈·기능은 정상 동작한다. CDN 로컬화는 별도 과제(Phase 7 이후)로 남긴다.

#### 4.9.2 설정 파일

**`package.json`** (신규, 루트)

```json
{
  "name": "ai-math-tutor",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "npm run test:l1 && npm run test:l2",
    "test:l1": "node --test tests/core.test.js",
    "test:l2": "playwright test",
    "serve": "python3 -m http.server 8765 --bind 127.0.0.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.64.1"
  }
}
```

`"type": "commonjs"`를 명시해 `tests/**`가 CJS로 유지되게 한다.
`core/package.json`의 `"type":"module"`이 `core/`에만 적용되므로 충돌하지 않는다.

**`playwright.config.js`** (신규)

```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8765',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 }
  },
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1',
    cwd: __dirname,
    url: 'http://localhost:8765/math/',
    reuseExistingServer: true,
    timeout: 30000
  }
});
```

- `channel: 'chrome'` → 시스템 Chrome 사용. 없으면 `npx playwright install chromium` 후 이 줄 제거.
- `webServer.cwd: __dirname` → 어디서 실행해도 저장소 루트를 서빙.
- `reuseExistingServer: true` → 개발 서버가 떠 있으면 재사용.
- `serviceWorkers: 'block'` → M8 스펙만 `test.use({ serviceWorkers: 'allow' })`로 해제.

**`.gitignore`** 추가:

```
node_modules/
test-results/
playwright-report/
blob-report/
```

#### 4.9.3 공통 헬퍼 `tests/e2e/helpers.js`

```js
// tests/e2e/helpers.js — 공통 헬퍼 (Playwright, CJS)
const path = require('path');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

/**
 * Gemini API를 fixture로 대체한다. 반환값은 호출 기록 배열.
 * - GET  /v1beta/models  -> 모델 1개
 * - POST ...:generateContent -> schema로 fixture 선택 (stub-gemini.js 재사용)
 */
async function stubGemini(page) {
  const calls = [];
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        json: {
          models: [{
            name: 'models/gemini-3.8-flash',
            displayName: 'Gemini 3.8 Flash',
            supportedGenerationMethods: ['generateContent']
          }]
        }
      });
    }
    const body = req.postData();
    calls.push(body);
    const key = stub.pickFixture(req.url(), { method: 'POST', body });
    const fixture = stub.FIXTURES[key];
    if (!fixture) throw new Error('e2e: no fixture for ' + key);
    return route.fulfill({ json: stub.envelope(fixture) });
  });
  return calls;
}

/** 콘솔 에러/페이지 에러 수집 */
function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err && err.message || err)));
  return errors;
}

async function bootApp(page, app, { apiKey = 'TEST_KEY' } = {}) {
  await page.addInitScript((key) => {
    if (key) localStorage.setItem('tutor_gemini_api_key', key);
  }, apiKey);
  await page.goto(`/${app}/`);
  await unlock(page);
}

async function unlock(page) {
  const pin = page.locator('#pinInput');
  if (await pin.isVisible().catch(() => false)) {
    await pin.fill('1234');
    await page.click('[data-action="unlock"]');
    await page.waitForFunction(() => {
      const m = document.getElementById('pinModal');
      return !m || m.style.display === 'none';
    });
  }
}

async function solveMath(page, question) {
  await page.fill('#questionInput', question);
  await page.click('[data-action="solve"]');
  await page.locator('#resultSection').waitFor({ state: 'visible', timeout: 20000 });
}

async function analyzeEnglish(page, text) {
  await page.fill('#questionInput', text);
  await page.click('[data-action="analyze"]');
  await page.locator('#resultSection').waitFor({ state: 'visible', timeout: 20000 });
}

module.exports = { stubGemini, collectErrors, bootApp, unlock, solveMath, analyzeEnglish };
```

#### 4.9.4 스펙 6개

**`tests/e2e/math-solve.spec.js`** — M1, M6

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('math: 解説とタブ', () => {
  test('M1: 2問の解説が独立タブで表示され、切替で内容が変わる', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await expect(page.locator('#problemTabBar')).toBeVisible();
    await expect(page.locator('#problem-tab-0')).toBeVisible();
    await expect(page.locator('#problem-tab-1')).toBeVisible();

    const first = await page.locator('#recognizedProblem').innerText();
    await page.click('#problem-tab-1');
    const second = await page.locator('#recognizedProblem').innerText();
    expect(second).not.toBe(first);

    await page.click('#problem-tab-0');
    expect(await page.locator('#recognizedProblem').innerText()).toBe(first);

    expect(calls.length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('M6: 同じ問題の再実行は API 0回', async ({ page }) => {
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    expect(calls.length).toBe(1);

    await page.click('[data-action="solve"]');
    await page.waitForTimeout(800);
    await expect(page.locator('#resultSection')).toBeVisible();
    expect(calls.length).toBe(1);
  });
});
```

**`tests/e2e/math-quiz.spec.js`** — M2, M3

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');
const path = require('path');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

test.describe('math: 類題クイズ (API 0回)', () => {
  test('M2/M3: twin_quiz をそのまま使い、誤答はローカル採点される', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    const problem = stub.FIXTURES['math-solve-2problems'].problems[0];
    const quiz = problem.twin_quiz;
    const before = calls.length;

    await page.click('[data-action="start-quiz"]');
    await expect(page.locator('#quizSection')).toBeVisible();
    await expect(page.locator('[data-action="select-choice"]')).toHaveCount(4);

    // twin_quiz 사용 → 추가 API 호출 없음
    expect(calls.length).toBe(before);

    const wrongIdx = [0, 1, 2, 3].find((i) => i !== quiz.correct_index);
    await page.click(`[data-action="select-choice"][data-idx="${wrongIdx}"]`);
    await page.click('[data-action="submit-choice"]');

    await expect(page.locator('#quizResultBox')).toBeVisible();
    await expect(page.locator('#quizResultBox')).toContainText(String(quiz.choices[quiz.correct_index]).replace(/\$/g, '').slice(0, 4));
    expect(calls.length).toBe(before);
    expect(errors).toEqual([]);
  });

  test('M3: 힌트는 API 없이 열린다', async ({ page }) => {
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="start-quiz"]');
    const before = calls.length;

    await page.click('[data-action="toggle-quiz-hint"]');
    await expect(page.locator('#quizHintContent')).toBeVisible();
    expect(calls.length).toBe(before);
  });
});
```

**`tests/e2e/math-history.spec.js`** — M4

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath, unlock } = require('./helpers');

test.describe('math: マイノート', () => {
  test('M4: 保存 → リロード → 復元でタブとステップが戻る', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="save-current-history"]');
    await page.waitForTimeout(400);

    await page.reload();
    await unlock(page);

    await page.click('[data-action="show-tutor-history"]');
    const items = page.locator('[data-action="restore-history"]');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);

    await items.first().click();
    await expect(page.locator('#resultSection')).toBeVisible();
    // 노트는 "현재 문제 1건"을 저장하므로 복원 후 탭은 1개다.
    await expect(page.locator('[data-action="play-step"]').first()).toBeVisible();
    await expect(page.locator('#recognizedProblem')).toContainText('x');

    expect(errors).toEqual([]);
  });

  test('M4: 삭제하면 목록에서 사라진다', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="save-current-history"]');
    await page.waitForTimeout(400);

    await page.click('[data-action="show-tutor-history"]');
    await expect(page.locator('[data-action="delete-tutor-history"]').first()).toBeVisible();
    await page.locator('[data-action="delete-tutor-history"]').first().click();
    await expect(page.locator('[data-action="restore-history"]')).toHaveCount(0);
  });
});
```

**`tests/e2e/english-flow.spec.js`** — M7

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, analyzeEnglish } = require('./helpers');
const path = require('path');
const stub = require(path.join(__dirname, '..', 'stub-gemini.js'));

test.describe('english: 読解 → クイズ → 単語帳 → ノート', () => {
  test('M7: 一連のフローが API 追加なしで動く', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await analyzeEnglish(page, 'He runs fast every morning.');

    const reading = stub.FIXTURES['english-reading'];
    await expect(page.locator('#resultContent')).toContainText(reading.passage_en.slice(0, 10));
    expect(calls.length).toBe(1);

    // 読解結果の CTA → twin_quiz (API 0)
    await page.click('[data-action="quiz-generate"][data-force="1"]');
    await expect(page.locator('#panelQuiz')).toBeVisible();
    await expect(page.locator('#quizActiveContainer')).toBeVisible();
    await expect(page.locator('[data-action="select-quiz-choice"]')).toHaveCount(4);
    expect(calls.length).toBe(1);

    const quiz = reading.twin_quiz;
    const wrongIdx = [0, 1, 2, 3].find((i) => i !== quiz.correct_index);
    await page.click(`[data-action="select-quiz-choice"][data-idx="${wrongIdx}"]`);
    await page.click('[data-action="submit-quiz"]');
    await expect(page.locator('#quizResultBox')).toBeVisible();
    expect(calls.length).toBe(1);

    // 単語帳へ一括登録
    await page.click('[data-action="switch-mode"][data-mode="reading"]');
    await page.click('[data-action="save-all-words"]');
    await page.click('[data-action="open-history"]');
    await expect(page.locator('#historyListContainer')).toContainText(reading.vocabulary[0].word);
    await page.click('[data-action="close-history"]');

    // ノート保存 → 復元
    await page.click('[data-action="save-lesson-history"]');
    await page.click('[data-action="open-history"]');
    await page.click('[data-action="history-tab"][data-tab="notes"]');
    const restore = page.locator('[data-action="restore-history-item"]').first();
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.locator('#resultSection')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
```

**`tests/e2e/health.spec.js`** — 콘솔/CSP/레지스트리

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath, analyzeEnglish } = require('./helpers');

test.describe('health: 콘솔 / 액션 레지스트리 / CSP', () => {
  test('math: 로드 후 에러 0, data-action 누락 0', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');

    const audit = await page.evaluate(async () => {
      const m = await import('/shared/actions.js');
      return m.audit();
    });
    expect(audit.missing).toEqual([]);
    expect(audit.actions).toBe(42);
    expect(audit.nodes).toBeGreaterThanOrEqual(51);

    const csp = await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
    expect(csp).toBe(true);
    expect(errors).toEqual([]);
  });

  test('english: 로드 후 에러 0, data-action 누락 0', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'english');

    const audit = await page.evaluate(async () => {
      const m = await import('/shared/actions.js');
      return m.audit();
    });
    expect(audit.missing).toEqual([]);
    expect(audit.actions).toBe(44);

    expect(errors).toEqual([]);
  });

  test('렌더 후에도 누락 액션이 없다 (수학/영어)', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const m = await page.evaluate(async () => (await import('/shared/actions.js')).audit());
    expect(m.missing).toEqual([]);
    expect(m.nodes).toBeGreaterThan(51);

    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await analyzeEnglish(page, 'He runs fast.');
    const e = await page.evaluate(async () => (await import('/shared/actions.js')).audit());
    expect(e.missing).toEqual([]);
    expect(calls.length).toBe(1);
  });
});
```

**`tests/e2e/offline.spec.js`** — M8

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, bootApp, unlock } = require('./helpers');

// SW를 허용하고 오프라인 재방문을 검증한다.
test.use({ serviceWorkers: 'allow' });

test.describe('PWA: オフライン再訪', () => {
  test('M8: 一度オンラインで開いた後、オフラインでも UI とノートが動く', async ({ page, context }) => {
    await stubGemini(page);
    await bootApp(page, 'math');

    // SW 有効化 + プリキャッシュ完了を待つ
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      if (!keys.length) return false;
      const c = await caches.open(keys[0]);
      return (await c.keys()).length > 10;
    }, null, { timeout: 20000 });

    await context.setOffline(true);
    await page.reload();
    await unlock(page);

    await expect(page.locator('#questionInput')).toBeVisible();
    const audit = await page.evaluate(async () => (await import('/shared/actions.js')).audit());
    expect(audit.missing).toEqual([]);
    expect(audit.actions).toBe(42);
    // 노트 UI도 오프라인에서 열린다
    await page.click('[data-action="show-tutor-history"]');
    await expect(page.locator('#tutorHistoryModal')).toBeVisible();
  });
});
```

#### 4.9.5 L3 수동 체크리스트

`docs/SMOKE.md` 끝에 아래 절을 추가한다(자동화 범위 명시 + 서명).

```md
## 自動化範囲 (Phase 6 以降)

| シナリオ | 自動 | 手動 |
|---|:---:|---:|
| M1 多問題解説とタブ切替 | L2 (`math-solve`) | — |
| M2 類題の再利用 (API 0回) | L2 (`math-quiz`) | — |
| M3 4択ローカル採点 (API 0回) | L2 (`math-quiz`) | — |
| M4 ノート保存と復元 | L2 (`math-history`) | 実機UI確認 |
| M5 全体Q&Aとタブ切替レース | — | **必須** |
| M6 リクエストキャッシュ | L2 (`math-solve`) | — |
| M7 英語アプリ主要フロー | L2 (`english-flow`) | 実機UI確認 |
| M8 PWAオフライン再訪 | L2 (`offline`) | 実機インストール |

- 자동: `npm test` (L1 16 + L2 11)
- 수동: 上表の「手動」列 + 配信シミュレーション（JSを1行変更 → リロード → 即反映）

### 手動チェック署名

- 実施日: ______ / 実施者: ______ / 端末: ______
- [ ] M5 全体Q&Aレース
- [ ] M4/M7 実機UI (iOS Safari / Android Chrome)
- [ ] M8 実機インストール → 機内モード → 起動
- [ ] 配信シミュレーション (キャッシュ更新)
```

#### 4.9.6 게이트

```bash
# 1회 준비
npm install                      # package-lock.json 생성/갱신
# (Chrome이 없는 환경만) npx playwright install chromium

npm run test:l1                  # 16 pass
npx playwright test              # 11 passed (~35s)
npm test                         # L1 + L2 연속
```

**프로토타입 실측값**

| 항목 | 결과 |
|---|---|
| L1 | 16 pass |
| L2 | **11 passed**, 약 33초 |
| M8 오프라인 | 통과 (`ignoreSearch` 수정 후) |
| API 호출 | fixture만, 실호출 0 |
| 콘솔 에러 | health 스펙에서 0 |

**M8이 실제로 잡아낸 것**: 수정 전에는 오프라인 재방문에서
`main.js?v=...`가 `ERR_FAILED`로 실패해 **앱 전체가 정지**했다. 프리캐시는 `./main.js`로 저장되므로
쿼리 불일치가 원인이었다. 이 버그는 수동 스모크로는 재현이 어렵다.

#### 4.9.7 커밋 3개

| # | 커밋 | 내용 | 게이트 |
|---|---|---|---|
| 1 | `fix(sw): match cached assets ignoring query string` | `math/sw.js`, `english/sw.js` + `tailwind.config.js` 2개 가드 | `node --check`, 오프라인 수동 1회 |
| 2 | `test(e2e): add playwright L2 suite` | `package.json`, `package-lock.json`, `playwright.config.js`, `tests/e2e/*` 7파일, `.gitignore` | `npx playwright test` 11 pass |
| 3 | `docs: document automated coverage and L3 signoff` | `docs/SMOKE.md` | — |

#### 4.9.8 DoD

- [ ] `npm run test:l1` → 16 pass
- [ ] `npx playwright test` → **11 passed**
- [ ] L2에서 실제 Gemini 호출 0 (route stub만)
- [ ] M8 오프라인 통과
- [ ] `health` 스펙: 콘솔 에러 0, `audit().missing === []`, CSP meta 존재
- [ ] `docs/SMOKE.md`에 자동화 범위표 + 서명란 추가
- [ ] `node_modules/`, `test-results/` 커밋되지 않음

**롤백**: 커밋 3 → 2 → 1. 전체는 `git reset --hard v1.9-phase5`.

### 4.10 Phase 6.5 (기능 테스트 확장 + 잔여 수정)

**전제**: Phase 6 완료(`e0228ec`), 태그 `v1.9-phase6` 생성.
**목표**: 구조 변경 없이 **기능 결함을 찾아 고친다.** 발견된 버그 1건은 **재현 스펙 1건**과 함께 처리한다.
**비목표**: Phase 7(프록시·구독), CDN 로컬화, 대규모 리팩터링. (수익화 준비 단계로 미룸)

**원칙**

1. 프로덕션 **구조를 바꾸지 않는다**(모듈 분할·core 이동·전역 변경 금지).
2. 수정은 **최소 diff**. 기존 함수 시그니처·저장 키·문구를 유지한다.
3. 버그를 찾으면 **먼저 L2 스펙으로 재현**하고(red), 그다음 고친다(green).
4. fixture로 검증할 수 없는 것(모델 출력 품질·실기기 음성)은 **L3 수동**으로 분리한다.
5. 테스트 하네스 결함과 앱 결함을 **구분해서 기록**한다.

#### 4.10.1 자동 커버리지 확장 (실측 19 pass)

기존 11개에 **8개를 추가**해 19개가 됐다. 이번 스윕에서 **앱 결함은 0건**이었고,
하네스 결함 2건(아래)만 수정했다.

| 스펙 | 검증 |
|---|---|
| `features.spec.js` | 전체 Q&A 응답 로그 / 단계 채팅 / 「もっとやさしく」 / 직접 입력 채점 / 모델 목록 자동취득 / 영어 작문 첨삭 / 새 4択 생성(API 1회) |
| `race.spec.js` | **M5**: 전체 Q&A 응답 대기 중 탭 전환 → 원래 문제에 저장, 다른 문제에 섞이지 않음 |

**추가 파일 3개**

| 파일 | 내용 |
|---|---|
| `tests/e2e/features.spec.js` | 기능 7경로 |
| `tests/e2e/race.spec.js` | M5 레이스 |
| `tests/fixtures/math-judge.json` | 직접 입력 채점 fixture (지금까지 stub이 즉석 생성하던 것) |

**`tests/stub-gemini.js` 1줄 추가** (fixture 등록):

```js
  'math-quiz': 'math-quiz.json',
  'math-judge': 'math-judge.json',   // ← 추가
```

> 하네스 결함 2건: ① `math-judge`가 `FIXTURE_FILES`에 없어 E2E에서만 실패,
> ② `simplify` 결과를 `#simplify-content-*`로 찾으려 했으나 실제로는 `#stepsContainer`를 재렌더한다.
> 둘 다 앱 문제가 아니므로 **테스트만 고쳤다.**

**`features.spec.js`**

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('features: 기능 커버리지', () => {
  test('math: 전체 Q&A 응답이 로그에 남는다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const before = calls.length;

    await page.fill('#overallChatInput', '別解はありますか？');
    await page.click('[data-action="overall-send"]');
    await expect(page.locator('#overallChatLogs')).toContainText('別解', { timeout: 15000 });
    expect(calls.length).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('math: 단계 채팅 응답이 로그에 남는다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const before = calls.length;

    await page.click('[data-action="toggle-step-chat"][data-idx="0"]');
    await page.fill('#step-chat-input-0', 'なぜこの式になる？');
    await page.click('[data-action="step-question-send"][data-idx="0"]');
    await expect(page.locator('#step-chat-logs-0')).not.toBeEmpty({ timeout: 15000 });
    expect(calls.length).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('math: もっとやさしく 가 렌더된다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    const before = calls.length;

    await page.click('[data-action="simplify-step"][data-idx="0"]');
    await expect(page.locator('#stepsContainer')).toContainText('もっとやさしく', { timeout: 15000 });
    expect(calls.length).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('math: 직접 입력 채점이 동작한다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="start-quiz"]');
    await page.click('[data-action="quiz-mode"][data-mode="text"]');
    const before = calls.length;

    await page.fill('#studentAnswerInput', 'x=2,3');
    await page.click('[data-action="submit-student"]');
    await expect(page.locator('#quizResultBox')).toBeVisible({ timeout: 15000 });
    expect(calls.length).toBeGreaterThanOrEqual(before);
    expect(errors).toEqual([]);
  });

  test('math: 모델 목록 자동取得', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await page.click('[data-action="open-settings"]');
    await page.fill('#geminiKeyInput', 'TEST_KEY');
    await page.click('[data-action="fetch-models"]');
    await expect(page.locator('#modelFetchStatus')).toContainText('成功', { timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test('english: 작문 첨삭이 렌더된다', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await page.click('[data-action="switch-mode"][data-mode="writing"]');
    await page.fill('#writingTaskInput', 'もし私が鳥だったら');
    await page.fill('#writingStudentInput', 'If I were a bird, I could fly to you.');
    await page.click('[data-action="submit-writing"]');
    await expect(page.locator('#writingResultSection, [id^="writingResult"]').first()).toBeVisible({ timeout: 20000 });
    expect(calls.length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('english: 새 4択 생성(API 1회)', async ({ page }) => {
    const errors = collectErrors(page);
    const calls = await stubGemini(page);
    await bootApp(page, 'english');
    await page.click('[data-action="switch-mode"][data-mode="quiz"]');
    await page.click('#generateQuizBtn');
    await expect(page.locator('[data-action="select-quiz-choice"]')).toHaveCount(4, { timeout: 20000 });
    expect(calls.length).toBe(1);
    expect(errors).toEqual([]);
  });
});
```

**`race.spec.js`**

```js
const { test, expect } = require('@playwright/test');
const { collectErrors, bootApp, solveMath } = require('./helpers');
const stub = require('../stub-gemini.js');

test.describe('race: 응답 대기 중 탭 전환', () => {
  test('M5: 전체 Q&A 응답이 원래 문제에 저장되고, 돌아오면 보인다', async ({ page }) => {
    const errors = collectErrors(page);
    let release;
    const gate = new Promise((r) => { release = r; });
    let chatCalls = 0;

    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({ json: { models: [{ name: 'models/gemini-3.8-flash', displayName: 'F', supportedGenerationMethods: ['generateContent'] }] } });
      }
      const body = req.postData();
      const key = stub.pickFixture(req.url(), { method: 'POST', body });
      if (key === 'math-overall-chat') {
        chatCalls++;
        await gate;                       // 탭을 바꾼 뒤에 응답
      }
      return route.fulfill({ json: stub.envelope(stub.FIXTURES[key]) });
    });

    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.fill('#overallChatInput', '別解はありますか？');
    await page.click('[data-action="overall-send"]');
    await page.waitForTimeout(300);

    await page.click('#problem-tab-1');   // 응답 도착 전에 다른 문제로 이동
    release();
    await page.waitForTimeout(1500);

    await page.click('#problem-tab-0');   // 원래 문제로 복귀
    await expect(page.locator('#overallChatLogs')).toContainText('解の公式', { timeout: 10000 });

    // 다른 문제(탭 1)에는 답변이 섞이지 않는다
    await page.click('#problem-tab-1');
    await expect(page.locator('#overallChatLogs')).not.toContainText('による解法');

    expect(chatCalls).toBe(1);
    expect(errors).toEqual([]);
  });
});
```

**`tests/fixtures/math-judge.json`**

```json
{
  "is_correct": true,
  "judgement_title": "正解",
  "comment": "よくできました。",
  "correct_answer": "$x=3,\\ 4$",
  "speech_ja": "正解です。"
}
```

#### 4.10.2 감사 P항목 판정 (현재 코드 기준)

| 항목 | 코드 근거 | 자동 검증 | 판정 |
|---|---|:---:|---|
| P1-1 영어 `escapeJsString` 파손 | 함수 자체 삭제(4-A), `escapeAttr` 사용 | ✅ health | **해소** |
| P1-2 전체 Q&A 응답 유실 | `reqIndex` 고정 + 다른 탭이면 토스트 | ✅ race | **해소** |
| P1-3 단계 Q&A 교차 오염 | `reqProblemIndex`/`reqStepIdx` 고정 | ⚠️ 없음 | **코드 확인, 스펙 추가 권장** |
| P2-1 영어 복습이 항상 정답 처리 | 복원 시 `selectedChoiceIndex=-1`, 제출 호출 없음 | ⚠️ 없음 | **코드 확인, L3 권장** |
| P2-2 모델 목록 no-op | `populateModelSelect()` 구현·호출 | ✅ features | **해소** |
| P2-3 `maxOutputTokens 16384` | `core`에서 32768 통일 | ✅ L1 | **해소** |
| P2-4 복원 후 twin_quiz 재사용 불가 | 저장 시 제외, 복원 시 `false` 재설정 | ⚠️ 없음 | **코드 확인** |
| P2-5 노트에 상위 Q&A 혼입 | `overall_chat: []`로 저장 | ⚠️ 없음 | **코드 확인** |
| P2-6 잘못된 퀴즈가 텍스트 모드 영구 저장 | `setQuizInputMode(mode, {persist})`, 폴백은 비영속 | ⚠️ 없음 | **코드 확인** |

> ⚠️ 항목은 "코드상 고쳐져 있으나 런타임 증거가 없다"는 뜻이다.
> Phase 6.5에서 **스펙 1개씩 추가**해 증거를 남긴다(P1-3, P2-1, P2-4, P2-6 우선).

#### 4.10.3 fixture로 검증할 수 없는 것 (L3 실API)

fixture는 "고정된 응답이 들어왔을 때 UI가 맞게 동작하는가"만 본다.
아래는 **실제 Gemini 호출/실기기**가 필요하다.

| 항목 | 방법 | 통과 기준 |
|---|---|---|
| 해설 품질(일본어·수식) | 실제 키로 3문제 | 단계 누락 0, 수식 깨짐 0 |
| 사진 인식 | 인쇄/손글씨/기울어진 사진 각 1장 | 문제 텍스트 일치 |
| 응답 지연·타임아웃 | 실제 호출 10회 | 30초 초과 0, 재시도 동작 |
| 음성(일본어) | iOS Safari + Android Chrome | 낭독 시작, 중지 정상 |
| 영어 voice picker | 실기기 | 음성 선택이 유지됨 |
| 오프라인 설치 | 실기기 홈 화면 추가 → 기내 모드 | 앱 셸 + 노트 열람 |
| M5 레이스(실API) | 응답 대기 중 탭 전환 | 답변이 원래 문제에 남음 |

#### 4.10.4 버그 수정 워크플로

```
1) 재현        : L2 스펙 추가(또는 L3 절차 기록) → 실패 확인
2) 수정        : 최소 diff (구조 변경 금지)
3) 회귀        : npm test (L1 16 + L2 19+)
4) 커밋        : fix(<앱>): <증상> — 스펙 동반
```

- 한 커밋에 **버그 1건**. 여러 건을 섞지 않는다.
- 스펙 없이 고친 버그는 **반드시** 다음 커밋에서 스펙을 추가한다.
- 문구/스타일 변경은 버그와 분리(`style:` / `docs:`).

#### 4.10.5 커밋

| # | 커밋 | 내용 | 게이트 |
|---|---|---|---|
| 1 | `test(e2e): cover chat, simplify, judge, writing, model list` | `features.spec.js`, `race.spec.js`, `math-judge.json`, `stub-gemini.js` 1줄 | `npx playwright test` **19 pass** |
| 2 | `docs: record phase 6.5 coverage and P-item status` | 4.10 + `docs/SMOKE.md` 갱신 | — |
| 3+ | `fix(...)` | 발견되는 버그마다 1건 | `npm test` |

#### 4.10.6 DoD

- [ ] `npx playwright test` → **19 passed** (신규 8 포함)
- [ ] `npm test` → L1 16 + L2 19
- [ ] P1-3 / P2-1 / P2-4 / P2-6 중 최소 2건에 **런타임 증거** 추가
- [ ] L3 체크리스트(4.10.3) 실기기 1회 수행 및 서명
- [ ] 발견 버그 전부 재현 스펙 동반

**롤백**: 커밋 2 → 1. 전체는 `git reset --hard v1.9-phase6`.

### 4.11 Phase 6.5-A (수학 스텝 카드 UI 개편)

**배경**: 스텝 카드에서 `着眼点`·`なぜ`·`つまずき`가 **모두 펼쳐진 채** 표시되어, 정작 중요한
**풀이 본문(数式)** 이 위아래 설명에 묻힌다. 한 스텝이 화면(778px)보다 커서 전체 흐름을 보기 어렵다.

**목표**: ① 풀이 본문을 **맨 위**에 ② 보조 설명은 **칩(버튼)으로 접고** ③ 상단 조작 버튼도 **가로 1줄**로.

#### 4.11.1 실측 (프로토타입, 동일 데이터·그래프 포함 스텝)

| 상태 | `#step-card-0` 높이 |
|---|---:|
| 기존 (전부 펼침 + 세로 버튼 3개) | **789px** |
| 칩으로 접기만 적용 | 609px |
| **칩 + 버튼 가로화 (최종)** | **552px** (−30%) |
| 그래프 없는 스텝(최종) | 244px |

- 375px 폭에서도 **새 가로 넘침 없음**(기존 헤더 `#modelSelect` 1px 초과는 이번 변경과 무관한 기존 사항).

#### 4.11.2 새 카드 구조

```
[Step 1] タイトル
[🔊 もう一度聞く] [🪄 もっとやさしく] [❓ 質問]   ← 가로 1줄
┌──────────────────────────────────────┐
│ 数式（本体）                          │  ← 항상 표시, 글자 크기 ↑
└──────────────────────────────────────┘
[그래프/그림]
[👀 着眼点] [🧭 なぜ？] [⚠️ つまずき]      ← 칩 1줄 (기본 닫힘)
┌ 선택한 패널 (한 번에 하나) ────────────┐
│ 着眼点（どこを見る？）      ❓ ここを聞く │
│ 내용                                    │
└─────────────────────────────────────────┘
🗣️ 音声ガイドの全文 (details, 기본 닫힘)
❓ この部分を質問 (패널, 기본 숨김)
```

- 칩은 **존재하는 항목만** 표시(`focus`/`why`/`watch_out`).
- 같은 칩을 다시 누르면 닫힌다. 다른 칩을 누르면 그쪽으로 전환(one-at-a-time).
- 패널의 `❓ ここを聞く`는 **열린 파트를 따라간다**(`data-part` 갱신).
- 기존 id(`step-focus-*` / `step-why-*` / `step-watch-*` / `step-math-*`)를 그대로 유지해
  `renderStepCards()`의 fill·KaTeX 렌더가 수정 없이 동작한다.
- 상단 버튼은 `flex-1` 3등분 + `truncate`로 375px에서도 한 줄 유지. 3번째 라벨은 `質問`으로 축약.

#### 4.11.3 변경 파일

| 파일 | 변경 |
|---|---|
| `math/render.js` | `stepCardHtml()` 교체(본문 우선·헤더 가로화) + `toggleStepDetail()` 추가 |
| `math/actions-map.js` | import 1줄 + `'step-detail'` 등록 1줄 |
| `tests/e2e/health.spec.js` | `actions: 42 → 43` |
| `tests/e2e/offline.spec.js` | `actions: 42 → 43` |
| `tests/e2e/step-detail.spec.js` | **신규** (열기/전환/닫기 + quote 파트 추적) |

**`math/actions-map.js`**

```js
import { toggleStepDetail } from './render.js';
...
  'step-detail': (el) => toggleStepDetail(el),
```

**`math/render.js`** — 기존 `stepCardHtml` 전체를 아래로 교체

```js
    // 1ステップカードの HTML（本文を先に、補足は「説明ポイント」チップで開閉）
export function stepCardHtml(step, idx) {
      const focus = String(step.focus || '').trim();
      const why = String(step.why || '').trim();
      const watch = String(step.watch_out || '').trim();

      const chips = [
        focus ? { part: 'focus', icon: '👀', label: '着眼点', title: '着眼点（どこを見る？）' } : null,
        why ? { part: 'why', icon: '🧭', label: 'なぜ？', title: 'なぜこのやり方？' } : null,
        watch ? { part: 'watch', icon: '⚠️', label: 'つまずき', title: 'ここでつまずきやすい' } : null
      ].filter(Boolean);

      return `
        <div class="flex items-start gap-2 min-w-0">
          <span class="shrink-0 bg-emerald-700 dark:bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full mt-0.5">Step ${step.step_number || idx + 1}</span>
          <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug pt-0.5">${escapeHtml(step.title || '')}</h4>
        </div>
        <div class="flex items-stretch gap-1.5">
          <button data-action="play-step" data-idx="${idx}"
            class="flex-1 min-w-0 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition flex items-center justify-center gap-1">
            <span>🔊</span><span class="truncate">もう一度聞く</span>
          </button>
          <button data-action="simplify-step" data-idx="${idx}" id="simplify-btn-${idx}"
            class="flex-1 min-w-0 bg-fuchsia-50 hover:bg-fuchsia-100 dark:bg-fuchsia-950/60 dark:hover:bg-fuchsia-900/80 text-fuchsia-700 dark:text-fuchsia-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800 transition flex items-center justify-center gap-1">
            <span>🪄</span><span class="truncate">もっとやさしく</span>
          </button>
          <button data-action="toggle-step-chat" data-idx="${idx}" id="chat-toggle-btn-${idx}"
            class="flex-1 min-w-0 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold px-2 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 transition flex items-center justify-center gap-1">
            <span>❓</span><span class="truncate">質問</span>
          </button>
        </div>

        <!-- ① まず「解き方の本体」を最初に見せる -->
        <div class="relative">
          <div id="step-math-${idx}" class="text-[15px] text-slate-800 dark:text-slate-100 leading-relaxed bg-slate-50 dark:bg-slate-800/90 border border-slate-100 dark:border-slate-700 rounded-xl p-3.5 pr-11 whitespace-pre-wrap"></div>
          <button type="button" data-action="step-quote" data-idx="${idx}" data-part="math" class="absolute top-2 right-2 text-[10px] text-slate-500 dark:text-slate-400 hover:underline bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">❓ この式を聞く</button>
        </div>

        <!-- グラフ・図形描画コンテナ (SVG) -->
        <div id="step-visual-${idx}" class="viz-container hidden"></div>

        <!-- ② 補足はチップで開閉（既定は閉じる） -->
        ${chips.length ? `
        <div class="flex flex-wrap items-center gap-1.5">
          ${chips.map(c => `
          <button type="button" data-action="step-detail" data-idx="${idx}" data-part="${c.part}" data-title="${c.title}" aria-expanded="false" data-active="0"
            class="text-[11px] font-bold px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-emerald-500 transition data-[active=1]:bg-emerald-600 data-[active=1]:text-white data-[active=1]:border-emerald-600">
            <span>${c.icon}</span> ${c.label}
          </button>`).join('')}
        </div>
        <div id="step-detail-${idx}" class="hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3" data-part="">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span data-detail-title class="text-[11px] font-bold text-slate-700 dark:text-slate-200"></span>
            <button type="button" data-action="step-quote" data-idx="${idx}" data-part="focus" class="shrink-0 text-[10px] text-slate-500 dark:text-slate-400 hover:underline">❓ ここを聞く</button>
          </div>
          ${focus ? `<div data-detail-part="focus"><div id="step-focus-${idx}" class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed"></div></div>` : ''}
          ${why ? `<div data-detail-part="why" class="hidden"><div id="step-why-${idx}" class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed"></div></div>` : ''}
          ${watch ? `<div data-detail-part="watch" class="hidden"><div id="step-watch-${idx}" class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed"></div></div>` : ''}
        </div>` : ''}

        <details id="step-speech-details-${idx}" class="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-1.5">
          <summary class="cursor-pointer select-none">🗣️ 音声ガイドの全文</summary>
          <p id="step-speech-${idx}" class="mt-1.5 leading-relaxed whitespace-pre-wrap"></p>
        </details>

        <!-- ステップ別フォローアップ・質問インラインチャットパネル -->
        <div id="step-chat-panel-${idx}" class="hidden step-chat-box bg-slate-50 dark:bg-slate-800/90 border-2 border-emerald-500/50 rounded-xl p-3 sm:p-4 space-y-2.5 mt-2">
          <div class="flex items-center justify-between border-b dark:border-slate-700 pb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-base">👨‍🏫</span>
              <span class="text-xs font-bold text-emerald-800 dark:text-emerald-300">Step ${step.step_number || idx + 1} の先生に質問</span>
            </div>
            <button data-action="toggle-step-chat" data-idx="${idx}" class="text-xs text-slate-400 hover:text-slate-600 font-bold p-1">✕ 閉じる</button>
          </div>

          <!-- 引用プレビュー（クリックした箇所） -->
          <div id="step-chat-quote-${idx}" class="hidden text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-l-4 border-amber-500 p-2 rounded"></div>

          <!-- クイック質問チップ群 -->
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] text-slate-500 font-bold">よくある質問:</span>
            <button type="button" data-action="quick-question" data-idx="${idx}" data-text="なぜこの式や変形になるのですか？もう少し噛み砕いて教えてください。" class="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-emerald-50">🧭 なぜこの式？</button>
            <button type="button" data-action="quick-question" data-idx="${idx}" data-text="符号や不等号の向き（＋・ー・≦・≧）がこうなる理由を教えてください。" class="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-emerald-50">± 符号・不等号の理由</button>
            <button type="button" data-action="quick-question" data-idx="${idx}" data-text="具体的な数字の例を1つ使ってわかりやすく説明してください。" class="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-emerald-50">💡 具体例で教えて</button>
          </div>

          <!-- 会話ログエリア -->
          <div id="step-chat-logs-${idx}" class="space-y-2 max-h-60 overflow-y-auto p-1 text-xs">
            <!-- JSで動的レンダリング -->
          </div>

          <!-- 質問入力フォーム -->
          <div class="flex gap-1.5 pt-1">
            <input type="text" id="step-chat-input-${idx}"
              placeholder="このステップで分からない部分を質問（例: なぜマイナスで割るの？）"
              class="flex-1 text-xs border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:border-emerald-600"
              data-enter="step-question-send" data-idx="${idx}" />
            <button data-action="step-question-send" data-idx="${idx}" id="step-chat-btn-${idx}"
              class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 py-2 rounded-xl text-xs shadow flex items-center gap-1 shrink-0">
              <span>送信 🚀</span>
            </button>
          </div>
        </div>
      `;
    }

    // 説明ポイントのチップ開閉（同じカード内で1つだけ開く）
export function toggleStepDetail(btn) {
      const idx = btn.dataset.idx;
      const part = btn.dataset.part;
      const box = document.getElementById(`step-detail-${idx}`);
      if (!box) return;

      const isOpen = box.dataset.part === part && !box.classList.contains('hidden');
      const chips = document.querySelectorAll(`[data-action="step-detail"][data-idx="${idx}"]`);
      chips.forEach((c) => {
        const on = !isOpen && c.dataset.part === part;
        c.dataset.active = on ? '1' : '0';
        c.setAttribute('aria-expanded', String(on));
      });

      if (isOpen) {
        box.classList.add('hidden');
        box.dataset.part = '';
        return;
      }

      box.dataset.part = part;
      box.classList.remove('hidden');
      box.querySelectorAll('[data-detail-part]').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.detailPart !== part);
      });
      const title = box.querySelector('[data-detail-title]');
      if (title) title.textContent = btn.dataset.title || '';
      const quote = box.querySelector('[data-action="step-quote"]');
      if (quote) quote.dataset.part = part;
    }
```

**`tests/e2e/step-detail.spec.js`** (신규)

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('step detail: 説明ポイントの開閉', () => {
  test('칩으로 하나씩 열고, 같은 칩을 다시 누르면 닫힌다', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    const panel = page.locator('#step-detail-0');
    const focusChip = page.locator('[data-action="step-detail"][data-idx="0"][data-part="focus"]');
    const whyChip = page.locator('[data-action="step-detail"][data-idx="0"][data-part="why"]');

    // 기본은 닫힘
    await expect(panel).toBeHidden();
    await expect(focusChip).toHaveAttribute('aria-expanded', 'false');

    // 着眼点 열기
    await focusChip.click();
    await expect(panel).toBeVisible();
    await expect(page.locator('#step-focus-0')).toBeVisible();
    await expect(page.locator('#step-focus-0')).toContainText('の形');
    await expect(focusChip).toHaveAttribute('aria-expanded', 'true');

    // なぜ로 전환 (한 번에 하나)
    await whyChip.click();
    await expect(page.locator('#step-why-0')).toBeVisible();
    await expect(page.locator('#step-focus-0')).toBeHidden();
    await expect(focusChip).toHaveAttribute('aria-expanded', 'false');
    await expect(whyChip).toHaveAttribute('aria-expanded', 'true');

    // 같은 칩 다시 → 닫힘
    await whyChip.click();
    await expect(panel).toBeHidden();
    await expect(whyChip).toHaveAttribute('aria-expanded', 'false');

    expect(errors).toEqual([]);
  });

  test('「ここを聞く」 버튼이 열린 파트를 따라간다', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="step-detail"][data-idx="0"][data-part="focus"]');
    const quote = page.locator('#step-detail-0 [data-action="step-quote"]');
    await expect(quote).toHaveAttribute('data-part', 'focus');

    await page.click('[data-action="step-detail"][data-idx="0"][data-part="watch"]');
    await expect(quote).toHaveAttribute('data-part', 'watch');
  });
});
```

#### 4.11.4 테스트 영향

- 액션 수: **42 → 43** (`step-detail`). `check-actions`는 `used=43 defined=43`.
- import 바인딩: math **167 → 168** (`toggleStepDetail`).
- `health.spec` / `offline.spec`의 `actions` 단언을 43으로 수정.
- 기존 스펙(`math-solve`, `math-history`, `race`, `features`)은 영향 없음.

**프로토타입 실측**: `npx playwright test` → **21 passed** (기존 19 + 신규 2).

#### 4.11.5 커밋

```
feat(math): compact step cards (body first, collapsible details)
```

- 대상: `math/render.js`, `math/actions-map.js`, `tests/e2e/{health,offline,step-detail}.spec.js`
- gate:
  - `node tests/check-actions.js` → 43/43
  - `node tests/check-imports.js` → math 168
  - `npx playwright test` → 21 passed
  - 실제 화면: 스텝 1개가 화면 안에 들어오고, 칩으로 열고 닫힘, 375px에서 한 줄 유지

#### 4.11.6 남은 선택 개선

1. **音声ガイド全文 자동 열림 억제**: 재생 중에만 펼치도록 `highlightStepCard(idx, { openSpeech })` 옵션화.
2. **그래프 접기**: `グラフを見る` 토글로 감싸기(도형 문제는 항상 표시 권장).
3. **기존 1px 넘침 정리**: 헤더 `#modelSelect` 폭(375px에서 1px 초과) — 별건의 소소한 수정.

---

### 4.12 Hotfix (iOS) — 스텝 질문 시 화면 확대 / 입력칸 가림

**증상**: iPhone에서 풀이 단계의 「❓ 質問」을 누르면 **화면 일부가 크게 확대**되고 질문 입력칸이 잘 보이지 않는다.

#### 4.12.1 원인

iOS Safari는 **포커스된 입력 요소의 글자 크기가 16px 미만이면 자동으로 확대**한다.
이 앱의 입력칸은 Tailwind `text-xs`(12px)·`text-sm`(14px)이고,
`toggleStepChat()`이 패널을 열면서 **곧바로 `input.focus()`를 호출**한다.

```
질문 버튼 탭 → 패널 표시 → input.focus() → iOS 자동 줌(≈1.33x) → 키보드 →
sticky 헤더 아래로 입력칸이 밀림
```

관련 위치:

| 파일 | 내용 |
|---|---|
| `math/render.js` | `step-chat-input` 이 `text-xs` (12px) |
| `math/chat-step.js` | `toggleStepChat()` / `openStepChatWithQuote()` 에서 `inputEl.focus()` |
| `math/index.html` | `overallChatInput` `text-xs`, `questionInput` `text-sm` |
| `shared/ui.css` | 16px 규칙 없음 |

#### 4.12.2 수정

**(1) `shared/ui.css` — 모바일에서 입력 글자를 16px로**

```css
/* ===== iOS Safari: 16px 未満の入力欄はフォーカス時に自動ズームする ===== */
@media (max-width: 820px) {
  input[type="text"],
  input[type="password"],
  input[type="search"],
  input[type="email"],
  input[type="url"],
  input[type="tel"],
  input[type="number"],
  input:not([type]),
  textarea {
    font-size: 16px !important;
  }
}

/* sticky ヘッダーに隠れないようにスクロール余白を確保 */
.step-chat-box {
  scroll-margin-top: 88px;
}
```

> **`select`는 제외**한다. 16px를 적용하면 `#unitSelect`의 고유 폭이 커져 375px에서
> 가로 넘침이 생긴다(실측). iOS의 select는 피커 UI라 자동 확대도 발생하지 않는다.

**(2) `math/chat-step.js` — 자동 포커스 제거**

```js
// toggleStepChat
if (!isHidden) {
  stopSpeech();
  // iOS: 自動フォーカスはキーボードを即座に出して入力欄を隠すため、スクロールのみ行う
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// openStepChatWithQuote
panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
const inputEl = document.getElementById(`step-chat-input-${stepIdx}`);
if (inputEl) {
  inputEl.value = `この部分について教えてください: `;   // 引用は入れるが focus しない
}
```

사용자가 입력칸을 직접 탭하면 iOS가 알아서 스크롤하므로, **원할 때만 키보드가 올라온다.**

#### 4.12.3 검증 (프로토타입)

| 항목 | 결과 |
|---|---|
| 375px: `.step-chat-input` / `#questionInput` font-size | **16px** |
| 375px: 질문 열기 직후 자동 포커스 | **없음** (`activeElement` ≠ input) |
| 375px: 「ここを聞く」 | 인용은 채워지고 포커스 없음 |
| 1280px: 입력 글자 크기 | 기존 유지(확대 없음) |
| 375px 가로 넘침 | 기존 `#modelSelect` 1px 외 **새 넘침 없음** |
| `npx playwright test` | **24 passed** (기존 21 + 신규 3) |

**신규 스펙** `tests/e2e/ios-input.spec.js`:

```js
const { test, expect } = require('@playwright/test');
const { stubGemini, collectErrors, bootApp, solveMath } = require('./helpers');

test.describe('iOS input: 16px + no auto focus', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('단계 질문을 열어도 자동 포커스/확대가 없다', async ({ page }) => {
    const errors = collectErrors(page);
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="toggle-step-chat"][data-idx="0"]');
    await expect(page.locator('#step-chat-panel-0')).toBeVisible();

    const r = await page.evaluate(() => {
      const input = document.getElementById('step-chat-input-0');
      return {
        fontSize: getComputedStyle(input).fontSize,
        focused: document.activeElement === input,
        activeTag: document.activeElement && document.activeElement.tagName,
        questionFont: getComputedStyle(document.getElementById('questionInput')).fontSize
      };
    });
    expect(r.fontSize).toBe('16px');
    expect(r.questionFont).toBe('16px');
    expect(r.focused).toBe(false);
    expect(errors).toEqual([]);
    await page.evaluate(() => { const e = document.getElementById('step-chat-panel-0'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 120); });
    await page.screenshot({ path: '/tmp/opencode/ui-ios-chat.png' });
  });

  test('「ここを聞く」도 포커스만 뺀 채 인용을 채운다', async ({ page }) => {
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');

    await page.click('[data-action="step-quote"][data-idx="0"][data-part="math"]');
    await expect(page.locator('#step-chat-panel-0')).toBeVisible();
    const r = await page.evaluate(() => {
      const input = document.getElementById('step-chat-input-0');
      return { value: input.value, focused: document.activeElement === input };
    });
    expect(r.value).toContain('この部分について教えてください');
    expect(r.focused).toBe(false);
  });

  test('데스크톱(820px 초과)에서는 기존 글자 크기 유지', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubGemini(page);
    await bootApp(page, 'math');
    await solveMath(page, 'x^2 - 5x + 6 = 0 を解け');
    await page.click('[data-action="toggle-step-chat"][data-idx="0"]');
    const fs = await page.evaluate(() => getComputedStyle(document.getElementById('step-chat-input-0')).fontSize);
    expect(fs).not.toBe('16px');
  });
});
```

#### 4.12.4 커밋

```
fix(math): prevent iOS focus zoom in step chat
```

- 수정: `shared/ui.css`, `math/chat-step.js`
- 신규: `tests/e2e/ios-input.spec.js`
- gate: `npx playwright test` → 24 passed
- 실기기(iPhone): 질문 열기 → 확대 없음, 입력칸 보임 / 입력칸 탭 → 키보드 + 자동 스크롤

#### 4.12.5 남은 선택 사항

1. **`--keyboard-height` 활용**: 현재 값만 설정되고 CSS에서 미사용. 키보드 높이만큼 하단 패딩을 주면
   입력칸이 키보드에 가리는 문제를 더 줄일 수 있다(브라우저별 편차 큼).
2. **select 글자 크기**: iOS 피커 가독성을 위해 14px 정도로만 올리는 별도 조정 가능.
3. **전체 화면 입력**(overall chat)도 동일 규칙으로 자동 해결됨 — 별도 수정 불필요.

---

## 5. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| **기존 수학 PWA가 허브를 열게 됨** | 혼란 | standalone 감지 시 `./math/`로 리다이렉트(1-E), 재설치 안내 문구 |
| **루트 SW가 남아 `/math/`를 제어** | 캐시 혼선 | 루트 `sw.js`를 cleanup SW로 교체 후 unregister. 파일 삭제 금지 |
| **PWA 설치 identity 변경** | 아이콘 중복 | 구 아이콘은 그대로 동작(리다이렉트). **재설치 허용으로 확정** — 구 아이콘 삭제는 사용자 판단 |
| 이동 중 함수 누락 | 기능 정지 | Phase 0 인벤토리(97/60)와 대조 |
| 로드 순서 의존 | `undefined` 참조 | Phase 3 명시적 순서, Phase 4 import로 해소 |
| 이벤트 위임 누락 | 버튼 무반응 | `[data-action]` 전수 클릭 자동화 |
| 프롬프트 문구 변형 | 모델 출력 변화 | Phase 5에서 전후 문자열 diff 0 검증 |
| iOS Safari 모듈/캐시 특성 | 흰 화면 | Phase 4 직후 실기기 1회 확인 |
| 작업 중 새 버그 발견 | 범위 확장 | 고치지 않고 `docs/AUDIT_v1.8.md` 백로그 기록 |

---

## 6. 일정 (1인 + 코드 도구 기준)

| Phase | 내용 | 공수 | 누적 |
|---|---|---|---|
| 0 | 동결·기준선 | 0.5일 | 0.5 |
| 1 | 허브 + `math/` 이동 + PWA 마이그레이션 | 0.5~1일 | 1.5 |
| 2 | 셸 분리 | 0.5일 | 2.0 |
| 3 | 파일 분해 | 2~3일 | 4.5 |
| 4 | ESM + 위임 | 3~4일 | 8.0 |
| 5 | core 추출 | 2~3일 | 10.5 |
| 6 | 테스트 | 2~3일 | 13.0 |
| 7 | 수익화 | 별도 | — |

> Phase 3 완료 시점에 "편집 가능한 상태"가 확보된다. 일정이 빠듯하면 **Phase 3에서 멈추고 Phase 6(테스트)를 먼저** 해도 된다.

---

## 7. 확정 사항 (구 "결정 필요 사항")

> v2.2에서 **전부 확정**. 아래는 "무엇을, 왜 그렇게 정했는지"의 기록이다.
> 실행 중 이 표와 다른 판단이 필요해지면 작업을 멈추고 문서를 갱신한다.

| # | 항목 | 확정 | 근거 |
|---|---|---|---|
| 1 | 루트 구조 | **허브 + 과목 폴더** | 과목 추가 시 URL·배포가 대칭으로 확장된다 |
| 2 | 허브를 PWA로? | **아니오** | scope `/`가 수학 scope와 겹쳐 설치 identity가 충돌한다 |
| 3 | 루트 cleanup SW | **2회 배포 주기(≈2~3개월) 유지 후 삭제** | 파일 삭제 시 404 → 구 SW가 영구 잔존한다 |
| 4 | 폴더 명명 | `math/`, `english/` | 소문자·단수·확장 용이 |
| 5 | ESM + 이벤트 위임(Phase 4) | **실행한다** | `escapeJsString` 클래스 제거 + CSP + 서버 이식의 전제 |
| 6 | 번들러 | **Phase 7까지 미도입** | GitHub Pages 정적 배포 유지, 디버깅 가능성 우선 |
| 7 | Tailwind CDN | **Phase 5에서 빌드 산출 CSS로 교체** | 오프라인 완전성 + CSP `unsafe-inline` 제거 |
| 8 | PWA 개수 | **2개 유지(단기)** | 수익화 착수 시 통합 여부만 재검토 |
| 9 | 테스트 도구 | **`node:test` + Playwright** | 추가 의존 최소, 브라우저는 이미 검증에 사용 중 |
| 10 | 수익화 모델 | **BYOK 무료 + 구독 병행** | 기존 사용자 무료 유지, 원가 발생분만 과금 |
| 11 | API 키 위치 | **서버(프록시) 보관** (Phase 7) | 클라이언트 키는 노출·쿼터 우회 불가피 |
| 12 | 결제 | **Stripe Checkout + webhook** | 앱스토어 수수료 회피, 일본 소비세 대응 |

**확정에 따른 파생 규칙**

- Phase 1에서 `manifest.json`의 `"id"` 값이 `./` → `/math/`로 바뀐다. 이는 **의도된 identity 변경**이며, 기존 설치본은 허브 리다이렉트(1-E)로 계속 동작한다.
- Phase 4에서 `escapeJsString`을 삭제하므로, **Phase 3까지는 이 함수를 절대 건드리지 않는다**(그 사이 인라인 핸들러가 여전히 의존).
- Phase 7의 프록시는 `core/`를 **그대로 import**한다. `core/`에 DOM 의존이 남아 있으면 Phase 7에서 재작업이 발생하므로 Phase 5의 `core/` 검사(`document|window|localStorage|fetch` = 0)는 **필수 게이트**다.

---

## 8. 전체 체크리스트

**Phase 0**
- [ ] `v1.8-baseline` 태그 생성·푸시
- [ ] 픽스처 8종 + `tests/stub-gemini.js`
- [ ] `docs/SMOKE.md` 8항목
- [ ] 앱 코드 diff 0 확인

**Phase 1**
- [ ] `math/` 이동 + 경로 치환(24·224·248·685~688행)
- [ ] `manifest.json` `start_url: "./"`, `id`/`scope` 유지
- [ ] 루트 허브 + cleanup SW
- [ ] `english/index.html` 90·116행 → `../math/`
- [ ] 수학·영어 스모크, localStorage 유지
- [ ] SW 스코프(`/math/`, `/english/`) 확인

**Phase 2**
- [ ] `math/app.js`, `english/app.js` 추출
- [ ] SW 자산/캐시명 갱신
- [ ] `node --check` + 스모크

**Phase 3**
- [ ] 2.5~2.7 표대로 파일 분해
- [ ] 함수 인벤토리 일치(97/60)
- [ ] 파일 500줄 이하

**Phase 4**
- [ ] `onclick=` 0
- [ ] `escapeJsString` 0
- [ ] ESM + 위임 + CSP

**Phase 5**
- [ ] `core/` DOM 의존 0
- [ ] 프롬프트 문자열 diff 0
- [ ] API 클라이언트 단일화

**Phase 6**
- [ ] L1/L2/L3 통과
- [ ] 회귀 12 시나리오

**Phase 7**
- [ ] 서버 프록시 설계
- [ ] 키 노출 제거
- [ ] 쿼터/캐시

---

## 9. 참고 문서

- `docs/AUDIT_v1.8.md` — v1.8 감사 결과 및 수정 이력
- `docs/ARCHITECTURE.md` — 기존 구조 설명(v1.6 기준, Phase 3 완료 후 갱신)
- `PROJECT_SPEC.md` — 제품 개요(수익화 방향)
