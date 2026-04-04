# CLAUDE.md — CelebBase Wellness Development Guardrails

> 이 문서는 모든 Generator/Evaluator 에이전트가 코드를 작성하기 전에 반드시 읽고 준수해야 하는 규칙이다.
> spec.md와 함께 읽되, 충돌 시 CLAUDE.md가 우선한다.

---

## 1. Project Identity

- **Name**: CelebBase Wellness
- **Type**: B2C 프리미엄 웰니스 플랫폼
- **Architecture**: PGE Harness (Planner-Generator-Evaluator)
- **Monorepo**: pnpm workspaces + Turborepo
- **Primary Language**: TypeScript (services, clients), Python (AI engine only)

---

## 2. Absolute Rules (절대 규칙)

이 규칙은 예외 없이 반드시 지킨다. 위반 시 Evaluator는 무조건 reject한다.

### 2.1 보안

- **절대 하드코딩하지 않는다**: API 키, 시크릿, 비밀번호, 토큰을 코드에 직접 넣지 않는다. 반드시 환경 변수(`process.env`, `os.environ`)를 사용한다.
- **SQL injection 방지**: Raw SQL 문자열 결합 금지. 반드시 parameterized query 또는 ORM을 사용한다.
- **사용자 입력은 항상 검증한다**: Zod(TS) 또는 Pydantic(Python)으로 모든 API input을 validation한다.
- **건강 데이터는 암호화한다**: `bio_profiles` 테이블의 `biomarkers`, `medical_conditions`, `medications` 필드는 application-level AES-256 암호화 후 저장한다.
- **CORS 화이트리스트**: 와일드카드(`*`) 금지. 명시적 도메인만 허용한다.
- **JWT 검증**: 모든 보호 엔드포인트에서 Cognito JWT signature + expiry + audience를 반드시 검증한다.

### 2.2 데이터 무결성

- **soft delete만 사용한다**: 모든 주요 엔티티는 `deleted_at` 컬럼으로 soft delete 처리한다. `DELETE` SQL문 직접 실행 금지.
- **마이그레이션 필수**: DB 스키마 변경은 반드시 `db/migrations/` 에 마이그레이션 파일로 작성한다. 직접 ALTER TABLE 금지.
- **UUID v7 사용**: 모든 primary key는 시간순 정렬이 가능한 UUID v7 (`gen_random_uuid()` 대신 앱 레벨에서 생성 권장)을 사용한다.
- **JSONB 스키마 문서화**: JSONB 컬럼을 추가하거나 수정할 때, 반드시 해당 필드의 TypeScript 타입을 `packages/shared-types/`에 함께 정의한다.

### 2.3 코드 품질

- **`any` 타입 금지**: TypeScript에서 `any` 사용 금지. 불가피한 경우 `unknown` + type guard를 사용한다.
- **`console.log` 금지**: production 코드에서 `console.log` 직접 사용 금지. 프로젝트 로거(`@celebbase/logger`)를 사용한다.
- **에러 삼키기 금지**: `catch (e) {}` 형태의 빈 catch 블록 금지. 최소한 로깅한다.
- **하나의 함수, 하나의 책임**: 함수 길이 50줄 초과 시 분리를 고려한다.
- **Magic number 금지**: 숫자 리터럴은 named constant로 추출한다. (예: `const MAX_MEAL_PLANS_PER_MONTH = 4`)

---

## 3. Coding Standards

### 3.1 TypeScript (Services + Clients)

