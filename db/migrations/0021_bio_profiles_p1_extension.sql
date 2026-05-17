-- IMPL-MEAL-P1-PROFILE-SCHEMA-001: bio_profiles P1 extension
-- exercise_sessions: 운동 세션 패턴 (P1-D Exercise EE Model B 입력)
-- goal_pace: 감량/증량 속도 사용자 선택 (P1-C calorie_adjuster 분기 입력)
--
-- 두 컬럼 모두 NOT NULL + DEFAULT — 기존 row 즉시 valid 값 가짐, downstream 코드 단순화.
-- goal_pace DEFAULT 'moderate' = 현재 calorie_adjuster.GOAL_FACTORS weight_loss=0.80 과 일치 (backward-compat).

ALTER TABLE bio_profiles
  ADD COLUMN exercise_sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN goal_pace VARCHAR(20) NOT NULL DEFAULT 'moderate'
    CHECK (goal_pace IN ('slow', 'moderate', 'aggressive'));
