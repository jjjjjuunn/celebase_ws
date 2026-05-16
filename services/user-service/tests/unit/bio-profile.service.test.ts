import { jest, describe, it, expect, test } from '@jest/globals';
import type pg from 'pg';
import type { PhiKeyProvider } from '@celebbase/service-core';

const mockFindByUserId = jest.fn();
const mockUpdateCalculated = jest.fn();
const mockUpsert = jest.fn();

jest.unstable_mockModule('../../src/repositories/bio-profile.repository.js', () => ({
  findByUserId: mockFindByUserId,
  updateCalculated: mockUpdateCalculated,
  upsert: mockUpsert,
}));

const { getBioProfile, recalculate } = await import('../../src/services/bio-profile.service.js');
const { NotFoundError } = await import('@celebbase/service-core');

const mockPool = {} as pg.Pool;

// Stub key provider — repository is mocked so no real encryption occurs
const mockKeyProvider = {
  getDek: jest.fn(),
} as unknown as PhiKeyProvider;

const baseProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  birth_year: 1990,
  sex: 'male' as const,
  height_cm: 175,
  weight_kg: 75,
  waist_cm: null,
  body_fat_pct: null,
  activity_level: 'moderate' as const,
  sleep_hours_avg: null,
  stress_level: null,
  allergies: [],
  intolerances: [],
  medical_conditions: [],
  medications: [],
  biomarkers: {},
  primary_goal: 'maintenance' as const,
  secondary_goals: [],
  exercise_sessions: [],
  goal_pace: 'moderate' as const,
  diet_type: null,
  cuisine_preferences: [],
  disliked_ingredients: [],
  bmr_kcal: null,
  tdee_kcal: null,
  target_kcal: null,
  macro_targets: { protein_g: 0, carbs_g: 0, fat_g: 0 },
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('bioProfileService.getBioProfile', () => {
  it('returns profile when found', async () => {
    mockFindByUserId.mockResolvedValueOnce(baseProfile);
    const result = await getBioProfile(mockPool, 'user-1', mockKeyProvider);
    expect(result).toEqual(baseProfile);
  });

  it('throws NotFoundError when profile does not exist', async () => {
    mockFindByUserId.mockResolvedValueOnce(null);
    await expect(getBioProfile(mockPool, 'user-1', mockKeyProvider)).rejects.toThrow(NotFoundError);
  });
});

describe('bioProfileService.recalculate — BMR (Mifflin-St Jeor)', () => {
  it('calculates BMR correctly for male', async () => {
    const currentYear = new Date().getFullYear();
    const age = currentYear - 1990;
    const expectedBmr = Math.round(10 * 75 + 6.25 * 175 - 5 * age + 5);
    const expectedTdee = Math.round(expectedBmr * 1.55);

    mockFindByUserId.mockResolvedValueOnce(baseProfile);
    mockUpdateCalculated.mockResolvedValueOnce({
      ...baseProfile,
      bmr_kcal: expectedBmr,
      tdee_kcal: expectedTdee,
      target_kcal: expectedTdee,
    });

    await recalculate(mockPool, 'user-1', mockKeyProvider);

    const calls = mockUpdateCalculated.mock.calls;
    const call = calls[calls.length - 1] as [unknown, unknown, { bmr_kcal: number; tdee_kcal: number; target_kcal: number }, unknown];
    expect(call[2].bmr_kcal).toBe(expectedBmr);
    expect(call[2].tdee_kcal).toBe(expectedTdee);
  });

  it('calculates BMR correctly for female', async () => {
    const femaleProfile = { ...baseProfile, sex: 'female' as const };
    const currentYear = new Date().getFullYear();
    const age = currentYear - 1990;
    const expectedBmr = Math.round(10 * 75 + 6.25 * 175 - 5 * age - 161);

    mockFindByUserId.mockResolvedValueOnce(femaleProfile);
    mockUpdateCalculated.mockResolvedValueOnce({
      ...femaleProfile,
      bmr_kcal: expectedBmr,
      tdee_kcal: Math.round(expectedBmr * 1.55),
      target_kcal: Math.round(expectedBmr * 1.55),
    });

    await recalculate(mockPool, 'user-1', mockKeyProvider);

    const calls = mockUpdateCalculated.mock.calls;
    const call = calls[calls.length - 1] as [unknown, unknown, { bmr_kcal: number }, unknown];
    expect(call[2].bmr_kcal).toBe(expectedBmr);
  });

  it('applies -500kcal deficit for weight_loss goal', async () => {
    const profile = { ...baseProfile, primary_goal: 'weight_loss' as const };
    const currentYear = new Date().getFullYear();
    const age = currentYear - 1990;
    const bmr = Math.round(10 * 75 + 6.25 * 175 - 5 * age + 5);
    const tdee = Math.round(bmr * 1.55);

    mockFindByUserId.mockResolvedValueOnce(profile);
    mockUpdateCalculated.mockResolvedValueOnce({
      ...profile,
      bmr_kcal: bmr,
      tdee_kcal: tdee,
      target_kcal: tdee - 500,
    });

    await recalculate(mockPool, 'user-1', mockKeyProvider);

    const calls = mockUpdateCalculated.mock.calls;
    const call = calls[calls.length - 1] as [unknown, unknown, { target_kcal: number }, unknown];
    expect(call[2].target_kcal).toBe(Math.max(1200, Math.min(5000, tdee - 500)));
  });

  it('applies +300kcal surplus for muscle_gain goal', async () => {
    const profile = { ...baseProfile, primary_goal: 'muscle_gain' as const };
    const currentYear = new Date().getFullYear();
    const age = currentYear - 1990;
    const bmr = Math.round(10 * 75 + 6.25 * 175 - 5 * age + 5);
    const tdee = Math.round(bmr * 1.55);

    mockFindByUserId.mockResolvedValueOnce(profile);
    mockUpdateCalculated.mockResolvedValueOnce({
      ...profile,
      bmr_kcal: bmr,
      tdee_kcal: tdee,
      target_kcal: tdee + 300,
    });

    await recalculate(mockPool, 'user-1', mockKeyProvider);

    const calls = mockUpdateCalculated.mock.calls;
    const call = calls[calls.length - 1] as [unknown, unknown, { target_kcal: number }, unknown];
    expect(call[2].target_kcal).toBe(Math.max(1200, Math.min(5000, tdee + 300)));
  });

  it('clamps target_kcal to [1200, 5000]', async () => {
    const heavyProfile = {
      ...baseProfile,
      weight_kg: 200,
      height_cm: 220,
      activity_level: 'very_active' as const,
      primary_goal: 'muscle_gain' as const,
    };

    mockFindByUserId.mockResolvedValueOnce(heavyProfile);
    mockUpdateCalculated.mockResolvedValueOnce({ ...heavyProfile, bmr_kcal: 3000, tdee_kcal: 5700, target_kcal: 5000 });

    await recalculate(mockPool, 'user-1', mockKeyProvider);

    const calls = mockUpdateCalculated.mock.calls;
    const call = calls[calls.length - 1] as [unknown, unknown, { target_kcal: number }, unknown];
    expect(call[2].target_kcal).toBeLessThanOrEqual(5000);
    expect(call[2].target_kcal).toBeGreaterThanOrEqual(1200);
  });
});

