-- 0020_meal_plan_monthly_stats_redefine.sql
-- IMPL-MEAL-P0-DAILY-001-b: PR-C1 (#95) 의 daily_totals 실제 합산 + daily_targets
-- 신규 필드 도입으로 인한 meal_plan_monthly_stats MV redefine.
--
-- ## 0-Downtime Pattern: Build-Refresh-Swap (fix-1 Gemini CRITICAL)
--
-- 단순 DROP + CREATE 패턴은 `.claude/rules/database.md` 의 "0-downtime 호환 필수"
-- 규칙 위반 (DROP ~ CREATE 사이 gap 동안 `relation does not exist`). 대신:
--
--   1) 새 MV (`_v2`) 생성 — 기존 MV 영향 X, SELECT 계속 가능
--   2) CREATE UNIQUE INDEX CONCURRENTLY — `.claude/rules/database.md` 의무 준수.
--      빈 MV 직후라 instant 완료
--   3) REFRESH `_v2` — 실제 데이터 채움 (lock 없음, 기존 MV active 유지)
--   4) BEGIN; 4-RENAME atomic swap; COMMIT;  — ACCESS EXCLUSIVE lock 짧음 (ms),
--      SELECT 가 잠시 wait 하지만 fail 안 함 → 0-downtime
--   5) 구 MV DROP (CASCADE 없이 — fail-safe, 의존 발생 시 migration fail)
--
-- ## 컬럼 변경
--   - avg_daily_calories (::int) → avg_daily_actual_calories (::numeric)
--     = day_elem->'daily_totals'->>'calories' (PR-C1 의 실제 합산값)
--   - 신규 avg_daily_target_calories (::numeric)
--     = day_elem->'daily_targets'->>'target_kcal' (PR-C1 의 신규 target 필드)
--   - ::int → ::numeric: PR-C1 `_round_totals` 의 round(2) 소수점 정밀도 보존
--
-- ## Backward-compat 주의 (Gemini MEDIUM, application 측 책임 위임)
--   - 기존 row 의 daily_plans JSONB 는 daily_targets 부재 → NULL.
--   - AVG() 는 NULL 무시 (PG standard) → avg_daily_target_calories 가
--     PR-C1 이후 plan 의 partial sample 로 계산됨 (월 중반 도입 시 왜곡 가능).
--   - FE/BFF 가 `plans_generated` 와 비교해 partial month 검출 권장.
--
-- ## Node.js `pg` driver 주의 (Gemini MEDIUM, future-proof)
--   - `::numeric` 은 `pg` 8.x 기본 parser 가 string 으로 반환 (BigDecimal 안전).
--   - 미래 consumer 작성 시 `parseFloat(row.avg_daily_actual_calories)` 명시 변환.
--   - 현재 consumer 부재 확인 (2026-05-15): `grep -rn 'avg_daily_calories' services/` → 0 hits.
--
-- ## Rollback (forward-only 원칙, 후속 migration 으로)
--   장애 발생 시 후속 migration 으로 새 RENAME swap 패턴 적용:
--     CREATE MATERIALIZED VIEW meal_plan_monthly_stats_rb AS <0001 정의>;
--     BEGIN; 4-RENAME atomic swap; COMMIT;
--     DROP MATERIALIZED VIEW meal_plan_monthly_stats_v2_old;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: 새 MV (_v2) 생성 — 기존 MV 와 분리, SELECT 계속 가능
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW meal_plan_monthly_stats_v2 AS
SELECT
    mp.user_id,
    DATE_TRUNC('month', mp.start_date) AS month,
    COUNT(DISTINCT mp.id) AS plans_generated,
    AVG((day_elem->'daily_totals'->>'calories')::numeric) AS avg_daily_actual_calories,
    AVG((day_elem->'daily_targets'->>'target_kcal')::numeric) AS avg_daily_target_calories,
    COUNT(DISTINCT mp.id) FILTER (WHERE mp.status = 'completed') AS completed_count
FROM meal_plans mp,
     jsonb_array_elements(mp.daily_plans) AS day_elem
WHERE mp.deleted_at IS NULL
GROUP BY mp.user_id, DATE_TRUNC('month', mp.start_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: UNIQUE INDEX CONCURRENTLY (.claude/rules/database.md 의무)
--         빈 MV 직후 — lock 거의 없이 instant 완료
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX CONCURRENTLY idx_mps_user_month_v2
  ON meal_plan_monthly_stats_v2(user_id, month);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: 실제 데이터 채우기 (REFRESH, lock 없음 — 기존 MV active 유지)
-- ─────────────────────────────────────────────────────────────────────────────

REFRESH MATERIALIZED VIEW meal_plan_monthly_stats_v2;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: 0-downtime atomic swap
--         BEGIN/COMMIT 안에서 4 RENAME — ACCESS EXCLUSIVE lock 짧음 (ms 단위)
--         SELECT 가 잠시 wait 하지만 fail 안 함 (0-downtime guarantee)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;
  ALTER MATERIALIZED VIEW meal_plan_monthly_stats RENAME TO meal_plan_monthly_stats_old;
  ALTER INDEX idx_mps_user_month RENAME TO idx_mps_user_month_old;
  ALTER MATERIALIZED VIEW meal_plan_monthly_stats_v2 RENAME TO meal_plan_monthly_stats;
  ALTER INDEX idx_mps_user_month_v2 RENAME TO idx_mps_user_month;
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: 구 MV 삭제 (CASCADE 없이 — fail-safe, 의존 발생 시 migration fail)
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW meal_plan_monthly_stats_old;

-- 이후 갱신 (15분 cron, services/analytics-service/src/lib/mview-refresh.scheduler.ts):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY meal_plan_monthly_stats;
