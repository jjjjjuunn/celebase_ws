# Claude-Codex Pipeline Rules

> Claude가 파이프라인을 운용할 때 따르는 규칙.

## 언제 파이프라인을 사용하는가

- 3개 이상의 파일 변경이 예상되는 기능 구현 (feat)
- 사용자가 명시적으로 파이프라인을 요청할 때
- 단순 수정(1-2 파일 변경, typo fix)은 Claude 직접 처리

## 파이프라인 호출 방법

```bash
scripts/pipeline.sh <TASK-ID> <step>
```

단계는 반드시 순서대로 실행한다:
1. `init` → 워크트리 생성
2. Claude가 `pipeline/runs/<TASK-ID>/CODEX-HANDOFF.md` 작성 (Step 1)
3. `implement` → Codex 구현
4. `gate-implement` → 자동 체크 + Claude 판정 (Step 3)
5. `review` → Codex 리뷰
6. `gate-review` → 리뷰 게이트 + Claude 판정 (Step 5)
7. Claude가 `pipeline/runs/<TASK-ID>/QA-PLAN.md` 작성 (Step 6)
8. `qa-exec` → Codex QA 실행
9. `gate-qa` → QA 게이트 + Claude 판정 (Step 8)
10. `finalize` → 머지 준비 (Step 9)
11. Claude가 `pipeline/runs/<TASK-ID>/LESSONS.md` 작성 (Step 10)

## LESSONS.md 작성 기준

- `pipeline/templates/LESSONS.template.md`를 기반으로 작성
- **작성 시점**: `finalize` 완료 직후 (Step 10)
- 작성 대상:
  - 이번 구현에서 새로 발견한 패턴/안티패턴
  - fix-request가 1회 이상 발생한 경우 원인과 해결책
  - 다음 CODEX-HANDOFF Anti-Patterns 섹션에 추가할 항목
