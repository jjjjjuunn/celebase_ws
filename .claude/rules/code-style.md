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