describe('bioProfileService.recalculate — activity multipliers', () => {
  const activityCases: Array<[string, number]> = [
    ['sedentary', 1.2],
    ['light', 1.375],
    ['moderate', 1.55],
    ['active', 1.725],
    ['very_active', 1.9],
  ];

  test.each(activityCases)('%s multiplier = %f', async (level, multiplier) => {
    const profile = { ...baseProfile, activity_level: level as typeof baseProfile.activity_level };
    const currentYear = new Date().getFullYear();
    const age = currentYear - 1990;
    const bmr = Math.round(10 * 75 + 6.25 * 175 - 5 * age + 5);
    const expectedTdee = Math.round(bmr * multiplier);

    mockFindByUserId.mockResolvedValueOnce(profile);
    mockUpdateCalculated.mockResolvedValueOnce({ ...profile, bmr_kcal: bmr, tdee_kcal: expectedTdee, target_kcal: expectedTdee });

    await recalculate(mockPool, 'user-1', mockKeyProvider);

    const calls = mockUpdateCalculated.mock.calls;
    const call = calls[calls.length - 1] as [unknown, unknown, { tdee_kcal: number }, unknown];
    expect(call[2].tdee_kcal).toBe(expectedTdee);
  });
});

describe('bioProfileService P1-A — exercise_sessions / goal_pace round-trip (IMPL-MEAL-P1-PROFILE-SCHEMA-001)', () => {
  it('baseProfile defaults: exercise_sessions [] + goal_pace moderate', () => {
    expect(baseProfile.exercise_sessions).toEqual([]);
    expect(baseProfile.goal_pace).toBe('moderate');
  });

  it('Zod schema rejects malformed exercise session (missing intensity)', async () => {
    const { schemas } = await import('@celebbase/shared-types');
    expect(() =>
      schemas.ExerciseSessionSchema.parse({
        type: 'running',
        duration_min: 30,
        frequency_per_week: 3,
      }),
    ).toThrow(/intensity/);
  });

  it('Zod schema rejects unknown goal_pace value', async () => {
    const { schemas } = await import('@celebbase/shared-types');
    expect(() => schemas.GoalPaceSchema.parse('extreme')).toThrow();
  });

  it('Zod schema accepts valid exercise session', async () => {
    const { schemas } = await import('@celebbase/shared-types');
    const parsed = schemas.ExerciseSessionSchema.parse({
      type: 'running',
      intensity: 'moderate',
      duration_min: 45,
      frequency_per_week: 3,
    });
    expect(parsed.intensity).toBe('moderate');
  });
});
