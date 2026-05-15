# Migration Rollback Runbook

> Owner: JUNWON (BE/infra). Applies to staging only — prod 적용은 `CHORE-PROD-MIGRATION-PIPELINE-001` 별도.
> 작성: 2026-05-15, `CHORE-STAGING-MIGRATION-PIPELINE-001` 산출물.

본 runbook 은 CD migration auto-runner (`docker compose run --rm db-migrate`) 의 운영 절차 + 비정상 상황 대응을 다룹니다.

---

## Setup (one-time, per host)

본 chore 머지 후 staging EC2 에서 **한 번만** 수행. 이후 CD 가 자동 실행.

### Step 1 — db-migrate service 블록 추가 to `/app/docker-compose.yml`

dev `docker-compose.yml` L33-63 의 `db-migrate` 블록을 그대로 복사 + staging-specific env 매핑.

```yaml
db-migrate:
  image: postgres:16-alpine
  entrypoint: ["sh", "-c"]
  command:
    - |
      set -eu
      psql -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS pgmigrations (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL, run_on TIMESTAMP NOT NULL)"
      for f in $$(ls /db/migrations/*.sql | sort); do
        name=$$(basename "$$f" .sql)
        exists=$$(psql -tAc "SELECT 1 FROM pgmigrations WHERE name='$$name'")
        if [ -z "$$exists" ]; then
          echo ">> Applying $$name"
          psql -v ON_ERROR_STOP=1 -f "$$f"
          psql -c "INSERT INTO pgmigrations(name, run_on) VALUES ('$$name', NOW())"
        else
          echo ">> Skipping $$name (already applied)"
        fi
      done
  environment:
    PGHOST: postgres
    PGUSER: celebbase
    PGDATABASE: celebase
    PGPASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - ./db:/db:ro
  restart: "no"
  depends_on:
    postgres:
      condition: service_healthy
```

`POSTGRES_PASSWORD` 는 `/app/.env.staging` 의 기존 값을 그대로 사용.

### Step 2 — `pgmigrations` reconciliation (CR2)

2026-05-14 incident 때 staging EC2 에 0010 + 0012 가 직접 `ALTER TABLE` 로 적용됐지만 `pgmigrations` row 가 미 insert 됨. 첫 CD migration step 이 0010 을 재적용 시도 → `ALTER TABLE ADD COLUMN` (IF NOT EXISTS 없음) → fail.

따라서 첫 CD 실행 **전에** 이미 적용된 migration 을 `pgmigrations` 에 mark.

```bash
ssh staging-ec2
cd /app

# 현재 pgmigrations 가 존재하는지 확인 (없으면 db-migrate 가 자동 생성 — 첫 실행 시)
docker compose exec postgres psql -U celebbase -d celebase -c "\d pgmigrations" 2>&1 | head -5

# 만약 위에서 "table not found" 면, 다음 INSERT 전에 먼저 table 생성:
docker compose exec -T postgres psql -U celebbase -d celebase <<'SQL'
CREATE TABLE IF NOT EXISTS pgmigrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  run_on TIMESTAMP NOT NULL
);
SQL

# 이미 적용된 18 migration 을 pgmigrations 에 reconcile (0001~0019, 0004 gap)
docker compose exec -T postgres psql -U celebbase -d celebase <<'SQL'
INSERT INTO pgmigrations (name, run_on)
SELECT name, NOW()
FROM (VALUES
  ('0001_initial-schema'),
  ('0002_phi-encryption-columns'),
  ('0003_meal-plans-add-preferences'),
  ('0005_subscription-stripe-index'),
  ('0006_quota-enforcement'),
  ('0007_refresh-tokens'),
  ('0008_processed-events'),
  ('0009_tier-sync-idempotency'),
  ('0010_users-preferred-celebrity'),
  ('0011_recipes-citation-columns'),
  ('0012_users_preferences'),
  ('0013_meal_plans_confirmed_at'),
  ('0014_lifestyle_claims'),
  ('0015_lifestyle_claims_admin'),
  ('0016_processed_events_expand_ddl'),
  ('0017_processed_events_partial_unique'),
  ('0018_subscriptions_revenuecat_columns'),
  ('0019_nutrition_provenance')
) AS m(name)
ON CONFLICT (name) DO NOTHING;
SQL

# 검증 — 18 row 예상 (0004 gap)
docker compose exec postgres psql -U celebbase -d celebase -c \
  "SELECT COUNT(*) FROM pgmigrations;"
```

### Step 3 — 첫 CD 실행 검증

본 chore PR 머지 후 CD 자동 trigger. GitHub Actions log 에서:

```
▶ applying pending DB migrations...
>> Skipping 0001_initial-schema (already applied)
>> Skipping 0002_phi-encryption-columns (already applied)
...
>> Skipping 0019_nutrition_provenance (already applied)
▶ migration sanity check...
✅ migration sanity OK (5 critical columns verified, smoke tier)
```

위와 같이 모두 skip + sanity OK 면 setup 완료.

---

## Migration Classification Policy

CD 자동 적용 허용 범위 — **additive only**.

### Additive (autorun 허용)