```typescript
// ✅ DO: Explicit return types on exported functions
export async function getUserBioProfile(userId: string): Promise<BioProfile> { ... }

// ❌ DON'T: Implicit any or missing return type
export async function getUserBioProfile(userId) { ... }

// ✅ DO: Zod schema for API input validation
const CreateMealPlanSchema = z.object({
  baseDietId: z.string().uuid(),
  durationDays: z.number().int().min(1).max(30),
  preferences: z.object({
    maxPrepTimeMin: z.number().int().optional(),
    budgetLevel: z.enum(['budget', 'moderate', 'premium']).optional(),
  }).optional(),
});

// ✅ DO: Discriminated union for API responses
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// ✅ DO: Barrel exports from index.ts
// services/user-service/src/routes/index.ts
export { userRoutes } from './user.routes';
export { bioProfileRoutes } from './bio-profile.routes';
```

**Naming Conventions:**

| Type | Convention | Example |
|------|-----------|---------|
| File (component) | PascalCase | `CelebrityCard.tsx` |
| File (utility) | camelCase | `nutritionCalculator.ts` |
| File (route) | kebab-case | `bio-profile.routes.ts` |
| Variable/Function | camelCase | `calculateTdee()` |
| Constant | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Type/Interface | PascalCase | `MealPlan`, `BioProfile` |
| Enum | PascalCase (member도) | `ActivityLevel.VeryActive` |
| DB column | snake_case | `created_at` |
| API endpoint | kebab-case | `/bio-profile` |
| Env variable | UPPER_SNAKE | `DATABASE_URL` |

### 3.2 Python (AI Engine)

```python
# ✅ DO: Type hints on all functions
async def adjust_calories(
    base_diet: BaseDiet,
    bio_profile: BioProfile,
) -> AdjustedNutrition:
    ...

# ✅ DO: Pydantic models for all data structures
class MacroTargets(BaseModel):
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    fiber_g: float = Field(ge=0, default=30.0)

# ✅ DO: Docstrings on complex functions
def rebalance_macros(
    target_kcal: int,
    weight_kg: float,
    activity_level: ActivityLevel,
    base_ratio: MacroRatio,
) -> MacroTargets:
    """
    Rebalance macronutrient targets based on user's profile.
    
    Priority order:
    1. Protein is set first (weight × multiplier)
    2. Remaining calories split between fat and carbs per base diet ratio
    3. Fiber minimum enforced regardless
    """
    ...
```

**Python Conventions:**
- Formatter: `ruff format`
- Linter: `ruff check`
- Import order: stdlib → third-party → local (isort 호환)
- 테스트: `pytest` + `pytest-asyncio`

### 3.3 React Native / React

```tsx
// ✅ DO: Functional components with explicit Props type
interface CelebrityCardProps {
  celebrity: Celebrity;
  onPress: (slug: string) => void;
  isBookmarked?: boolean;
}

export function CelebrityCard({ celebrity, onPress, isBookmarked = false }: CelebrityCardProps) {
  // ...
}

// ✅ DO: Custom hooks for business logic
export function useMealPlan(planId: string) {
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // ...
  return { plan, loading, error, refresh };
}

// ❌ DON'T: Inline styles (use theme tokens or StyleSheet)
<View style={{ marginTop: 16, padding: 8 }} />  // BAD

// ✅ DO: Use design tokens from theme
<View style={[styles.container, { marginTop: theme.spacing.md }]} />
```

**State Management Rules:**
- Global state: Zustand (최소한으로 유지)
- Server state: TanStack Query (React Query)
- Form state: React Hook Form + Zod resolver
- 로컬 UI state: `useState` / `useReducer`
- **Redux 사용 금지** — 이 프로젝트에서는 Zustand + React Query 조합을 표준으로 한다.

---

## 4. Architecture Rules

### 4.1 Service Boundaries

```
┌─────────────────────────────────────────────────────┐
│  각 서비스는 자신의 DB 테이블만 직접 접근한다         │
│  다른 서비스의 데이터가 필요하면 반드시 API 호출한다   │
└─────────────────────────────────────────────────────┘
```

| Service | Owns Tables | Can Call |
|---------|-------------|----------|
| user-service | users, bio_profiles, subscriptions | - |
| content-service | celebrities, base_diets, recipes, ingredients, recipe_ingredients | - |
| meal-plan-engine | meal_plans | user-service, content-service |
| commerce-service | instacart_orders | user-service, content-service, meal-plan-engine |
| analytics-service | daily_logs | user-service |

