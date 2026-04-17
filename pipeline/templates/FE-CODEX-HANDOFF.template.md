# FE-CODEX-HANDOFF: {{TASK_ID}}

> 이 문서는 Claude가 작성하여 Codex에게 전달하는 프론트엔드 구현 명세이다.
> BE용 `CODEX-HANDOFF.template.md` 와는 독립 템플릿이다 — 두 템플릿을 혼용하지 않는다.
> Codex는 이 문서의 요구사항을 정확히 구현해야 한다.

## Task

**ID**: {{TASK_ID}}  (형식: `IMPL-UI-###` 또는 `IMPL-UI-###-<slug>`)
**Title**: {{TASK_TITLE}}
**Type**: {{feat | fix | refactor | a11y | perf}}

## Context

{{이 UI 작업이 필요한 이유, 사용자 플로우상 위치, 해당 기능의 DESIGN.md 섹션 참조.}}

- DESIGN.md 참조: §{{섹션 번호}} — {{요약}}
- 관련 slice preview: `/slice/{{route}}`
- 선행 작업 (있다면): {{TASK_ID}}

## Design Tokens (사용 대상)

> 모든 색·타입·그림자·spacing 은 `@celebbase/design-tokens` 의 `--cb-*` 토큰을 통해서만 참조한다.
> raw hex (`#xxxxxx`), inline 숫자 spacing, 임의 `--brand-*` 프리픽스는 금지.
> 신규 디자인 필요 시 먼저 `packages/design-tokens/tokens.css` 를 확장한 뒤 본 HANDOFF에 반영한다.

| 역할 | 토큰 | 비고 |
|------|------|------|
| 배경 | `--cb-color-bg` | light/dark 자동 |
| 본문 | `--cb-color-text` | |
| 브랜드 강조 | `--cb-color-brand` | 사용 빈도 제한 (DESIGN.md §13.1 참조) |
| 경계선 | `--cb-color-border` | whisper border 원칙 |
| ...   | ... | ... |

{{사용할 토큰 목록을 위 표에 구체적으로 작성}}

## Components (구현 대상)

{{구현 대상 컴포넌트와 variant/size/state 매트릭스}}

### {{ComponentName}} (`packages/ui-kit/src/{{ComponentName}}.tsx`)

- Props: `{{interface signature}}`
- Variants: `primary` | `secondary` | `ghost`
- Sizes: `sm` | `md` | `lg`
- States: `default` | `hover` | `focus-visible` | `disabled` | `loading`
- a11y 요구: `role`, `aria-*`, keyboard focus ring 가시성

## Accessibility

- WCAG 2.1 AA 준수 (`.claude/rules/domain/content.md` §Accessibility)
- 색 대비 ≥ 4.5:1 (본문) / ≥ 3:1 (큰 텍스트·UI component)
- 모든 인터랙티브 요소: keyboard tab order 유효 + `:focus-visible` 링 렌더
- 이미지·아이콘: `alt` 또는 `aria-label` 명시
- axe-core 기대 결과: serious/critical violation **0건**

## Affected Paths

{{변경 허용 경로. 아래 목록 외 파일은 건드리지 않는다.}}

- `apps/web/src/app/{{route}}/**`
- `apps/web/src/app/slice/{{preview-route}}/**`
- `packages/ui-kit/src/{{ComponentName}}*.tsx`
- `packages/design-tokens/tokens.css` ({{토큰 확장이 필요한 경우만}})

## Anti-Patterns (DO NOT)

- ❌ raw hex (`#...`) 직접 사용 — `--cb-*` 토큰 참조만 허용 (`fe_token_hardcode` gate FAIL)
- ❌ inline `style={{ color: '#...' }}` 으로 색 지정 — CSS module 또는 토큰 변수 참조
- ❌ `any` 타입, 빈 `catch {}`, production `console.log` (CLAUDE.md §2 Rule 9)
- ❌ 임의 `--brand-*` / `--primary-*` 토큰 추가 — `--cb-*` 네임스페이스만 허용
- ❌ Tailwind 의 arbitrary color (`bg-[#123456]`) — 토큰 매핑된 테마 클래스만 사용
- ❌ Shortlist 외 브랜드 accent 사용 (`#0071E3` Apple, `#FF385C` Airbnb 등) — DESIGN.md §13.4 참조
- ❌ `/slice/*` preview 페이지 삭제 또는 route 변경

## File Count Budget

신규 × 1.5 + 수정 × 1.0 ≤ **5** (TSX 컴포넌트 위주일 때는 **4 이하 권장**).
초과 시 TASK-ID 를 `-a`, `-b` 로 분할한다 (`.claude/rules/pipeline.md` HANDOFF 크기 제한).

## Reference Files

- `DESIGN.md` §{{section}} — {{why}}
- `apps/web/src/app/slice/layout.tsx` — theme/viewport shell, 이 레이아웃에 맞춰 렌더
- `packages/design-tokens/tokens.css` — 사용 가능한 토큰 확인
- `.claude/rules/code-style.md` §React Native / React — 컴포넌트 네이밍·Props 규칙
- `.claude/rules/domain/content.md` §Accessibility — WCAG 2.1 AA·색 대비 기준
- shortlist 브랜드 DESIGN.md (필요 시): `/tmp/design-refs-2/{apple,tesla,airbnb,claude,sanity}/DESIGN.md`

## Acceptance Criteria (DoD)

- [ ] `pnpm --filter web typecheck` exit 0 (새 `any` 없음)
- [ ] `pnpm --filter web lint` exit 0
- [ ] `pnpm --filter @celebbase/ui-kit typecheck` exit 0 (해당 패키지 변경 시)
- [ ] `scripts/gate-check.sh fe_token_hardcode` PASS (`apps/*/src/**`, `packages/ui-kit/src/**` raw hex 0건)
- [ ] `scripts/gate-check.sh fe_slice_smoke` PASS (`/slice`, `/slice/{{route}}` 모두 200)
- [ ] (FE_AXE=1 환경에서) `scripts/gate-check.sh fe_axe` PASS — serious/critical 0
- [ ] keyboard tab order 수동 확인 로그 첨부 (스크린샷 또는 텍스트 trace)
- [ ] `docs/IMPLEMENTATION_LOG.md` 항목 추가 (템플릿 `pipeline/templates/IMPL-LOG-ENTRY.template.md`)

## Constraints

- `CODEX-INSTRUCTIONS.md` + `AGENTS.md` 규칙 준수
- 위 Affected Paths 외 파일 수정 금지 (특히 BE `services/*`, migration `db/migrations/*` 건드리지 않음)
- TypeScript strict mode 유지, `any` 타입 금지
- 새 UI 컴포넌트에 대한 snapshot 또는 render 테스트 최소 1개 추가 (`@testing-library/react`)
- `--no-verify` / 훅 우회 금지 (CLAUDE.md §2 Rule 13)
