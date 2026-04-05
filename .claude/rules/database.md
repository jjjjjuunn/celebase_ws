---
paths:
  - "services/**/*"
  - "db/**/*"
  - "packages/shared-types/**/*"
---
# Database & Data Integrity Rules

## 핵심 원칙

- **soft delete**: 모든 주요 엔티티는 `deleted_at` 컬럼으로 처리. `DELETE` SQL 직접 실행 금지.
  - 예외: ePHI 데이터는 별도 파기 절차 (→ `security.md` 참조)
- **마이그레이션 필수**: 스키마 변경은 `db/migrations/`에 파일로 작성. 직접 ALTER TABLE 금지.
- **UUID v7**: 모든 primary key는 시간순 정렬 가능한 UUID v7 사용.
  - DB 기본값: `uuid_generate_v7()` (`pg_uuidv7` 확장 제공)
  - TypeScript 앱 레이어: `uuidv7` 패키지 (`npm: uuidv7`)
  - Python 앱 레이어: `uuid7` 패키지 (`pip: uuid7`)
  - `gen_random_uuid()` (UUID v4) 사용 금지 — CI에서 자동 탐지하여 fail 처리
- **JSONB 스키마 문서화**: JSONB 컬럼 추가/수정 시 `packages/shared-types/`에 TypeScript 타입 정의.

## 마이그레이션 규칙

- forward-only. rollback은 새 migration으로 되돌린다.
- 0-downtime 호환 필수:
  - 컬럼 추가: nullable 또는 default 값
  - 컬럼 삭제: 2단계 (코드에서 참조 제거 → 배포 → migration)
  - 컬럼 이름 변경: 금지. 새 컬럼 추가 → 복사 → 구 컬럼 삭제
  - 인덱스 생성: `CONCURRENTLY` 필수

## 성능

- **N+1 금지**: JOIN 또는 배치 조회(`WHERE id IN (...)`) 사용.
- **인덱스 필수**: WHERE, ORDER BY, JOIN 대상 컬럼에 인덱스.
- **EXPLAIN ANALYZE**: 새 쿼리 추가 시 실행 계획을 PR에 포함 (1만 건 이상 대상).
- **Connection pool**: PgBouncer, 서비스당 최대 20 connections.

## PHI 접근 감사

- `bio_profiles` 건강 필드에 접근하는 모든 서비스는 `phi_access_logs`에 기록.
- 기록 항목: 접근 주체(서비스명+버전), 접근 필드, 목적, 요청 ID.
- 기록 실패 시 원래 요청도 차단 (fail-closed).
