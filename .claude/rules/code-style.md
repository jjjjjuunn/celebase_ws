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

## 공통 품질 규칙

- `any` 타입 금지 → `unknown` + type guard
- `console.log` 금지 → `@celebbase/logger` 사용
- 빈 `catch {}` 금지 → 최소 로깅
- 함수 50줄 초과 시 분리 고려
- magic number 금지 → named constant
