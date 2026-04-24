# CLAUDE.md — CelebBase Wellness Agent Constitution

> 이 파일은 매 턴마다 로드되는 전역 인덱스다. 짧게 유지하고, 세부 규칙은 `.claude/rules/`에서 관리한다.
> spec.md와 함께 읽되, 충돌 시 이 파일이 우선한다.

---

## 1. Project Identity

- **Name**: CelebBase Wellness — B2C 프리미엄 웰니스 플랫폼
- **Architecture**: PGE Harness (Planner-Generator-Evaluator)
- **Monorepo**: pnpm workspaces + Turborepo
- **Languages**: TypeScript (services, clients), Python (AI engine only)

## 2. Absolute Rules (예외 없음, 위반 시 무조건 reject)

1. 시크릿/토큰/API 키를 코드에 하드코딩하지 않는다. 환경 변수만 사용.
2. SQL 문자열 결합 금지. parameterized query 또는 ORM만 사용.
3. 모든 외부 입력은 Zod(TS) / Pydantic(Python)으로 검증.
4. PHI(건강 데이터)는 최소 필요 접근 + AES-256 암호화 + 감사 로그 필수.
5. 감사 로그 기록 실패 시 원래 요청도 차단 (fail-closed).
6. 일반 엔티티는 soft delete. ePHI는 암호화 키 폐기 + 유예 후 hard delete.
7. 사용자 입력에서 URL을 받아 서버가 접속하는 패턴 금지. allowlist 강제.
8. 로그에 비밀번호, 토큰, 의료 상세정보를 남기지 않는다. structured logging만 사용.
9. `any` 타입, 빈 `catch {}`, production `console.log` 금지.
10. 서비스 경계 엄수: 다른 서비스의 DB 테이블을 직접 쿼리하지 않는다.
11. API 기본: cursor pagination, PATCH(merge), ISO 8601 UTC, `has_next` boolean.
12. CI 게이트: lint/type/test 통과, Semgrep high/critical = 0, migration 포함.
13. `--no-verify` 등 hook/CI 우회 금지.
14. PGE 루프 최대 3회. 초과 시 `ESCALATE_TO_HUMAN` + 실패 로그 기록.
15. 규칙 충돌 시 우선순위: **보안 > 개인정보 > 데이터 무결성 > 성능 > 편의**.

## 3. Key Documents (반드시 참조)

| Document | Purpose |
|----------|---------|
| `spec.md` | 제품 요구사항, DB 스키마, API 명세, AI 엔진 설계 |
| `.claude/rules/security.md` | 보안 상세 규칙 (JWT, CORS, PHI 삭제 절차, 암호화) |
| `.claude/rules/database.md` | DB 무결성, 마이그레이션, 인덱싱, 감사 로그 |
| `.claude/rules/code-style.md` | TS/Python/React 코딩 컨벤션, 네이밍 |
| `.claude/rules/api-conventions.md` | API 설계, 에러 포맷, 페이징, 서비스 간 통신 |
| `.claude/rules/testing-ci.md` | 테스트 전략, CI/CD, Git/PR 규칙, DoD 체크리스트 |
| `.claude/rules/domain/ai-engine.md` | AI 엔진 안전장치, 영양 bounds, PHI 최소화, 테스트 시나리오 |
| `.claude/rules/domain/content.md` | 셀러브리티 데이터, 면책조항, 트렌드 규칙, 접근성 |
| `.claude/rules/pipeline.md` | Claude-Codex 파이프라인 운용 규칙, 게이트 판정, 에스컬레이션 |
| `.claude/rules/evaluator-runtime.md` | Evaluator 검증 순서, 브라우저 런타임 검증, 리포트 형식 |
| `.claude/rules/spec-dod.md` | spec.md DoD 해석 규칙, 근거 유형, 3층 구조 |
| `CODEX-INSTRUCTIONS.md` | Codex 에이전트용 프로젝트 인스트럭션 |
| `services/commerce-service/docs/openapi.yaml` | commerce-service OpenAPI 3.1 스펙 (결제·구독·장바구니 경계, IMPL-016) |
| `services/analytics-service/docs/openapi.yaml` | analytics-service OpenAPI 3.1 스펙 (daily-log CRUD·요약·reports, IMPL-017) |

## 4. Workflow

1. 작업 시작 전 `spec.md`와 관련 `.claude/rules/` 파일을 읽는다.
2. 구현 후 `npm test` + lint + type check를 통과해야 한다.
3. UI 변경 시 Playwright MCP로 런타임 검증을 수행한다.
4. 기능 완료 시 `docs/IMPLEMENTATION_LOG.md`에 기록한다.
   - 포맷은 파일 상단 YAML front-matter 스키마 엄수. heading-only 스타일 금지.
   - 템플릿: `pipeline/templates/IMPL-LOG-ENTRY.template.md`
   - 2-commit 패턴: feat 커밋에 `commit_sha: PENDING`으로 포함 → `scripts/record-log-sha.sh <TASK-ID>` → `docs(log): record <TASK-ID> commit SHA` 별도 커밋
   - 로컬 pre-commit hook (`scripts/install-hooks.sh`로 1회 설치) 가 `scripts/validate_impl_log.py`를 실행한다.
5. 새 세션 시작 시 `docs/IMPLEMENTATION_LOG.md`를 먼저 읽는다.
6. 첫 세션 시 (레포 clone 직후) `bash scripts/install-hooks.sh` 1회 실행 필수.

---

*이 문서는 인덱스 역할만 한다. 세부 규칙 추가가 필요하면 `.claude/rules/`에 파일을 만든다.*
