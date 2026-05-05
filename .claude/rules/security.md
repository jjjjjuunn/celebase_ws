---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.py"
  - "services/**/*"
---
# Security Rules

## 인증 & 접근 제어

- **JWT 검증**: 모든 보호 엔드포인트에서 Cognito JWT signature + expiry + audience를 검증한다.
- **CORS 화이트리스트**: 와일드카드(`*`) 금지. 명시적 도메인만 허용.
- **URL 허용 목록 강제**: 외부 연결 대상은 코드 내 allowlist로 관리한다.
  ```typescript
  // bad
  const wsUrl = req.query.debug_api || process.env.WS_URL;
  // good
  const ALLOWED_WS = ['wss://api.celebbase.com'];
  ```
- **보안 정적 분석**: CI에 Semgrep 포함. `critical` 또는 `high` 발견 시 빌드 실패.

### Stateful Token Rotation (IMPL-010-f 교훈)

Refresh token rotation은 단일 트랜잭션 + UPDATE rowcount로 winner를 결정한다:

```typescript
// ❌ SELECT-then-UPDATE (race condition 허용)
const row = await pool.query('SELECT ... WHERE jti=$1 AND revoked_at IS NULL');
if (row) await pool.query('UPDATE ... SET revoked_at=now()');  // concurrent 통과 가능

// ✅ Atomic UPDATE rowcount (winner-takes-all)
await client.query('BEGIN');
await issueInternalTokens(client, subject);  // INSERT new jti (tx 내부)
const consumed = await revokeForRotation(client, { oldJti, newJti, userId });
if (consumed) { await client.query('COMMIT'); }
else { await client.query('ROLLBACK'); /* 401 분기 */ }
// finally: client.release()
```

### Timing-Safe JWT Verify (IMPL-010-f 교훈)

미검증 refresh token으로 DB 조회를 허용하면 토큰 존재 여부가 응답 타이밍으로 누출된다:

```typescript
// ❌ DB 조회 후 JWT 검증 — timing side-channel
const row = await db.query('SELECT ... WHERE jti=$1');
await jwtVerify(token, secret);  // 늦음

// ✅ JWT 검증 먼저, DB 조회는 검증 성공 후에만
try {
  await jwtVerify(token, secret, { clockTolerance: 2 });
} catch {
  throw new UnauthorizedError('Invalid or expired');
}
// DB 접근은 이 아래에서만
```

### Audit Log Before Throw (IMPL-010-f 교훈)

401을 throw하기 전에 감사 로그를 emit해야 한다. throw 이후의 코드는 실행되지 않는다:

```typescript
// ✅ emit BEFORE throw
emitAuthLog(log, 'auth.token.reuse_detected', { ... }, 'warn');
await revokeAllByUser(pool, { userId, reason: 'reuse_detected' });
throw new UnauthorizedError('Token reuse detected');  // emit 완료 후 throw
```

### Internal HTTP Client SSRF Guard (IMPL-016-a2 교훈)

`new URL(path, baseUrl)` 은 `path` 에 scheme 이 있으면 `baseUrl` 을 **무시**하고 절대 URL 로 해석한다. 내부 HTTP 클라이언트에서 `path` 를 외부 입력이 오염할 수 있다면 반드시 scheme 선두 정규식으로 먼저 거부해야 한다:

```typescript
// ✅ scheme 선두 탐지 → 절대 URL 주입 차단
if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) {
  throw new Error('InternalClientError: absolute URLs are not allowed in path');
}
const url = new URL(path, opts.baseUrl);
```

적용 위치: `packages/service-core/src/lib/internal-http-client.ts` `doRequest()` 진입부.

### CSP nonce 기반 설정 시 dev/prod 분기 필수 (2026-04-20 교훈)

`middleware.ts`에서 nonce 기반 CSP를 구성할 때:

```typescript
// ❌ 개발 환경에서 React HMR 완전 차단
`script-src 'self' 'nonce-${nonce}'`

// ✅ dev 모드에 unsafe-eval 추가
const isDev = process.env.NODE_ENV !== 'production';
isDev ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}'`
```

- nonce를 지정하면 `unsafe-inline`/`unsafe-eval`이 자동 무효화된다 (CSP 스펙).
- `unsafe-eval` 없이 배포하면 React가 하이드레이션되지 않아 모든 인터랙션이 작동하지 않는다.
- 증상: 폼이 JS 없이 네이티브 GET으로 제출됨, Console에 `EvalError: Evaluating a string as JavaScript violates CSP`.

### Fail-Closed Guard Default Hygiene (IMPL-021 교훈)

`process.exit(1)` 또는 401 강제 분기 같은 fail-closed 보안 가드가 환경 변수에 분기할 때 **`??` / `||` fallback default 사용 금지**. unset → prod 로 fall-through 하도록 명시 화이트리스트만 사용:

```typescript
// ❌ unset 시 dev-stub 진입 (fail-open)
const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const isLocalDev = nodeEnv !== 'production';

