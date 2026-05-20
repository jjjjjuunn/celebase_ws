import { describe, it, expect } from '@jest/globals';
import { computeTrialState, TRIAL_DURATION_MS } from '../../src/lib/trial.js';

describe('computeTrialState', () => {
  const now = new Date('2026-05-20T12:00:00.000Z');

  it('returns no trial for paid tiers', () => {
    const justOnboarded = new Date(now.getTime() - 1000);
    expect(computeTrialState('premium', justOnboarded, now)).toEqual({
      trial_active: false,
      trial_ends_at: null,
    });
    expect(computeTrialState('elite', justOnboarded, now)).toEqual({
      trial_active: false,
      trial_ends_at: null,
    });
  });

  it('returns no trial when onboarding is incomplete (no bio profile)', () => {
    expect(computeTrialState('free', null, now)).toEqual({
      trial_active: false,
      trial_ends_at: null,
    });
  });

  it('is active for a free user within the trial window', () => {
    const createdAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const state = computeTrialState('free', createdAt, now);
    expect(state.trial_active).toBe(true);
    expect(state.trial_ends_at).toBe(
      new Date(createdAt.getTime() + TRIAL_DURATION_MS).toISOString(),
    );
  });

  it('is inactive for a free user past the trial window (but still reports ends_at)', () => {
    const createdAt = new Date(now.getTime() - (TRIAL_DURATION_MS + 1000));
    const state = computeTrialState('free', createdAt, now);
    expect(state.trial_active).toBe(false);
    expect(state.trial_ends_at).toBe(
      new Date(createdAt.getTime() + TRIAL_DURATION_MS).toISOString(),
    );
  });

  it('treats the exact expiry instant as expired (strict <)', () => {
    const createdAt = new Date(now.getTime() - TRIAL_DURATION_MS);
    expect(computeTrialState('free', createdAt, now).trial_active).toBe(false);
  });
});