### 4.2 Inter-Service Communication

- **동기 호출**: HTTP (service mesh 내부, Kong 불경유)
- **비동기 작업**: SQS (meal plan generation, order status updates)
- **이벤트 브로드캐스트**: SNS → SQS fan-out (user profile updated 등)
- **서비스 간 호출 시 반드시 timeout 설정**: 기본 5초, meal plan generation은 30초
- **circuit breaker 패턴 적용**: 외부 API (Instacart, Stripe) 호출에 필수

### 4.3 API Design Rules

- 모든 list 엔드포인트는 cursor-based pagination을 사용한다 (offset 금지).
- 응답에 `total_count`를 포함하지 않는다 (성능 이슈). 대신 `has_next` boolean을 사용한다.
- nested resource는 최대 2단계까지만 허용한다: `/celebrities/:slug/diets` (O), `/celebrities/:slug/diets/:id/recipes/:rid` (X)
- 3단계 이상 중첩이 필요하면 top-level 엔드포인트로 분리한다: `/recipes/:id`
- PATCH는 partial update (merge semantics). PUT은 사용하지 않는다.
- 날짜/시간은 항상 ISO 8601 UTC로 반환한다.

---

## 5. Testing Requirements

### 5.1 Coverage Targets

| Type | Minimum | Focus Area |
|------|---------|------------|
| Unit | 80% | Business logic, utilities, AI engine algorithms |
| Integration | 핵심 플로우 | API endpoints, DB queries, external API mocks |
| E2E | Critical paths | Onboarding → Plan Generation → Cart Creation |

### 5.2 Test Rules

- **테스트 없는 PR은 머지하지 않는다.**
- AI Engine의 모든 알고리즘 함수는 edge case를 포함한 unit test가 필수이다.
- 외부 API(Instacart, Stripe, Cognito)는 반드시 mock/stub으로 테스트한다.
- Snapshot test는 UI 컴포넌트에만 사용하고, 비즈니스 로직에는 사용하지 않는다.
- 테스트 데이터는 factory 패턴으로 생성한다 (하드코딩된 fixture 최소화).

### 5.3 Test File Location

```
services/user-service/
  src/
    services/user.service.ts
  tests/
    unit/
      user.service.test.ts
    integration/
      user.routes.test.ts
```

---

## 6. Error Handling

### 6.1 Error Response Standard

모든 서비스는 아래 형식의 에러 응답을 반환한다:

```typescript
interface ApiError {
  code: string;          // UPPER_SNAKE, machine-readable
  message: string;       // Human-readable (EN)
  details?: Array<{
    field?: string;
    issue: string;
  }>;
  requestId: string;     // correlation ID for tracing
}
```

### 6.2 Error Code Catalog

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | 입력 값 검증 실패 |
| `UNAUTHORIZED` | 401 | 인증 실패 또는 토큰 만료 |
| `FORBIDDEN` | 403 | 권한 부족 (구독 티어 제한 등) |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `SUBSCRIPTION_REQUIRED` | 403 | 유료 기능 접근 시도 |
| `PLAN_LIMIT_REACHED` | 429 | 월간 식단 생성 한도 초과 |
| `ALLERGEN_CONFLICT` | 422 | 선택한 식단이 사용자 알레르기와 충돌 (해결 불가) |
| `INSTACART_UNAVAILABLE` | 502 | 인스타카트 API 장애 |
| `GENERATION_FAILED` | 500 | AI 식단 생성 실패 |
| `RATE_LIMITED` | 429 | 요청 빈도 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |

### 6.3 Logging Rules

