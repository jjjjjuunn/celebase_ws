# CODEX-INSTRUCTIONS.md — CelebBase Wellness Codex Agent Guide

> Codex CLI가 이 프로젝트에서 작업할 때 따라야 하는 규칙.
> Claude의 CLAUDE.md에 대응하는 Codex 전용 인스트럭션이다.

---

## 1. Project Identity

- **Name**: CelebBase Wellness — B2C 프리미엄 웰니스 플랫폼
- **Monorepo**: pnpm workspaces + Turborepo
- **Languages**: TypeScript (services, clients), Python (AI engine only)
- **Spec**: `spec.md` 참조 (제품 요구사항, DB 스키마, API 명세, AI 엔진 설계)

## 2. Monorepo Structure

```
packages/
  shared-types/      # TypeScript enums, API types, JSONB schemas
  service-core/      # Logger (Pino), database, Redis, JWT, PHI audit middleware
services/
  user-service/      # users, bio_profiles, subscriptions
  content-service/   # celebrities, base_diets, recipes, ingredients
  meal-plan-engine/  # meal_plans (Python-backed AI engine)
db/
  migrations/        # PostgreSQL migrations (forward-only)
tests/
  contract/          # pytest contract validation
```

## 3. Absolute Rules (위반 시 게이트에서 무조건 reject)

1. **시크릿/토큰/API 키를 코드에 하드코딩하지 않는다.** 환경 변수(`process.env.*`)만 사용.
2. **SQL 문자열 결합 금지.** parameterized query 또는 ORM만 사용.
3. **모든 외부 입력은 Zod(TS) / Pydantic(Python)으로 검증.**
4. **PHI(건강 데이터)는 AES-256 암호화 + 감사 로그 필수.**
5. **감사 로그 기록 실패 시 원래 요청도 차단 (fail-closed).**
6. **일반 엔티티는 soft delete.** `DELETE` SQL 직접 실행 금지. ePHI는 암호화 키 폐기.
7. **사용자 입력에서 URL을 받아 서버가 접속하는 패턴 금지.** allowlist 강제.
8. **로그에 비밀번호, 토큰, 의료 상세정보를 남기지 않는다.** structured logging만 사용.
9. **`any` 타입, 빈 `catch {}`, `console.log` 금지.**
10. **서비스 경계 엄수**: 다른 서비스의 DB 테이블을 직접 쿼리하지 않는다.
11. **API 기본**: cursor pagination, PATCH(merge), ISO 8601 UTC, `has_next` boolean.
12. **`gen_random_uuid()` 사용 금지** — UUID v7 (`uuid_generate_v7()`)만 사용.
13. **`--no-verify`, `rm -rf`, `git push --force`, `git reset --hard` 금지.**
14. **Redux 사용 금지** — Zustand, TanStack Query, React Hook Form만 허용.

## 4. Code Style

### TypeScript
- Explicit return types on exported functions
- Zod schema for API input validation
- Naming: PascalCase(컴포넌트), camelCase(유틸/변수/함수), UPPER_SNAKE(상수), snake_case(DB 컬럼), kebab-case(API endpoint)
- `unknown` + type guard 사용 (`any` 대신)
- `@celebbase/logger` 사용 (`console.log` 대신)
- 함수 50줄 초과 시 분리 고려
- magic number 금지 → named constant

### Python (AI Engine)
- Type hints + Pydantic models 필수
- `ruff format` + `ruff check`
- `pytest` + `pytest-asyncio`

### React
- Functional components + explicit Props interface
- Theme tokens 사용 (inline styles 지양)

## 5. Database Rules

- **UUID v7** 필수 (`uuid_generate_v7()`)
- **soft delete**: `deleted_at` 컬럼 사용
- **Migration**: `db/migrations/`에 파일 작성, forward-only
- **0-downtime**: 컬럼 추가는 nullable/default, 인덱스는 `CONCURRENTLY`
- **N+1 금지**: JOIN 또는 배치 조회
- **JSONB 변경 시**: `packages/shared-types/`에 TypeScript 타입 정의

