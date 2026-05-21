// bio-profile service — getBioProfile 성공 + 404(미온보딩) 검증.
// 게이트(3-state)가 404 를 "미온보딩" 신호로 catch 하므로 status 보존이 핵심.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { ApiError } from '../../src/lib/api-client';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { getBioProfile } from '../../src/services/bio-profile';

const PROFILE_ID = '01927000-0000-7000-8000-000000000001';
const USER_ID = '01927000-0000-7000-8000-000000000002';

// 최소 유효 BioProfileWire — nullable 필드는 null, 필수 array/object 만 채운다.
const BIO_PROFILE = {
  id: PROFILE_ID,
  user_id: USER_ID,
  birth_year: null,
  sex: null,
  height_cm: null,
  weight_kg: null,
  waist_cm: null,
  body_fat_pct: null,
  activity_level: null,
  sleep_hours_avg: null,
  stress_level: null,
  allergies: [],
  intolerances: [],
  medical_conditions: [],
  medications: [],
  biomarkers: {},
  primary_goal: null,
  secondary_goals: [],
  exercise_sessions: [],
  goal_pace: 'moderate',
  diet_type: null,
  cuisine_preferences: [],
  disliked_ingredients: [],
  bmr_kcal: null,
  tdee_kcal: null,
  target_kcal: null,
  macro_targets: { protein_g: 0, carbs_g: 0, fat_g: 0 },
  version: 1,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('bio-profile service', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('getBioProfile → { bio_profile } 파싱', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(200, { bio_profile: BIO_PROFILE }));

    const res = await getBioProfile();

    expect(res.bio_profile.id).toBe(PROFILE_ID);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/users/me/bio-profile');
  });

  it('프로필 부재 → 404 ApiError (게이트가 미온보딩으로 catch)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(404, { error: { code: 'NOT_FOUND', message: 'Bio profile not found' } }),
    );

    const err = await getBioProfile().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});
