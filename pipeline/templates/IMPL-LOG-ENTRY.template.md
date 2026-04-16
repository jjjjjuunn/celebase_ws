# IMPLEMENTATION_LOG 엔트리 템플릿

> `docs/IMPLEMENTATION_LOG.md`에 추가할 때 이 블록을 그대로 복사해서 값을 채운다.
> **heading-only 스타일(`## [날짜] Feature:`)은 금지** — `scripts/validate_impl_log.py`에서 reject된다.

## 복사 시작 ↓

```markdown

---
date: YYYY-MM-DD
agent: <모델 식별자> (예: claude-opus-4-6, claude-sonnet-4-6, claude-opus-4-6 + codex-o3)
task_id: <TASK-ID> (예: IMPL-014)
commit_sha: PENDING
files_changed:
  - <변경 파일 경로>
  - <변경 파일 경로>
verified_by: <검증자> (예: claude-opus-4-6, claude-opus-4-6 + codex-review)
---
### 완료: <한 줄 요약>
- <구현 내용 bullet>
- <설계 결정 bullet>
- <테스트 결과>
### 미완료: <다음 세션 작업, 기술 부채>
### 연관 파일: <쉼표 구분 경로>
```

## 복사 끝 ↑

## 규칙

1. **필수 필드** (validator가 강제): `date`, `agent`, `task_id`, `commit_sha`, `verified_by`
2. **commit_sha 수급 (2-commit 패턴)**:
   - feat/fix 커밋 시 `commit_sha: PENDING`으로 기재
   - 커밋 직후 `scripts/record-log-sha.sh <TASK-ID>` 실행 → 실제 SHA로 치환
   - 별도 `docs(log): record <TASK-ID> commit SHA` 커밋으로 마무리
3. **PENDING은 최신 엔트리 1건에만 허용**. 이전 엔트리에 PENDING이 남아있으면 validator fail.
4. **all-digit SHA 주의**: `1118314` 같은 all-digit SHA는 YAML에서 int로 파싱되지만 validator가 str로 coerce하므로 따옴표 없이도 OK.
5. **본문 3섹션**: `### 완료`, `### 미완료`, `### 연관 파일` 순서 고정.
6. **append-only**: 기존 엔트리 수정/삭제 금지. 정정이 필요하면 새 엔트리로 `### 정정: <task_id>` 추가.

## 예시

```markdown

---
date: 2026-04-14
agent: claude-opus-4-6 + codex (adversarial review ×2)
task_id: IMPL-013
commit_sha: e887448
files_changed:
  - services/meal-plan-engine/src/services/quota_service.py
  - services/meal-plan-engine/src/routes/meal_plans.py
  - db/migrations/0006_quota-enforcement.sql
verified_by: claude-opus-4-6 + codex-review
---
### 완료: 구독 Quota Enforcement (Phase B) — IMPL-013
- Tier 한도: Free=0, Premium=4/month, Elite=unlimited
- pg_advisory_xact_lock 기반 atomic COUNT+INSERT
- 46개 unit test PASS
### 미완료: Stripe Customer Portal, Redis circuit breaker
### 연관 파일: services/meal-plan-engine/src/services/quota_service.py, ...
```