```typescript
// ✅ DO: Structured logging with context
logger.error('Meal plan generation failed', {
  userId: user.id,
  baseDietId: input.baseDietId,
  error: err.message,
  stack: err.stack,
  requestId: ctx.requestId,
});

// ❌ DON'T: Unstructured logging
console.log('Error:', err);

// ❌ DON'T: Log sensitive data
logger.info('User login', { email: user.email, password: input.password }); // NEVER
```

**로그에 절대 포함하지 않는 것:**
- 비밀번호, 토큰, API 키
- 전체 건강 데이터 (biomarkers 전체 덤프)
- 신용카드 정보
- 사용자의 의료 정보 상세

---

## 7. Git & PR Rules

### 7.1 Branch Strategy

```
main              ← production (보호됨, direct push 금지)
  └── develop     ← integration branch
       ├── feat/TICKET-123-onboarding-survey
       ├── fix/TICKET-456-calorie-calc-bug
       └── chore/TICKET-789-update-deps
```

### 7.2 Commit Message Format

```
<type>(<scope>): <subject>

type: feat | fix | refactor | test | chore | docs | perf
scope: user-svc | content-svc | ai-engine | mobile | web | infra | shared
subject: 명령형 현재 시제, 50자 이내

예시:
feat(ai-engine): add GLP-1 protein boost multiplier
fix(mobile): resolve onboarding survey crash on Android
test(user-svc): add bio-profile validation edge cases
```

### 7.3 PR Requirements

- 제목에 관련 ticket 번호 포함
- 변경사항 요약 (what & why)
- 테스트 실행 결과 포함
- 스크린샷 (UI 변경 시)
- 1인 이상 리뷰 승인 후 머지
- Squash merge 사용 (develop → main은 merge commit)

### 7.4 Pre-commit Hooks (필수)

모든 커밋은 pre-commit hook을 통과해야 한다. **hook 우회(`--no-verify`)는 금지한다.**

```jsonc
// .husky/pre-commit (Node services)
pnpm lint-staged

// lint-staged.config.js
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{py}": ["ruff check --fix", "ruff format"]
}
```

```yaml
# .pre-commit-config.yaml (Python services)
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks:
      - id: ruff
      - id: ruff-format
```

**물리적 강제**: 전체 테스트가 통과하지 않으면 `develop` 또는 `main` 브랜치에 머지할 수 없다 (CI에서 차단).

### 7.5 Implementation Log (세션 간 컨텍스트 유지)

PGE Harness에서 Generator 에이전트의 세션이 끊기거나 컨텍스트가 초기화될 수 있다. 이를 보완하기 위해:

- **기능 단위 완료 시** `docs/IMPLEMENTATION_LOG.md`에 아래 형식으로 기록한다:
```markdown
## [날짜] Feature: [기능명]

### 완료 사항
- 구현된 컴포넌트/모듈 목록
- 주요 설계 결정과 그 이유

### 미완료 / 알려진 이슈
- 다음 세션에서 이어서 할 작업
- 발견된 기술 부채

### 연관 파일
- 변경/생성된 주요 파일 경로 목록
```

- 새로운 Generator 세션 시작 시 **반드시** `docs/IMPLEMENTATION_LOG.md`를 먼저 읽고 현재 진행 상태를 파악한다.
- 로그는 append-only로 관리한다 (기존 기록 수정 금지).

---

## 8. Performance Guardrails

### 8.1 Database

- **N+1 쿼리 금지**: 관계 데이터는 반드시 JOIN 또는 배치 조회(`WHERE id IN (...)`)로 가져온다.
- **인덱스 필수**: WHERE, ORDER BY, JOIN에 사용되는 컬럼에는 반드시 인덱스를 생성한다.
- **쿼리 실행 계획 확인**: 새 쿼리 추가 시 `EXPLAIN ANALYZE` 결과를 PR에 포함한다 (대상 데이터 1만 건 이상).
- **Connection pool**: PgBouncer 사용, 서비스당 최대 20 connections.

### 8.2 API

