# 📘 高校数学I・A AI家庭教師 (AI Math Tutor) - プロジェクト開発仕様書

> **최종 갱신일**: 2026년 10월 25일 (버전: `v1.5-beta`)  
> **공개 배포 URL**: [https://g4pjo75-gif.github.io/ai-math-tutor/](https://g4pjo75-gif.github.io/ai-math-tutor/)  
> **GitHub 저장소**: [https://github.com/g4pjo75-gif/ai-math-tutor](https://github.com/g4pjo75-gif/ai-math-tutor)

---

## 1. 프로젝트 비전 및 개요 (Project Vision)

- **1차 목표 (현재 MVP 단계)**: 일본 고등학교 1학년 과정(数学I・数学A, 차트식 준거)에 맞춘 **따님 맞춤형 반응형 웹앱(PWA)** 완성
- **2차 목표 (향후 상용화 단계)**: Next.js + Supabase + Stripe 기반의 **일본 현지 고교생 대상 유료 구독형 SaaS** 정식 런칭
- **핵심 교육 철학**: 단순한 답안 제공이 아닌, 칠판 앞에서 선생님이 1:1로 지도하듯 **「착안점(어디를 볼까?) $\rightarrow$ 도구 선택(왜 이 공식인가?) $\rightarrow$ 단계별 풀이 $\rightarrow$ 쌍둥이 문제 직접 풀기(類題チャレンジ) & AI 자동 채점」** 구조를 제공

---

## 2. 하드웨어 및 개발 인프라 환경

- **개발/로컬 머신**: Mouse Computer (Intel Skylake / NVIDIA GeForce GTX 950M VRAM 2GB)
- **운영체제(OS)**: Ubuntu 24.04 LTS (클린 설치, NVIDIA 580 드라이버, 한글 ibus-hangul / 일본어 Mozc 세팅 완료)
- **아키텍처 전략**: 로컬 VRAM(2GB) 한계 극복을 위해, 무거운 로컬 LLM 대신 **클라우드 API(Gemini 3-Flash, Groq 등) + 로컬 CPU 연산(SymPy)**을 결합하는 가벼운 하이브리드 파이프라인 채택
- **호스팅/배포**: GitHub Pages (HTTPS 자동 적용으로 아이폰 카메라 권한 및 PWA 실행 완벽 지원)

---

## 3. ✅ [1단계 완료] 현재 구현된 핵심 기능 명세 (Phase 1)

| No | 기능명 | 세부 구현 내용 | 상태 |
|:---:|:---|:---|:---:|
| 1 | **Gemini API 안정화** | • `v1beta/models` API 기반 실시간 이용 가능 모델 자동 조회<br>• Custom Model ID 수동 입력 지원<br>• 25초 타임아웃(`AbortController`) & 혼잡 시 3초 후 1회 자동 재시도 로직 | ✅ 완료 |
| 2 | **복수 소문제 전수 인식** | • 사진 1장에 (1), (2), (3) 등 여러 소문제가 있을 때 임의 누락 없이 100% 전수 인식 프롬프트<br>• 결과 화면 상단에 `[📖 問題 (1) を表示] [📖 問題 (2) を表示]` 탭 전환 UI | ✅ 완료 |
| 3 | **수식 복원 & KaTeX 렌더링** | • JSON 역슬래시 증발 버그 자동 복구 (`1leqqxleqq4` $\rightarrow$ `$1 \leqq x \leqq 4$`)<br>• 일본 고교 표준 부등호 `\leqq`, `\geqq` KaTeX 매크로 등록으로 완벽 렌더링 | ✅ 완료 |
| 4 | **일본어 음성 낭독 & 카라오케 대본 싱크** | • Apple iOS 표준 고음질 일본어 음성(`Kyoko`, `Otoya`) 우선 매핑<br>• 낭독 중인 단계 카드로 화면 자동 스크롤 및 음성 대본 **형광펜 하이라이트(자막 싱크)**<br>• 진동 모드로 소리가 꺼져 있어도 눈으로 실시간 낭독 구간 확인 가능 | ✅ 완료 |
| 5 | **🎯 類題チャレンジ (직접 풀기 & AI 채점)** | • **스스로 풀기 모드**: 숫자/조건을 바꾼 쌍둥이 문제 출제 + 답안 입력창<br>• **힌트 아코디언**: 풀다가 막힐 때 착안점 힌트 열람 지원<br>• **AI 자동 채점**: 수학적 동치 판정, ⭕ 정답 칭찬 / ❌ 오답 시 원인 분석 힌트 제공<br>• **완전 해설 연동**: 오답 시 [完全なステップ解説を見る]로 즉시 칠판 해설 전환 | ✅ 완료 |
| 6 | **오답 노트 (`📁 マイノート`)** | • `localStorage` 기반 과거 해설 및 類題 정답 기록 영구 보관<br>• 상단 헤더 📁 버튼으로 언제든 다시 복습 및 모달 열람 | ✅ 완료 |
| 7 | **모바일 PWA & UI 최적화** | • 카메라 촬영 사진 Canvas 1280px 리사이즈/JPEG 압축 전송<br>• iOS Safari 홈 화면 추가 시 전체화면 네이티브 앱 실행 메타태그<br>• 전용 칠판 테마 앱 아이콘(`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`)<br>• 모바일 헤더 버튼 찌그러짐 방지(`whitespace-nowrap shrink-0`) | ✅ 완료 |
| 8 | **캐시 방지 & 버전 추적** | • `Cache-Control: no-cache` 메타태그 및 상단 노란색 뱃지(`β-Test v1.5`) 표기 | ✅ 완료 |

---

## 4. 🚀 [2단계 로드맵] 향후 추가 예정 기능 명세 (Phase 2)

이 사양서를 보면서 단계별로 기능을 확장해 나갑니다.

### 4.1. 🎙️ 캐릭터 AI 성우 시스템 탑재 (진동 모드 관통 음성)
- **배경**: 현재 내장 음성(Web Speech API)은 iOS 사양상 진동 모드 시 물리적으로 뮤트됨. 이를 극복하고 학습 흥미를 극대화하기 위해 완전한 MP3 오디오 스트림 도입.
- **방안 A (비용 0원 추천)**:
  - 일본 교육계 1위 오픈소스 캐릭터 성우 **VOICEVOX (즌다몬 / 시코쿠 메탄 / 카스카베 츠무기)**
  - 로컬 Ubuntu PC 또는 무료 클라우드(HuggingFace Spaces / Render)에 경량 CPU 도커 컨테이너 1회 배포 연동.
- **방안 B (상용화 종량제)**:
  - **OpenAI TTS (`tts-1`)** 일본어 성우 스트리밍 (문제당 약 6~10원 수준).

### 4.2. 💻 Next.js 14 + Supabase + Stripe 상용화 SaaS 전환
- **프론트엔드 모던화**: 단일 `index.html` 프로토타입에서 **Next.js 14 (App Router) + TypeScript + Tailwind CSS**로 구조 개편
- **백엔드/인증 (Supabase)**:
  - 학생 회원가입/로그인 (Google, Apple, LINE 소셜 로그인 연동)
  - PostgreSQL 클라우드 DB에 단원별 오답 노트, 풀이 시간, 취약점 데이터 동기화
- **결제 시스템 (Stripe)**:
  - 일본 엔화(JPY) 월간 구독 모델 (예: 월 980円 ~ 1,480円)
  - 무료 티어(하루 3문제) vs 프리미엄(무제한 풀이 + 類題 무제한 채점)

### 4.3. 🧮 로컬 Python SymPy 수식 검증 엔진 결합 (하이브리드 파이프라인)
- **목적**: LLM의 환각(Hallucination) 및 미세 계산 실수를 100% 방지
- **구조**:
  - Gemini가 파싱한 수식을 로컬 Python `sympy` 라이브러리로 대수적 정확성 즉시 검증
  - 학생 답안이 전개 형태이든 인수분해 형태이든 대수적 동치(`simplify(f - g) == 0`)를 0.01초 만에 CPU로 무결점 채점

### 4.4. 📊 AI 취약점 분석 & 학습 리포트
- 수학I (수와 식, 2차함수, 삼각비, 데이터 분석), 수학A (경우의 수, 확률, 도형, 정수) 단원별 정답률 통계
- "따님(학생)은 2차함수 축의 범위 경우 나누기에서 자주 실수합니다"와 같은 **주간 AI 학업 진단 리포트** 자동 발행

---

## 5. 파일 디렉터리 구조

```text
ai-math-tutor/
├── PROJECT_SPEC.md         # [본 문서] 전체 프로젝트 사양 및 개발 로드맵
├── index.html              # 현재 운영 중인 반응형 PWA 단일 웹앱 (v1.5-beta)
├── manifest.json           # PWA 웹 매니페스트
├── apple-touch-icon.png    # iOS 홈화면 전용 고해상도 앱 아이콘
├── icon-192.png            # PWA 아이콘 (192x192)
├── icon-512.png            # PWA 아이콘 (512x512)
├── .gitignore              # 백업 및 가상환경 제외 설정
└── backup/                 # 단계별 백업 아카이브 (타임스탬프)
```
