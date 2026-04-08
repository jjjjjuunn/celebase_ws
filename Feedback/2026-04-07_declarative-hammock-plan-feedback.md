검토 대상: [declarative-exploring-hammock.md](/Users/junwon/.claude/plans/declarative-exploring-hammock.md)

핵심 평가는 “방향은 맞지만, 성공 조건을 보장하기 위한 운영/보안/검증 디테일이 부족하다”입니다.

**강점**
1. 단계 순서가 합리적입니다. `root → shared → core → db/infra → services → CI`는 의존성 순서를 잘 따릅니다.
2. 완료 기준이 실행 명령까지 포함되어 있어 선언적 계획치고 검증 의식이 좋습니다.
3. ESM/strict/no-console 같은 코드 품질 가드가 초반에 명시되어 있습니다.

**문제점과 개선 제안 (근거 포함)**
1. 워크스페이스 경로 정책이 충돌합니다.  
근거: Step 1에 `packages/*, services/*, apps/*, db`, 이후 Step 6~7은 `services/*` 중심인데 실제 요청/실행은 `apps/user-service`를 사용했습니다.  
제안: 서비스 위치를 `apps/*` 또는 `services/*` 하나로 고정하고, 계획/스크립트/CI 전부 동일하게 맞추세요.

2. 보안 요구가 “선언” 수준에 머물러 있습니다.  
근거: Step 3에 “PHI 감사 로그 fail-closed”, “JWT”, “redact”만 있고 실패 조건/차단 정책이 없습니다.  
제안: 최소한 아래를 명문화하세요.  
- 어떤 실패에서 요청을 차단하는지(키 누락, 암호화 실패, 감사로그 write 실패)  
- 차단 시 상태코드/에러코드  
- 암호화 모드(AES-256-GCM), 키 로테이션, IV/nonce 정책

3. “모든 외부 입력 Zod 검증”이 계획 본문에서 계층 책임으로 분해되지 않았습니다.  
근거: Step 2/3/6에 Zod 언급은 있으나 “라우트/서비스/DB 경계” 책임이 없습니다.  
제안: 검증 책임을 고정하세요.  
- HTTP 입력: 라우트 레벨 Zod  
- env/config: 부팅 시 1회 Zod  
- DB JSONB: repository 입출력 Zod  
- 내부 도메인 객체: 런타임 검증 최소화(타입 기반)

4. Step 4(DB)와 Step 5(Docker)의 성공 기준이 약합니다.  
근거: “마이그레이션 적용”, “컨테이너 healthy”만으로 앱 준비 상태를 보장하지 못합니다.  
제안: `ready` 기준을 추가하세요.  
- `db:doctor`(확장/권한/연결) 통과  
- 서비스 `/ready`가 DB+Redis 실제 ping 확인  
- compose healthcheck는 포트 오픈이 아니라 실제 질의 기반

5. CI 단계가 정책 강제와 충분히 연결되지 않았습니다.  
근거: Step 8에 lint/typecheck/test는 있지만 금지 규칙(`any`, 빈 catch, SQL 문자열 결합, console.log`)의 자동 검출 방법이 없습니다.  
제안: 정책 체크를 코드화하세요.  
- ESLint rule + custom grep/policy-check  
- PR 게이트에서 “정책 위반 시 fail” 명시  
- SQL은 쿼리 빌더/parameterized API만 허용하도록 wrapper 강제

6. 완료 기준이 네트워크/패키지 관리자 가정에 의존합니다.  
근거: 계획의 검증 명령은 `pnpm install`이 선행인데, 환경 제약 시 전체 검증이 멈춥니다.  
제안: 사전조건 단계를 추가하세요.  
- preflight: Node/corepack/pnpm/registry DNS 체크  
- 실패 시 대체 경로(내부 레지스트리, 캐시, lockfile 기반 오프라인 설치)

**수정하면 좋은 Acceptance Criteria**
1. `preflight` 통과가 Step 1 완료 조건에 포함될 것  
2. Step 3은 “보안 실패 시 차단 동작” 테스트 1개 이상 포함  
3. Step 6~7은 `/health` + `/ready` 둘 다 통과  
4. Step 8은 정책 위반 탐지(`no-any`, `no-console`, `no-empty-catch`, `no-sql-concat`)를 CI에서 강제

원하면 이 피드백을 바로 반영한 “수정된 플랜 초안(Step별 체크박스 포함)” 형태로 작성해 드리겠습니다.