- 단일 API 응답 payload 최대 1MB.
- List 응답의 기본 페이지 크기: 20, 최대: 100.
- 이미지 URL은 pre-signed URL 또는 CDN URL로 반환 (바이너리 직접 반환 금지).
- 무거운 작업(식단 생성)은 반드시 비동기 처리 + polling/WebSocket.

### 8.3 Mobile

- 앱 번들 사이즈 제한: iOS 30MB, Android 25MB (초기 다운로드 기준).
- 이미지는 WebP 포맷 우선, 적응형 크기 제공 (thumbnail, medium, full).
- Lazy loading: 스크롤 뷰 내 오프스크린 컨텐츠는 지연 로딩.
- Skeleton UI: 데이터 로딩 중 스켈레톤 화면 표시 (빈 화면 금지).

---

## 9. Third-Party Integration Rules

### 9.1 Instacart

- API 호출은 `commerce-service` 내부에서만 수행한다.
- 모든 API 응답을 캐싱한다 (제품 카탈로그: 24시간, 가격: 1시간).
- Rate limit을 존중한다 (Instacart 제공 limit 기준 80% 이하 유지).
- 장애 시 circuit breaker → fallback (PDF 쇼핑 리스트).

### 9.2 Stripe

- Webhook은 signature 검증 후에만 처리한다.
- 멱등성 키(idempotency key)를 모든 결제 요청에 포함한다.
- 구독 상태 변경은 반드시 webhook 기반으로 처리한다 (클라이언트 신뢰 금지).

### 9.3 AWS Cognito

- 토큰 검증은 로컬에서 수행한다 (JWKS 캐싱).
- Refresh token rotation 활성화.
- MFA는 Phase 2에서 선택적 도입.

---

## 10. Content & Data Rules

### 10.1 Celebrity Data

- 셀러브리티 식단 정보는 공개된 인터뷰, 출판물, 공식 SNS에서만 수집한다.
- 모든 식단 정보에는 출처(`source_refs`)를 명시한다.
- "~가 먹는 식단" 형태의 표현 사용. "~가 추천하는" 또는 "~가 보증하는" 등의 오해 유발 표현 금지.
- 셀러브리티 이미지는 라이선스 확인 후 사용한다.

### 10.2 Health Disclaimer

- 앱 내 모든 식단/영양 정보 화면에 다음 면책 조항을 표시한다:
  > "This information is for educational purposes only and is not intended as medical advice. Consult your healthcare provider before making dietary changes."
- 사용자가 특정 의료 조건(당뇨, 신장질환 등)을 입력한 경우, 식단 생성 전 추가 경고를 표시한다.
- 칼로리 목표가 일일 1200kcal 미만으로 계산되는 경우 하한선을 적용하고 의사 상담을 권고한다.

### 10.3 Nutritional Data Accuracy

- 영양 데이터 출처: USDA FoodData Central (기본), 제조사 라벨 (보조).
- 모든 레시피의 영양 정보는 재료 단위 합산으로 자동 계산한다 (수동 입력 최소화).
- 자동 계산 결과와 참조 데이터의 편차가 20% 초과 시 관리자 리뷰 플래그.

### 10.4 Trend Intelligence 콘텐츠 규칙 (Phase 2+)

- **자동 게시 금지**: AI가 감지한 트렌드 데이터는 **반드시 편집팀의 수동 승인** 후에만 사용자에게 노출된다.
- **수집 범위 제한**: 셀러브리티의 **공개 게시물**만 수집한다. 비공개 계정, 삭제된 게시물, DM, 파파라치 보도는 수집 대상에서 제외한다.
- **플랫폼 ToS 준수**: Instagram Graph API, TikTok Research API 등 각 플랫폼의 공식 API와 이용약관을 준수한다. 스크래핑 금지.
- **원본 콘텐츠 비저장**: SNS 원본 이미지/영상은 저장하지 않는다. 텍스트 발췌(fair use 범위 내)와 메타데이터만 저장한다.
- **신뢰도 임계값**: NLP 분석의 `confidence_score`가 0.7 미만인 트렌드 시그널은 자동으로 `pending` 상태로 분류하고 편집팀에 리뷰를 요청한다.
- **Dynamic Base Layer 알림**: 식단 변경 시 사용자에게 **opt-in 알림**을 보낸다. 자동으로 기존 meal plan을 변경하지 않는다.

