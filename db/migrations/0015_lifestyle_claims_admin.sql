-- IMPL-021 · Admin moderation cascade
-- spec §9.3 #3: 셀러브리티 비활성화(is_active TRUE→FALSE) 시
-- 해당 셀럽의 모든 published lifestyle_claim 을 즉시 archived 로 전환한다.
-- 부분 인덱스(idx_lifestyle_claims_celeb 등)가 status='published' 를 전제로 하므로,
-- 셀럽 비활성 직후에도 사용자에게 노출되는 잔재 claim 이 없도록 DB 레이어에서 보장한다.
--
-- Forward-only. Rollback via new migration if needed.

-- ============================================
-- TRIGGER FUNCTION: cascade celebrity deactivate to lifestyle_claims
-- ============================================
CREATE OR REPLACE FUNCTION cascade_celebrity_deactivate_to_claims()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act on TRUE → FALSE transitions. Re-activation 또는
    -- is_active 무관 update 에서는 published claim 을 건드리지 않는다.
    IF OLD.is_active IS DISTINCT FROM NEW.is_active
       AND OLD.is_active = TRUE
       AND NEW.is_active = FALSE THEN
        UPDATE lifestyle_claims
        SET status = 'archived',
            updated_at = NOW()
        WHERE celebrity_id = NEW.id
          AND status = 'published';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: AFTER UPDATE OF is_active on celebrities
-- ============================================
CREATE TRIGGER trg_celebrities_deactivate_cascade_claims
    AFTER UPDATE OF is_active ON celebrities
    FOR EACH ROW
    EXECUTE FUNCTION cascade_celebrity_deactivate_to_claims();
