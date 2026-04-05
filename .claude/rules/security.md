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
  - `PATCH /users/me/bio-profile` (PHI 변경 시) → WRITE
  - `POST /meal-plans/generate` → READ (phi_minimizer 추출 시)
  - `DELETE /users/me` → DELETE (파기 시작 시)
  - 관리자 건강 데이터 조회 → READ + 관리자 이메일 기록
- **fail-closed**: 감사 로그 기록 실패 → 원래 요청도 500 반환.

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