### 10.5 웨어러블 데이터 규칙 (Phase 2+)

- Apple Health / Google Fit 데이터는 **사용자가 명시적으로 동의한 카테고리**만 수집한다 (granular permission).
- 웨어러블에서 수집한 원시 데이터는 **기기 로컬에서 집계**한 후 일일 요약값만 서버로 전송한다.
- CGM(연속혈당모니터) 데이터는 건강 민감 데이터로 분류하여 `bio_profiles.biomarkers`와 동일한 암호화 정책을 적용한다.

---

## 11. Accessibility & i18n

- WCAG 2.1 AA 준수 (웹).
- 색상 대비 비율 최소 4.5:1.
- 모든 이미지에 alt text 제공.
- 초기 지원 언어: English (en-US) 단일.
- i18n 프레임워크는 Day 1부터 적용한다 (하드코딩 문자열 금지). Phase 3에서 다국어 확장 대비.
- 숫자/단위는 locale 기반 포맷: 미국 기본 (lb/oz/°F), metric 전환 옵션 제공.

---

## 12. AI Engine Specific Rules

### 12.1 안전 장치

```python
# 반드시 적용하는 영양 하한/상한선
NUTRITION_BOUNDS = {
    "min_daily_kcal": 1200,        # 이하로 절대 설정 불가
    "max_daily_kcal": 5000,        # 이상으로 설정 불가
    "min_protein_g_per_kg": 0.8,   # 최소 단백질
    "max_protein_g_per_kg": 3.0,   # 과잉 방지
    "min_fat_pct": 15,             # 필수 지방산 보장
    "max_fat_pct": 60,
    "min_carb_g": 50,              # 뇌 기능 최소치
}
```

- 위 범위를 벗어나는 결과가 생성되면 bounds에 클램핑하고, 사용자에게 조정 사유를 표시한다.
- 알레르기 필터링은 대체 재료를 찾지 못하면 해당 레시피를 통째로 교체한다 (알레르겐 포함 레시피를 절대 제공하지 않는다).
- GLP-1 사용자 모드에서는 단백질 최소치를 체중 × 2.0g으로 강제 적용한다.

### 12.2 테스트 시나리오 (필수)

모든 AI Engine 변경 사항에 대해 아래 시나리오 테스트를 통과해야 한다:

1. **기본 생성**: 건강한 30대 남성, moderate activity, 식단: Ronaldo → 합리적 매크로 확인
2. **알레르기 대체**: 유제품+글루텐 알레르기 사용자, 식단: Paltrow → 모든 레시피에서 알레르겐 0건
3. **극단적 감량**: BMI 35+, 목표: weight_loss → 칼로리 ≥ 1200kcal 확인
4. **고활동량**: 매우 활동적 + muscle_gain → 단백질 ≥ 체중 × 2.0g
5. **GLP-1 모드**: GLP-1 사용자 → 단백질 ≥ 체중 × 2.0g, 칼로리 10% deficit
6. **비건 단백질**: 비건 식단 + 고단백 요구 → 식물성 단백질로만 충족 가능한지 확인
7. **7일 다양성**: 7일 식단에서 동일 레시피 3회 이상 반복 없음

---

## 13. Deployment & Infrastructure

### 13.1 Environment Hierarchy

```
local → dev → staging → production
```

