# Spec & Definition of Done Interpretation Rules

> 에이전트가 spec.md의 DoD를 올바르게 해석하기 위한 규칙.

## 핵심 원칙

- spec.md의 DoD 섹션은 **정답지**로 간주한다.
- 이 규칙은 DoD 검증 영역에만 적용된다. 행동 규칙 충돌 시 루트 CLAUDE.md Rule 15가 우선한다.
- 구현 시작 전, DoD 각 항목을 실제 작업 단위(Task)로 분해한다.
- DoD 체크박스는 사람이 클릭하지만, 에이전트는 각 항목 충족 근거를 코멘트로 남긴다.

## 근거 유형 (하나 이상 필수)

- 통과한 테스트 이름과 로그
- Playwright MCP 리포트 경로
- 관련 이벤트 로그/메트릭
- API 응답 샘플

## 금지 사항

- 근거 없이 DoD 항목을 완료로 간주하지 않는다.
- "대충 그럴듯한" 결과물을 만들고 완료 선언하지 않는다 (false completion 방지).
- 테스트/검증 없이 "코드를 읽고 느낌으로 판단"하지 않는다.

## DoD 3층 구조

spec.md의 각 기능 DoD는 다음 세 층으로 구성되어야 한다:

1. **Functional Criteria**: 사용자 관점에서 무엇이 가능해야 하는지
2. **Verification Steps**: 어떤 테스트/시나리오/툴 실행으로 확인하는지
3. **Provenance & Attestation**: 어떤 에이전트가 어떤 계약 하에서 만들었는지 로그

## MOBILE PIVOT spec sync 의무 (PIVOT-MOBILE-2026-05~)

> spec.md 본문은 web-first 시점 작성. 상단 PIVOT BANNER 가 본문보다 우선하지만, 본문 자체를 갱신하지 않으면 신규 세션이 web-first 가정을 답습한다. 따라서 모든 mobile-pivot task 는 자기 영역의 spec.md 섹션을 함께 patch 해야 한다.

### 적용 대상 task ID 패턴

- `IMPL-MOBILE-*` (모든 BE/BFF/INFRA 영역, 모바일 트랙 모든 sub-task)
- `INFRA-MOBILE-*`
- `CHORE-MOBILE-*`
- `SPEC-SYNC-*` (retroactive backfill 전용)
- 동료가 진행하는 mobile FE PR 도 동일 의무 (적용 범위는 `docs/SPEC-PIVOT-PLAN.md` §2 의 "동료 작업" 행 참조)

### 의무 절차 (각 task finalize 단계)

1. `docs/SPEC-PIVOT-PLAN.md` 의 본 task 행에서 "spec.md 갱신 의무 섹션" 컬럼을 확인한다.
2. 해당 섹션에 본 task 의 결정/필드/flow 를 patch 하는 commit 을 PR 에 포함한다 (commit message prefix 권장: `docs(spec): <TASK-ID> sync — <섹션 요약>`).
3. patch 가 본 task 범위에서 비합리적으로 큰 경우 `pipeline/runs/<TASK-ID>/SPEC-SYNC-DEFER.md` 를 작성한다 — 양식:
   ```markdown
   # SPEC-SYNC-DEFER: <TASK-ID>
   - 사유: <왜 본 task 에서 patch 하지 않는가>
   - 후속 task: <SPEC-SYNC-*-* 신규 task ID, docs/SPEC-PIVOT-PLAN.md §3 에 등록>
   - 영향: <본 deferral 로 spec 본문이 일시적으로 stale 한 영역>
   ```
4. retroactive backfill task 는 단일 commit, light review (L1~L2), `docs/SPEC-PIVOT-PLAN.md` §3 의 행에 ✅ 표기 후 closing.

### 자동 검증

`scripts/gate-check.sh spec_sync` 가 PR 머지 전 다음을 검증:

- 현재 브랜치 / 최근 commit message 에서 `IMPL-MOBILE-*` / `INFRA-MOBILE-*` / `CHORE-MOBILE-*` / `SPEC-SYNC-*` task ID 매칭
- 매칭 시 다음 둘 중 하나 충족:
  - `git diff origin/main...HEAD -- spec.md` 에 의미 있는 변경 존재 (≥ 3 line)
  - `pipeline/runs/<TASK-ID>/SPEC-SYNC-DEFER.md` 존재
- 둘 다 부재 시 gate FAIL — finalize 차단

### gate FAIL 시 대응 (Claude 판정 우선순위)

루트 CLAUDE.md Rule 15 우선순위는 그대로 적용 (보안 > 개인정보 > 데이터 무결성 > 성능 > 편의). spec sync 누락은 "데이터 무결성 / 운영 일관성" 영역으로 편의 직전. 다음 경우에만 수동 PASS 허용:

- 본 task 가 보안 hotfix 이고 spec patch 가 별도 PR 로 fast-follow 가 합의된 경우 (PR description 에 fast-follow PR # 명시)
- 본 task 의 변경이 spec.md 본문과 정합 (drift 없음) — 명시적 sign-off 1줄

그 외에는 fix-request 발행 후 spec patch 또는 deferral marker 추가 후 재검증.
