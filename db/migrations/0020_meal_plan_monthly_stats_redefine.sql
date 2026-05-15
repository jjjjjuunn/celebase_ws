-- 0020_meal_plan_monthly_stats_redefine.sql
-- IMPL-MEAL-P0-DAILY-001-b: PR-C1 의 daily_totals 실제 합산 + daily_targets 신규
-- 필드 도입 (PR #95) 으로 인한 meal_plan_monthly_stats MV redefine.
--
-- PostgreSQL 은 CREATE OR REPLACE MATERIALIZED VIEW 미지원 → DROP + CREATE 패턴.
-- services/analytics-service/src/lib/mview-refresh.scheduler.ts 의
-- pg_try_advisory_lock + try-catch 가 `skipped_lock_contention` 으로
-- graceful skip 처리 (Plan §Task 4 verified — leave scheduler running 안전).
--
-- 컬럼 변경:
--   - avg_daily_calories (::int)
--     → avg_daily_actual_calories (::numeric)
--       = day_elem->'daily_totals'->>'calories' (PR-C1 의 실제 합산값)
--   - 신규 avg_daily_target_calories (::numeric)
--     = day_elem->'daily_targets'->>'target_kcal' (PR-C1 의 신규 target 필드)
--   - ::int → ::numeric: _round_totals 가 round(2) 적용한 소수점 정밀도 보존
--
-- Backward-compat: 기존 row 의 daily_plans JSONB 는 daily_targets 부재.
-- JSON path 가 NULL 반환 → AVG() 가 NULL 무시 (PG standard behavior).
-- 새 plan 부터 자연스럽게 백필.
--
-- Consumer 부재 확인 (2026-05-15):
--   grep -rn 'avg_daily_calories' services/ → 0 hits
--   analytics-service/src/services/reports.service.ts 는 total_plans + avg_duration
--   만 SELECT (Plan §Task 4 Codex-1 review 정정).

DROP MATERIALIZED VIEW IF EXISTS meal_plan_monthly_stats CASCADE;

CREATE MATERIALIZED VIEW meal_plan_monthly_stats AS
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

CREATE UNIQUE INDEX idx_mps_user_month ON meal_plan_monthly_stats(user_id, month);

-- 첫 REFRESH (migration apply 직후):
--   REFRESH MATERIALIZED VIEW meal_plan_monthly_stats;
--   (UNIQUE INDEX 도입 직후라 lock 짧음, non-concurrent 안전)
-- 이후 갱신 (15분 cron):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY meal_plan_monthly_stats;
