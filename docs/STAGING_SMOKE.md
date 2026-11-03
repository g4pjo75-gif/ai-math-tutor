# Staging Smoke Runbook (Phase 7-6-0)

> **対象**: Staging Worker (`ai-math-tutor-api-staging`) / Staging D1 (`ai-math-tutor-db-staging`)  
> **基準コミット**: Phase 7-6-0  
> **目的**: Production 환경(Worker, D1, Live Stripe)과 완전히 격리된 Staging 환경에서 배포, 라이선스 발급, 기기 바인딩, 프록시 호출, 포털 연동을 안전하게 검증하는 절차서.

---

## 1. 환경 및 격리 원칙

| 항목 | Staging | Production |
|---|---|---|
| **API Worker** | `https://ai-math-tutor-api-staging.g4pjo75.workers.dev` | `https://ai-math-tutor-api.g4pjo75.workers.dev` |
| **D1 DB** | `ai-math-tutor-db-staging` | `ai-math-tutor-db` |
| **Wrangler Config** | `server/wrangler.staging.jsonc` | `server/wrangler.jsonc` |
| **Stripe** | Test mode (`sk_test_...`) | Live mode |
| **LICENSE_SECRET** | Staging 전용 독립 비밀키 | Production 독립 비밀키 |
| **Gemini API Key** | Low budget / staging 전용 키 | Production 키 |

### 5대 절대 금지 규칙
1. Production D1에 staging 테스트 데이터를 넣거나 마이그레이션 명령을 실행하지 않는다.
2. Production Worker URL을 staging 테스트에 사용하지 않는다.
3. Secret 값(Gemini Key, Stripe Key, Webhook Secret, License Secret)을 로그나 채팅에 노출하지 않는다.
4. Gemini API 실제 호출은 staging 1회(검증용) 외에는 stub을 사용한다.
5. Live Stripe 카드로 결제하지 않는다(테스트 카드 `4242 ...`만 사용).

---

## 2. 스모크 절차 (Step-by-Step)

### Step 1. Staging Health 확인
```bash
curl -sS https://ai-math-tutor-api-staging.g4pjo75.workers.dev/health
# 기대 결과: {"ok":true,"version":"0.6.1","time":...}
```

### Step 2. Production 무변경 확인
```bash
curl -sS https://ai-math-tutor-api.g4pjo75.workers.dev/health
# 기대 결과: {"ok":true,"version":"0.6.0","time":...} (버전이 0.6.0 유지되어야 함)
```

### Step 3. Staging D1 마이그레이션 및 백업 확인
```bash
cd server
npm run d1:migrate:staging
npm run d1:backup:staging
```

### Step 4. Staging 테스트 라이선스 수동 발급
```bash
cd server
node scripts/new-license.mjs --remote --staging --email test@example.com --plan test --limit 10 --days 7
# 출력되는 AMT-XXXX-XXXX-XXXX-XXXX 키 확인
```

### Step 5. Production D1 격리 검증 (데이터 불변 확인)
```bash
cd server
npx wrangler d1 execute ai-math-tutor-db --remote -y --command "SELECT count(*) FROM licenses WHERE plan = 'test'"
# 기대 결과: count: 0 (운영 DB에 staging 데이터가 없어야 함)
```

### Step 6. `/v1/redeem` 기기 바인딩 검증
```bash
curl -sS -X POST https://ai-math-tutor-api-staging.g4pjo75.workers.dev/v1/redeem \
  -H "Content-Type: application/json" \
  -d '{"key":"<발급된_키>","deviceId":"staging-device-01"}'
# 기대 결과: {"ok":true,"plan":"test","status":"active",...}
```

### Step 7. `/v1/me` 조회 및 기기 불일치 403 검증
```bash
# 정상 기기 조회:
curl -sS https://ai-math-tutor-api-staging.g4pjo75.workers.dev/v1/me \
  -H "Authorization: Bearer <발급된_키>" \
  -H "X-Device-Id: staging-device-01"
# 기대 결과: {"ok":true,"quota":{"used":0,"limit":10,...}}

# 미등록 기기 조회 (403):
curl -sS https://ai-math-tutor-api-staging.g4pjo75.workers.dev/v1/me \
  -H "Authorization: Bearer <발급된_키>" \
  -H "X-Device-Id: wrong-device"
# 기대 결과: {"ok":false,"error":"device_not_bound"} (HTTP 403)
```

### Step 8. `/v1/solve` 프록시 실제 호출 검증 (1회)
```bash
curl -sS -X POST https://ai-math-tutor-api-staging.g4pjo75.workers.dev/v1/solve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <발급된_키>" \
  -H "X-Device-Id: staging-device-01" \
  -d '{"prompt":"2x + 3 = 7 을 풀어줘","rawText":true}'
# 기대 결과: {"ok":true,"data":"...","usage":{"in":...,"out":...},"quota":{"used":1,...}}
```

### Step 9. Stripe Customer Portal 검증
```bash
curl -sS -X POST https://ai-math-tutor-api-staging.g4pjo75.workers.dev/v1/portal \
  -H "Authorization: Bearer <발급된_키>"
# 고객 ID가 없는 수동 발급 라이선스인 경우: {"ok":false,"error":"no_customer"} (HTTP 400)
```

---

## 3. 남은 과제 (Phase 7-6-1로 이관)
- **Staging Site Public URL 연결**:
  Cloudflare Pages Preview 브랜치(`staging`) 또는 별도 Pages 배포 후 `wrangler.staging.jsonc`의 `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL`에 반영하여, Stripe Checkout 웹 결제창 진입 및 `thanks.html` 리다이렉트 자동 발급 전체 플로우를 브라우저 샌드박스에서 완주한다.
