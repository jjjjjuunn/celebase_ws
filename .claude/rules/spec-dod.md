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