- `local`: Docker Compose로 전체 스택 로컬 구동.
- `dev`: feature branch 자동 배포 (PR open 시).
- `staging`: `develop` 브랜치 자동 배포. Production과 동일 구성.
- `production`: `main` 태그 배포. 수동 승인 필요.

### 13.2 Container Rules

- 모든 서비스는 Dockerfile을 포함한다.
- Base image: `node:22-alpine` (Node), `python:3.12-slim` (Python).
- Multi-stage build 필수 (빌드 도구를 런타임 이미지에 포함하지 않는다).
- Health check endpoint 필수: `GET /health` → `{ "status": "ok", "version": "x.y.z" }`.
- 컨테이너는 non-root user로 실행한다.

### 13.3 Database Migration Rules

- 마이그레이션은 forward-only. Rollback이 필요하면 새 migration으로 되돌린다.
- 모든 마이그레이션은 0-downtime 호환이어야 한다:
  - 컬럼 추가: OK (nullable 또는 default 값 필수)
  - 컬럼 삭제: 2단계 (1. 코드에서 참조 제거 → 배포, 2. 컬럼 삭제 migration)
  - 컬럼 이름 변경: 금지. 새 컬럼 추가 → 데이터 복사 → 구 컬럼 삭제.
  - 인덱스 생성: `CONCURRENTLY` 옵션 필수.

---

## 14. Definition of Done

Generator가 코드를 제출할 때, 아래 체크리스트를 모두 충족해야 Evaluator가 승인한다:

- [ ] TypeScript strict mode에서 컴파일 에러 없음
- [ ] ESLint / ruff 경고 0건
- [ ] 새 코드에 대한 테스트 작성 완료 (unit + integration 해당 시)
- [ ] 테스트 전체 통과
- [ ] pre-commit hook 통과 확인 (`--no-verify` 사용 흔적 없음)
- [ ] API 변경 시 OpenAPI spec 업데이트
- [ ] 환경 변수 추가 시 `.env.example` 업데이트
- [ ] DB 스키마 변경 시 migration 파일 포함
- [ ] JSONB 필드 변경 시 `shared-types` 타입 업데이트
- [ ] 보안 민감 코드 변경 시 security self-review 체크리스트 포함
- [ ] `docs/IMPLEMENTATION_LOG.md` 업데이트 (기능 단위 완료 시)
- [ ] README 또는 관련 문서 업데이트 (해당 시)

---

## 15. Quick Reference: Do & Don't

| ✅ DO | ❌ DON'T |
|-------|---------|
| Zod/Pydantic으로 입력 검증 | 수동 if/else 검증 |
| Parameterized SQL | 문자열 결합 SQL |
| 환경 변수로 설정 관리 | 하드코딩 시크릿 |
| structured JSON 로깅 | console.log |
| cursor pagination | offset pagination |
| UUID v7 primary key | auto-increment integer PK |
| soft delete (deleted_at) | hard DELETE |
| TanStack Query (서버 상태) | 수동 fetch + useState |
| Zustand (글로벌 상태) | Redux / Context API 남용 |
| WebP 이미지 + CDN | 원본 이미지 직접 서빙 |
| Docker multi-stage build | 빌드 도구 포함 이미지 |
| EXPLAIN ANALYZE 첨부 | 인덱스 없는 쿼리 추가 |
| named constant | magic number |
| 면책 조항 표시 | 의료 조언 형태의 표현 |
| "~가 먹는 식단" | "~가 추천하는 식단" |
| husky / pre-commit hook 적용 | `--no-verify` 커밋 |
| `IMPLEMENTATION_LOG.md` 기록 | 컨텍스트 없이 세션 시작 |
| 트렌드 데이터 편집팀 승인 후 노출 | AI 감지 데이터 자동 게시 |

---

*이 문서는 프로젝트 진행에 따라 Planner가 업데이트한다. 최종 수정일: 2026-04-03 (v1.1 — 실시간 트렌드 비전, Evaluator Rubric, 세션 관리 규칙 추가)*
