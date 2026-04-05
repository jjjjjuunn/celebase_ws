---
paths:
  - "services/**/*.ts"
  - "services/**/*.routes.ts"
---
# API Conventions & Architecture Rules

## Service Boundaries

| Service | Owns Tables | Can Call |
|---------|-------------|----------|
| user-service | users, bio_profiles, subscriptions | - |
| content-service | celebrities, base_diets, recipes, ingredients, recipe_ingredients | - |
| meal-plan-engine | meal_plans | user-service, content-service |
| commerce-service | instacart_orders | user-service, content-service, meal-plan-engine |
| analytics-service | daily_logs | user-service |

각 서비스는 자신의 DB 테이블만 직접 접근. 다른 서비스 데이터는 반드시 API 호출.

## Inter-Service Communication

- **동기**: HTTP (service mesh 내부, Kong 불경유)
- **비동기**: SQS (meal plan generation, order updates)
- **이벤트**: SNS → SQS fan-out
- **timeout**: 기본 5초, meal plan generation 30초
- **circuit breaker**: 외부 API (Instacart, Stripe) 호출에 필수

## API Design

- list: cursor-based pagination (`has_next` boolean, `total_count` 없음)
- nested resource 최대 2단계: `/celebrities/:slug/diets` (O)
- 3단계 이상: top-level로 분리 (`/recipes/:id`)
- PATCH: partial update (merge). PUT 사용 금지.
- 날짜/시간: ISO 8601 UTC
- 단일 응답 최대 1MB, 기본 페이지 20건, 최대 100건

## Error Response Standard

```typescript
// Wire format: { "error": <ApiError> } — 항상 "error" 키로 래핑하여 전송
interface ApiError {
  code: string;          // UPPER_SNAKE, machine-readable
  message: string;       // Human-readable (EN)
  details?: Array<{ field?: string; issue: string }>;
  requestId: string;     // correlation ID — 모든 에러 응답에 필수
}
```

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | 입력 검증 실패 |
| `UNAUTHORIZED` | 401 | 인증 실패/토큰 만료 |
| `FORBIDDEN` | 403 | 권한 부족 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `SUBSCRIPTION_REQUIRED` | 403 | 유료 기능 접근 |
| `PLAN_LIMIT_REACHED` | 429 | 월간 한도 초과 |
| `ALLERGEN_CONFLICT` | 422 | 알레르기 충돌 |
| `INSTACART_UNAVAILABLE` | 502 | 인스타카트 장애 |
| `GENERATION_FAILED` | 500 | AI 생성 실패 |
| `RATE_LIMITED` | 429 | 요청 빈도 초과 |

## Logging

```typescript
// DO: Structured logging
logger.error('Meal plan generation failed', {
  userId: user.id, baseDietId: input.baseDietId,
  error: err.message, stack: err.stack, requestId: ctx.requestId,
});
// DON'T: console.log('Error:', err);
```

**로그 금지 항목**: 비밀번호, 토큰, API 키, 건강 데이터 전체 덤프, 신용카드, 의료 상세.

## Third-Party Integration

### Instacart
- `commerce-service` 내부에서만 호출
- 캐싱: 카탈로그 24시간, 가격 1시간
- Rate limit 80% 이하, 장애 시 circuit breaker → PDF 쇼핑 리스트 fallback

### Stripe
- Webhook signature 검증 후 처리
- 멱등성 키 필수
- 구독 상태 변경은 webhook 기반 (클라이언트 신뢰 금지)

### AWS Cognito
- 토큰 검증 로컬 수행 (JWKS 캐싱)
- Refresh token rotation 활성화
