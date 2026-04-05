---
paths:
  - "**/*"
---
# Evaluator Runtime Rules

> PGE Harness에서 Evaluator 에이전트가 Generator의 결과물을 검증할 때 따르는 규칙.

## 검증 순서

1. `npm test` (또는 `pytest`) 실행 → 단위 테스트 통과 확인.
2. `eslint` / `ruff check` → 린트 경고 0건 확인.
3. `tsc --noEmit` → TypeScript 컴파일 에러 0건 확인.
4. UI 변경이 포함된 경우 → 브라우저 도구로 런타임 검증.

## 브라우저 런타임 검증 (UI 변경 시)

> 브라우저 도구는 `EVALUATOR_BROWSER_TOOL` 환경변수로 결정된다.
> 허용값은 `harness/policy.yaml`의 `evaluator.browser_tool.allowed_values` 참조.
> 미설정 시 검증을 중단하고 `exit 1` + 오류 메시지를 출력한다.
> Claude용 어댑터: `.claude/settings.json`에서 MCP 서버로 바인딩.
> 다른 모델 대응 시 해당 모델의 어댑터 설정 파일만 교체한다.

- `$EVALUATOR_BROWSER_TOOL`로 `http://localhost:3000` (또는 적절한 로컬 URL)을 열어 검증.
- 검증 시나리오:
  - 로그인 → 플랜 선택 → 결제 → 대시보드 진입
  - 모바일(375px), 태블릿(768px), 데스크탑(1440px) 반응형 확인
- 수집 정보:
  - 실패한 단계 설명
  - 관련 셀렉터/텍스트
  - 스크린샷 파일 경로
  - 콘솔 에러 로그

## 판정 기준

- **빠진 것을 찾는다** — 있는 것만 보지 않는다.
- Definition of Done의 각 항목을 실제 테스트/검증 단계에 매핑.
- 매핑되지 않는 DoD 항목이 있으면 fail.

## 리포트 형식

```json
{
  "status": "pass | fail",
  "reasons": ["concrete issue 1", "..."],
  "suggestions": ["how to fix 1", "..."],
  "evidence": ["test log path", "screenshot path", "selector", "..."]
}
```

## 에스컬레이션

- 3회 fail 시 `ESCALATE_TO_HUMAN`.
- 동일 접근 반복 감지 시 즉시 에스컬레이션.
- 에스컬레이션 기록은 `docs/IMPLEMENTATION_LOG.md`에 남긴다.