- **병합**: LESSONS.md 작성 후, `rules 병합 대상` 표의 각 항목을 해당 `.claude/rules/*.md`에 반영한다
- **Obsidian 저장**: LESSONS.md 작성 후 동일 내용을 아래 경로에 복사한다
  - 경로: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JW_Obsidian_iCloud/1. Projects/PBL/Projects/Celebase_ws/Pipeline Lessons/`
  - 파일명: `Claude-<YYYY-MM-DD>-<TASK-ID>-Lessons.md`
- 내용이 없으면 ("이번엔 새로 발견한 패턴 없음") 빈 LESSONS.md를 작성하고 종료

## CODEX-HANDOFF 작성 기준

- `pipeline/templates/CODEX-HANDOFF.template.md`를 기반으로 작성
- Requirements 섹션: 각 항목은 검증 가능한 단일 동작으로 작성
- Affected Paths: 변경 대상을 명확히 제한 (범위 외 변경 방지)
- Anti-Patterns: 해당 작업에서 특히 주의할 패턴 명시
- spec.md의 관련 섹션 번호를 Reference에 포함

### DB Schema 인라인 규칙 (C3 교훈)

Repository 또는 SQL 변경이 포함된 HANDOFF는 **대상 테이블 DDL을 인라인**해야 한다:

- `db/migrations/`에서 해당 CREATE TABLE + 이후 ALTER TABLE 전문 복붙
- API 필드 → DB 컬럼 매핑 테이블 포함 (변환이 있는 경우)
- 이유: Codex는 migration 파일을 자동으로 읽지 않아 존재하지 않는 컬럼으로 코드를 생성함 (C3에서 확인)
- `gate-check.sh sql_schema` 자동 체크가 INSERT/UPDATE 컬럼의 DDL 존재 여부를 검증한다

### CODEX-HANDOFF 크기 제한 (필수)

**한 HANDOFF에서 생성/수정하는 파일은 최대 5개**로 제한한다.

- 파일 수가 5개를 초과하면 작업을 하위 태스크(TASK-ID-a, TASK-ID-b)로 분리한다
- Python 서비스는 heredoc 오버헤드로 토큰 소비가 크므로 **4개 이하** 권장
- 판단 기준: 신규 파일 × 1.5 + 수정 파일 × 1.0 ≤ 5

이유: Codex `exec`는 단일 API completion이며 o3 기준 ~230K 토큰에서 중단된다. 8파일 HANDOFF는 반복적으로 부분 완성 후 종료됨 (IMPL-003, IMPL-004-b, IMPL-004-c에서 확인).

### Claude-Codex 하이브리드 분업 (IMPL-004-c 교훈)

모든 작업을 Codex에 위임하지 않는다. 역할별 최적 에이전트:

| 작업 유형 | 담당 | 이유 |
|-----------|------|------|
| 알고리즘/도메인 로직 | **Codex** | 설계 판단이 필요한 코드에서 강점 |
| CRUD/보일러플레이트 | **Claude 직접** | 패턴이 명확하고 Codex 토큰 낭비 |
| 독립 코드 리뷰 | **Codex** | Claude와 다른 시각의 리뷰가 핵심 가치 |
| QA 테스트 실행 | **Codex** | 격리 환경에서 실행 + 검증 |
| 아키텍처 설계 | **Claude** | 컨텍스트 윈도우 + 멀티턴 대화 강점 |

Codex `implement` 후 미완성 파일이 있으면 Claude가 직접 보충 → gate-implement에서 통합 검증.

## 게이트 판정 원칙

### 자동 체크 (scripts/gate-check.sh)
- 하나라도 fail이면 전체 fail → 수정 요청

### Claude 판정 (자동 체크 통과 후)
- **엄격**: 보안 규칙 위반, PHI 처리 오류, 서비스 경계 위반
- **보통**: 아키텍처 일관성, 테스트 충분성
- **관대**: 코드 스타일 (lint 통과했으면 OK)
- `pipeline/templates/gate-criteria.yaml`의 판정 항목을 순회한다

### 판정 결과 기록
- Pass: `log_event`로 기록, 다음 단계 진행
- Fail: `pipeline/runs/<TASK-ID>/fix-request-N.md` 작성 후 `fix` 단계 호출

## 수정 루프 (Fix Cycle)

- 최대 3회 (PGE 규칙 #14)
- 각 fix-request는 `pipeline/templates/fix-request.template.md` 기반
- 실패 항목만 수정 요청 (범위 외 "개선" 요청 금지)
- 3회 초과 시: `ESCALATE_TO_HUMAN` + `IMPLEMENTATION_LOG.md`에 에스컬레이션 기록

## 에스컬레이션 기록 형식

```markdown
## ESCALATION: [TASK-ID]
- 시도 횟수: 3/3
- 게이트: [implement | review | qa]
- 마지막 실패 사유: [구체적 이유]
- 시도한 접근법: [각 시도 1줄 요약]
- 권장 다음 단계: [사람이 해야 할 것]
```

## Codex 모델 선택

- 기본: `o3` (비용 효율적)
- 복잡한 로직: `--model o3` 유지
- 단순 작업: `--model o4-mini` 가능

## 워크트리 관리

- 생성: `pipeline.sh <TASK-ID> init`
- 위치: `.worktrees/<TASK-ID>/`
- 정리: 파이프라인 완료 후 `git worktree remove` (수동)
- `.worktrees/`는 `.gitignore`에 등록

### 워크트리 내 workspace 패키지 빌드 선행 (IMPL-003 교훈)

git worktree는 `packages/*/dist/`를 포함하지 않아 typecheck/test 실행 전 빌드가 필요하다:

```bash
pnpm --filter shared-types build
pnpm --filter service-core build
```

gate-implement 자동 체크 전 이 단계가 빠지면 `Cannot find module '@celebbase/shared-types'` 오류 발생.

### CODEX-INSTRUCTIONS.md 주입 방법 (IMPL-004-b 교훈)

`codex exec -c model_instructions_file=...` 는 유효하지 않은 config 키 — 무시된다.
올바른 주입: `run_codex()`에서 mktemp 파일에 CODEX-INSTRUCTIONS.md + task 내용을 합쳐 stdin으로 전달.
`AGENTS.md`를 프로젝트 루트에 유지하면 Codex가 자동 로드한다.

### QA 단계 Python venv 사전 설치 (IMPL-004-c 교훈)

Codex sandbox에는 PyPI 접근이 없어 pytest 실행이 실패한다. 이를 방지하기 위해 `pipeline.sh`의 `step_qa_exec()`에서 Codex 실행 **전에** Python venv을 생성하고 의존성을 설치한다:

```bash
python3 -m venv services/meal-plan-engine/.venv
.venv/bin/pip install -r requirements.txt
```

Codex QA 프롬프트에 `.venv/bin/python -m pytest` 경로를 명시한다. 그래도 가짜 `pytest/` 디렉토리가 생성되면 `gate-check.sh`의 `check_fake_stubs()`가 자동 탐지하여 gate FAIL 처리한다.

gate-qa 판정 시 Claude가 직접 `python3 -m pytest`를 실행해 실제 통과 여부를 이중 확인한다.

---

## FE 파이프라인 규칙 (IMPL-UI-*)

> 본 섹션은 프론트엔드 (Next.js `apps/web`, `packages/ui-kit`, `packages/design-tokens`) 작업에만 적용한다.
> BE (Python 서비스·migration·PHI) 규칙은 위 섹션들을 유지한다 — 두 규칙 세트는 독립이다.

### 템플릿 분리

- **FE 전용 HANDOFF**: `pipeline/templates/FE-CODEX-HANDOFF.template.md`
- **BE HANDOFF**: `pipeline/templates/CODEX-HANDOFF.template.md` (기존 파일, 수정 금지)
- 한 TASK-ID 는 둘 중 하나만 사용한다. 혼용 금지.

### FE Task ID 규칙

- `IMPL-UI-###` 또는 `IMPL-UI-###-<slug>` 형식
- Affected Paths 는 `apps/*/src/**`, `packages/ui-kit/src/**`, `packages/design-tokens/**` 로만 제한
- BE 경로 (`services/*`, `db/migrations/*`) 를 건드려야 하면 태스크를 분할한다

### Claude / Codex 하이브리드 분업 (FE 특화)

| 작업 유형 | 담당 | 이유 |
|-----------|------|------|
| design-tokens 파이프라인 (build 스크립트·원천 CSS·타입 정의) | **Claude** | 토큰 구조 결정은 DESIGN.md 해석 필요 |
| ui-kit 컴포넌트 구현 (variant·state·a11y) | **Codex** | 반복 JSX 패턴 양산에 강점 |
| `/slice/*` preview 페이지 | **Codex** | 기존 레이아웃 shell 재사용 |
| a11y·axe 리뷰 | **Codex** | 독립 시각 검증 |
| 토큰 네이밍·스케일 결정 | **Claude** | DESIGN.md §2·§3 해석 |
| 브랜드 accent 선택·금지 목록 | **Claude** | DESIGN.md §13.4 Anti-Patterns 관리 |

### Raw Hex 금지 (자동 검증)

- `apps/*/src/**`, `packages/ui-kit/src/**` 내 `.ts/.tsx/.css/.scss` 에서 raw hex (`#[0-9a-fA-F]{3,8}`) 사용 금지
- 화이트리스트: `packages/design-tokens/*.css`, `packages/design-tokens/*.ts` (토큰 정의 원본)
- 자동 검증: `scripts/gate-check.sh fe_token_hardcode`
- 신규 색 필요 시 **먼저** `packages/design-tokens/tokens.css` 확장 → 컴포넌트에서 `--cb-*` 토큰으로 참조

### FE DoD 필수 근거 (gate-implement 판정 기준)

- `pnpm --filter web typecheck` 로그
- `pnpm --filter web lint` 로그
- `scripts/gate-check.sh fe_token_hardcode` JSON (`passed:true`)
- `scripts/gate-check.sh fe_slice_smoke` JSON (`passed:true`, `/slice` 200 기록 포함)
- (선택) `FE_AXE=1 scripts/gate-check.sh fe_axe` — Playwright MCP 환경에서만 실행, serious/critical 0

### FE Gate 체크 구성

| 체크 | 기본 `all` 포함 | 언제 수동 실행 |
|------|----------------|---------------|
| `fe_token_hardcode` | ✅ 포함 | 항상 실행 |
| `fe_axe` | ✅ 포함 (FE_AXE=1 일 때만 실제 검증) | UI 변경 PR 직전 |
| `fe_slice_smoke` | ❌ 제외 (dev server 기동 필요) | gate-implement / gate-qa 단계에서 명시 호출 |

### HANDOFF 크기 제한 (FE 특화)

- 파일 수 판단식: 신규 × 1.5 + 수정 × 1.0 ≤ 5
- TSX 컴포넌트 위주면 **4 이하** 권장 (JSX + type + CSS module 분산으로 토큰 소비 큼)
- design-tokens 스크립트는 Claude 직접 구현이므로 이 제한에서 제외

### 회귀 방지

- `/slice` 는 모든 FE 태스크 완료 후 200 을 유지한다 (layout.tsx 삭제 금지)
- 기존 preview route 들은 FE 태스크 완료 전후로 curl 200 이 동일해야 한다
- DESIGN.md §2 토큰 정의와 `packages/design-tokens/tokens.css` 값 은 grep 상호 확인으로 정합성 유지