application 변경 없이 호환:
- `ADD COLUMN ... DEFAULT ... NULL` (nullable 또는 default 있음)
- `CREATE INDEX [CONCURRENTLY]`
- `CREATE TABLE` (신규 table)
- `CREATE [OR REPLACE] FUNCTION / VIEW / TRIGGER`
- `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` (검증은 별도 step)

### Destructive (manual gate 필요)

CD 가 자동 적용 거부 + manual approval 후 실행:
- `DROP COLUMN / TABLE / INDEX / FUNCTION`
- `ALTER COLUMN ... TYPE` (type change)
- `ALTER COLUMN ... SET NOT NULL` (existing NULL 행 위반 가능)
- `RENAME COLUMN / TABLE`
- `ALTER TABLE ... DROP CONSTRAINT`
- `TRUNCATE`

### Mixed

application 변경 + DB migration 동시 의무 (expand-then-contract pattern). review 후 결정.

### Migration file header convention

신규 migration 부터 file 첫 줄에 classification 명시:

```sql
-- migration-class: additive
-- 0020_some_change.sql — brief description

ALTER TABLE foo ADD COLUMN bar TEXT;
```

`destructive` 또는 `mixed` 인 경우 PR description 에 명시 + reviewer 가 manual gate 필요 확인.

---

## Incident Response — Partial Schema Rollback

19 migration 중 N 번째에서 fail 시 1..N-1 적용된 상태. application 은 이전 image (rollback target) 인데 DB 는 부분 새 schema → mismatch 가능.

### Step 1 — 진단

```bash
ssh staging-ec2
cd /app

# 어디까지 적용됐는지 확인
docker compose exec postgres psql -U celebbase -d celebase -c \
  "SELECT name FROM pgmigrations ORDER BY run_on DESC LIMIT 10;"

# 어떤 migration 이 fail 했는지 확인
docker compose logs db-migrate --tail 50
```

### Step 2 — 결정

| Case | 대응 |
|------|------|
| **A. fail 한 migration 이 additive 만** | 적용된 migration 은 그대로 유지 (application 호환). fail 한 migration fix 후 새 PR 로 retry |
| **B. fail 한 migration 이 destructive (예: DROP)** | application image 의 schema 기대 mismatch. **즉시 image rollback** + DB 의 partial drop 은 별도 migration 으로 복구 |
| **C. mixed migration 의 expand step 만 적용** | application rollback target 이 expand 이전 image — DB 의 새 column 은 무시. 다음 deploy 에서 contract step 의무 |

### Step 3 — image rollback (CD 자동)

CD healthcheck 가 180s 안에 200 못 받으면 자동 rollback 트리거 (`WEB_IMAGE_REF=<previous>` 으로 web 컨테이너만 revert). DB schema 는 그대로 — 위 case 별 대응 필요.

### Step 4 — DB schema 복구 (manual)

destructive migration 으로 column 등이 사라졌으면 **새 migration 으로 복구** (forward-only 정책). 절대 직접 `ALTER TABLE` 하지 말 것 — `pgmigrations` 와의 drift 가 다시 발생.

```bash
# 새 migration 작성 (예: 0020_restore_dropped_column.sql)
# -- migration-class: additive
# ALTER TABLE foo ADD COLUMN restored_bar TEXT;
# (with data backfill from backup)

# 새 PR → main → CD 자동 apply
```

---

## Manual Migration Execution (emergency)

CD 가 막혀있고 즉시 migration 적용 필요 시:

```bash
ssh staging-ec2
cd /app

# 1. (선택) backup
docker compose exec -T postgres pg_dump -U celebbase -d celebase --schema-only > /tmp/staging-schema-$(date +%Y%m%d-%H%M).sql

# 2. db-migrate 직접 실행
docker compose run --rm db-migrate

# 3. sanity check
bash /app/scripts/migration-sanity.sh
```

본 emergency 후엔 반드시 root cause 파악 + CD pipeline fix.

---

## DB Snapshot Restore (last resort)

prod 가 아닌 staging 에선 명시적 snapshot 없음 (`CHORE-DB-BACKUP-001` 머지 후 daily backup 활성). emergency 시:

```bash
# pg_dump 로 임시 snapshot (위 manual 의 step 1 참조)
# 또는 EC2 EBS volume snapshot (AWS console)

# 복구 시 — psql -f <dump> 으로 schema 만 또는 schema+data
docker compose exec -T postgres psql -U celebbase -d celebase < /tmp/staging-schema-XXX.sql

# 복구 후 pgmigrations 도 재동기화 필요 (위 reconciliation 절차)
```

---

## Cross-references

- `docs/SESSION-2026-05-15-mobile-auth-incident.md` — 본 chore 의 trigger incident
- `docs/PROD-DEPLOY-ROADMAP.md` G3 — 본 chore 의 상위 context
- `docker-compose.yml` L33-63 — db-migrate service 정의 (dev)
- `scripts/migration-sanity.sh` — 본 runbook 의 sanity check
- `scripts/preflight-env.sh` — env 검증 패턴 reference
- `.claude/rules/database.md` — forward-only 정책
- `CHORE-PROD-MIGRATION-PIPELINE-001` — prod 적용 (별도 chore, pg_dump + manual gate)