// ❌ unset 과 정상 prod 를 구별 불가 — 운영 가시성 손상
const nodeEnv = process.env['NODE_ENV'] ?? 'production';

// ✅ 명시 화이트리스트 + unset = prod fall-through
const nodeEnv = process.env['NODE_ENV'];
const isLocalDev = nodeEnv === 'development' || nodeEnv === 'test';
```

근거: codex+gemini review-r2 합의 — fallback default 는 두 방향 모두 위험. unset 을 dev 로 보면 prod 실수 시 가드 무력화, prod 로 보면 정상 prod 와 unset prod 를 구별 못 해 모니터링 손상.

### Fail-Closed 가드 동반 NODE_ENV 정렬 (IMPL-021 교훈)

새 fail-closed 가드를 도입할 때 host dev workflow 가 죽지 않도록 다음 세 경로 모두 NODE_ENV 명시 주입을 사전 확인:

1. `services/<svc>/package.json` `"dev"` script — `"dev": "NODE_ENV=development tsx src/index.ts"` (prefix 필수)
2. `docker-compose.yml` 해당 서비스 `environment.NODE_ENV: development`
3. CI test runner / E2E spec — Playwright config, jest setup 등

가드 추가 PR 의 DoD 에 위 세 항목 grep 검증을 명시한다. IMPL-021 fix-3 (review-r3 F6) 에서 (1) 누락으로 host dev 즉사 사례 발생.

## 시크릿 하드코딩 금지

코드, 설정 파일, 커밋에 다음 패턴이 포함되면 CI에서 차단한다:

| 패턴 | 설명 |
|------|------|
| `AKIA[0-9A-Z]{16}` | AWS Access Key ID |
| `ghp_[a-zA-Z0-9]{36}` | GitHub Personal Access Token |
| `sk-[a-zA-Z0-9]{48}` | OpenAI/Anthropic API Key |
| `sk_live_`, `sk_test_` | Stripe Secret Key |
| `xoxb-`, `xoxp-` | Slack Bot/User Token |
| `-----BEGIN (RSA\|EC) PRIVATE KEY-----` | PEM Private Key |

- 모든 시크릿은 환경 변수(`process.env.*`)로만 접근한다.
- `.env`, `.key`, `.pem`, `.p12` 파일은 `.gitignore`에 등록하고 git 추적하지 않는다.
- CI Job `security-scan`에서 Semgrep `p/secrets` 룰셋으로 자동 탐지한다.
- `harness/policy.yaml`의 `deny.secrets` 섹션에서도 패턴 매칭으로 이중 검증한다.

## PHI (Protected Health Information)

- **암호화**: `bio_profiles`의 `biomarkers`, `medical_conditions`, `medications` → application-level AES-256.
- **감사 로그 필수 트리거**:
  - `GET /users/me/bio-profile` → READ
  - `POST /users/me/bio-profile` (온보딩 생성 시) → WRITE
  - `PATCH /users/me/bio-profile` (PHI 변경 시) → WRITE
  - `POST /meal-plans/generate` → READ (phi_minimizer 추출 시)
  - `DELETE /users/me` → DELETE (파기 시작 시)
  - 관리자 건강 데이터 조회 → READ + 관리자 이메일 기록
- **fail-closed**: 감사 로그 기록 실패 → 원래 요청도 500 반환. BFF는
  `pickUpstreamError` 로 BE 의 `{error:{code:'AUDIT_LOG_FAILURE'}}` 500 을
  그대로 전달한다 (별도 코드 변경 없음).

## 계정 삭제 (Right to Deletion)

사용자 삭제 요청 시 **즉시 처리**:
1. `users.deleted_at` 세팅 (로그인 차단)
2. `bio_profiles` ePHI 필드 DEK 즉시 폐기
3. `subscriptions.status` = `'expired'`, Stripe 구독 해지
4. S3 `celebbase-phi/{user_id}/` 삭제 예약

**30일 유예** (복구 요청 대비):
- 복구 시 DEK 재발급 + `deleted_at` 해제

**유예 후 배치 처리**:
5. `bio_profiles` hard delete
6. `daily_logs` hard delete
7. `diet_view_events` hard delete
8. `instacart_orders.user_id` → NULL (재무 감사용 보존)
9. `meal_plans.deleted_at` 세팅
10. S3 OCR 원본 완전 삭제
11. Cognito 계정 삭제
12. `users` hard delete (FK 참조 제거 후)
13. 파기 완료 확인 이메일

`phi_access_logs`는 HIPAA 6년 보관 의무에 따라 유지. 암호화 상세: spec.md § 9.3 참조.
