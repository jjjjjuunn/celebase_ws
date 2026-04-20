---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.py"
---
# Code Style & Conventions

## TypeScript (Services + Clients)

```typescript
// DO: Explicit return types on exported functions
export async function getUserBioProfile(userId: string): Promise<BioProfile> { ... }

// DON'T: Implicit any or missing return type
export async function getUserBioProfile(userId) { ... }

// DO: Zod schema for API input validation
const CreateMealPlanSchema = z.object({
  baseDietId: z.string().uuid(),
  durationDays: z.number().int().min(1).max(30),
});

// DO: Discriminated union for API responses
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };
```

**Naming:**

| Type | Convention | Example |
|------|-----------|---------|
| File (component) | PascalCase | `CelebrityCard.tsx` |
| File (utility) | camelCase | `nutritionCalculator.ts` |
| File (route) | kebab-case | `bio-profile.routes.ts` |
| Variable/Function | camelCase | `calculateTdee()` |
| Constant | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Type/Interface | PascalCase | `MealPlan` |
| Enum | PascalCase | `ActivityLevel.VeryActive` |
| DB column | snake_case | `created_at` |
| API endpoint | kebab-case | `/bio-profile` |

### tsconfig `include` 커버리지 (IMPL-UI-002 교훈)

- 각 package 의 `tsconfig.json` `include` 는 실제 lint/typecheck 대상 모든 경로를 포함해야 한다. `src` 만 포함하고 `scripts/*.ts` 를 제외하면 ESLint project-service 범위 밖이 되어 monorepo turbo lint 가 fail.
- 빌드 대상과 tool script 의 tsconfig 가 분리되어야 할 때는 `tsconfig.scripts.json` 으로 분리하고 eslint override 로 `scripts/**` 를 해당 project 에 매핑한다.

### `exactOptionalPropertyTypes` 조건부 spread (IMPL-016-a2 교훈)

`tsconfig.json` 에 `exactOptionalPropertyTypes: true` 가 설정된 경우, optional 프로퍼티에 `undefined` 를 직접 할당하면 컴파일 실패한다. `RequestInit.body` 등 optional 필드는 조건부 spread 로 처리한다:

```typescript
// ❌ exactOptionalPropertyTypes 위반
const init: RequestInit = { body: value ?? undefined };

// ✅ 조건부 spread
const init: RequestInit = {
  ...(value !== undefined ? { body: JSON.stringify(value) } : {}),
};
```

### `restrict-template-expressions` — number 변환 (IMPL-016-a2 교훈)

ESLint `@typescript-eslint/restrict-template-expressions` 규칙은 template literal 에 `number` 타입을 직접 삽입하는 것을 금지한다. `String()` 으로 명시적 변환한다:

```typescript
// ❌ lint 실패
throw new Error(`status: ${response.status} ${path}`);

// ✅
throw new Error(`status: ${String(response.status)} ${path}`);
```

### Node.js tsconfig 에서 `RequestInfo` 미존재 (IMPL-016-a2 교훈)

`lib: ["ES2022"]` 만 포함된 Node.js tsconfig 에는 브라우저 전용 `RequestInfo` 타입이 없다. `fetch` 래퍼 함수를 작성할 때 파라미터를 `URL` 단일 타입으로 한정한다:

```typescript
// ❌ RequestInfo 는 브라우저 전역 타입
async function fetchWithTimeout(input: RequestInfo | URL, ...): Promise<Response>

// ✅ Node.js 환경에서는 URL 로 충분
async function fetchWithTimeout(input: URL, ...): Promise<Response>
```

## Python (AI Engine)

```python
# DO: Type hints + Pydantic models
async def adjust_calories(base_diet: BaseDiet, bio_profile: BioProfile) -> AdjustedNutrition: ...

class MacroTargets(BaseModel):
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
```

- Formatter: `ruff format` / Linter: `ruff check`
- Import order: stdlib > third-party > local
- Test: `pytest` + `pytest-asyncio`

## React Native / React

```tsx
// DO: Functional components + explicit Props
interface CelebrityCardProps {
  celebrity: Celebrity;
  onPress: (slug: string) => void;
}
export function CelebrityCard({ celebrity, onPress }: CelebrityCardProps) { ... }

// DON'T: Inline styles
<View style={{ marginTop: 16 }} />  // BAD
// DO: Use theme tokens
<View style={[styles.container, { marginTop: theme.spacing.md }]} />
```

**State Management:**
- Global: Zustand (최소 유지)
- Server: TanStack Query
- Form: React Hook Form + Zod resolver
- Local UI: `useState` / `useReducer`
- **Redux 금지**

### WAI-ARIA roving tabindex (IMPL-UI-003 교훈)

동일한 roving tabindex 의미론을 공유하는 2+ 컴포넌트는 반드시 공용 훅으로 봉인한다 (예: `packages/ui-kit/src/hooks/useRovingTabIndex.ts`). 각 컴포넌트가 `useState + useEffect` 로 중복 구현하면 controlled race, disabled skip, Home/End, all-disabled edge 처리가 서로 어긋나 버그 온상이 된다.

훅 계약 필수 요소:
- 내부 `activeIndexRef` + `useEffect(value)` 로 controlled `value` 동기화 → 빠른 연속 키 입력 race 방지.
- All-disabled edge: `activeIndex = -1`, `onKeyDown` no-op, itemProps `tabIndex: -1`. wrapper 에 `aria-disabled="true"` emit 은 consumer 책임으로 위임 (훅은 hint 만 반환).
- Re-entry fallback 순서: `value 매칭 → lastActiveRef → 첫 enabled option`.
- barrel 에는 internal 훅으로 노출하지 않는다 (ui-kit 내부 공유용).

### cloneElement children 주입 시 strict validation (IMPL-UI-003 교훈)

wrapper 컴포넌트가 `React.Children.toArray` + `cloneElement` 로 자식에 prop 을 주입할 때 반드시 2-step 검증을 거친다:

```tsx
const items = React.Children.toArray(children).filter(
  (child): child is ReactElement<SlotChipProps> =>
    isValidElement(child) && child.type === SlotChip
);
```

- `displayName` 비교가 아닌 `type === Component` strict 비교 — `React.memo` / `forwardRef` 래퍼 오인식 방지.
- 통과 실패 자식은 dev-only 경고 + 렌더에서 제외:
  ```tsx
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('<SlotChipGroup> ignores non-SlotChip children');
  }
  ```
- `cloneElement` 로 주입하는 prop 은 최소한 (`selected`, `onSelect`, `tabIndex`, `ref`) 로 제한 — 자식 내부 state 는 불변으로 보존.

## 공통 품질 규칙

- `any` 타입 금지 → `unknown` + type guard
- `console.log` 금지 → `@celebbase/logger` 사용
- 빈 `catch {}` 금지 → 최소 로깅
- 함수 50줄 초과 시 분리 고려
- magic number 금지 → named constant