## 6. API Conventions

### Service Boundaries (반드시 준수)
| Service | Owns Tables |
|---------|-------------|
| user-service | users, bio_profiles, subscriptions |
| content-service | celebrities, base_diets, recipes, ingredients, recipe_ingredients |
| meal-plan-engine | meal_plans |
| commerce-service | instacart_orders |
| analytics-service | daily_logs |

### Error Response
```typescript
interface ApiError {
  code: string;          // UPPER_SNAKE
  message: string;       // Human-readable
  details?: Array<{ field?: string; issue: string }>;
  requestId: string;     // 필수
}
```

## 7. Test Requirements

- **테스트 없는 코드는 게이트 통과 불가.**
- Unit test: 80% coverage minimum
- Integration test: 핵심 API/DB 플로우
- 외부 API: mock/stub 필수 (Instacart, Stripe, Cognito)
- 테스트 데이터: factory 패턴 (하드코딩 fixture 최소화)
- 테스트 파일 위치: `services/<name>/tests/unit/`, `services/<name>/tests/integration/`

## 8. Commit Format

```
<type>(<scope>): <subject>
```
- type: `feat | fix | refactor | test | chore | docs | perf`
- scope: `user-svc | content-svc | ai-engine | mobile | web | infra | shared`
- subject: 명령형 현재 시제, 50자 이내

## 9. DO NOT Modify

다음 파일/디렉토리는 절대 수정하지 않는다:
- `CLAUDE.md`
- `.claude/rules/`
- `.claude/settings.json`
- `.claude/tasks.yaml`
- `harness/`
- `.github/workflows/`
- `docs/IMPLEMENTATION_LOG.md` (Claude가 관리)

## 10. Pipeline Context

Codex는 Claude-Codex 파이프라인의 **구현 에이전트**로 동작한다:
- Claude가 `CODEX-HANDOFF.md`로 작업을 지시한다.
- Codex는 핸드오프 문서의 요구사항을 **정확히** 구현한다.
- 요구사항 범위를 벗어나는 변경(리팩토링, "개선")을 하지 않는다.
- 구현 완료 후 Claude가 게이트 판정을 수행한다.
- 게이트 실패 시 `fix-request-N.md`를 받아 수정한다.

## 11. File Creation Rules (반드시 준수)

**파일 생성/수정은 반드시 Python 단일따옴표 heredoc으로 한다.**

### 이유

`apply_patch`나 `cat`을 bash exec으로 실행하면 Python/TypeScript의 `"`, `'`, 백틱이 shell quoting과 충돌하여 `zsh: unmatched "` 오류가 발생한다. Python 단일따옴표 heredoc만 이 문제를 완전히 회피한다.

### 유일하게 허용되는 파일 쓰기 방법

```bash
python3 << 'PYEOF'
content = """\
파일 내용을 여기에 작성.
"이중따옴표"도 안전하고 'single'도 안전하고 `backtick`도 안전.
def foo():
    logger.warning("This is safe inside Python triple-quote string")
"""
with open('services/meal-plan-engine/src/engine/foo.py', 'w') as f:
    f.write(content)
print("Created foo.py")
PYEOF
```

- 외부 `<< 'PYEOF'`(단일따옴표 heredoc)가 shell 해석을 완전 차단한다.
- Python 내부 `"""\..."""`는 어떤 문자도 안전하게 포함한다.

### 절대 금지

```bash
# 금지 — quoting 오류 유발
bash -lc "apply_patch <<\"PATCH\"\n+\"content\"\nPATCH'"
bash -lc 'apply_patch <<PATCH ... PATCH'
cat > file << EOF  # EOF가 닫히지 않으면 오류
```

파일 수정이 필요하면: 파일 전체를 python3 heredoc으로 재작성한다.
