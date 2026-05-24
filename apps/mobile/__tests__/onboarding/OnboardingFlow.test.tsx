jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { OnboardingFlow } from '../../src/onboarding/OnboardingFlow';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { ThemeProvider } from '../../src/ui';

// Onboarding v2 — linear one-question-per-screen flow (IMPL-MOBILE-ONBOARDING-V2-001).
// Pickers (birth year / height / weight) resolve to their default on mount, so a
// picker screen advances via Continue without simulating a scroll gesture.

function renderScreen(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Schema-valid bio-profile response (saveBioProfile parses with Zod — a partial
// stub would throw a ZodError and surface as a generic "Network error").
const BIO_PROFILE_OK = {
  bio_profile: {
    id: '01927000-0000-7000-8000-aaaaaaaaaaaa',
    user_id: '01927000-0000-7000-8000-bbbbbbbbbbbb',
    birth_year: 1995,
    sex: 'male',
    height_cm: 172.7,
    weight_kg: 68,
    waist_cm: null,
    body_fat_pct: null,
    activity_level: 'moderate',
    sleep_hours_avg: null,
    stress_level: null,
    allergies: ['Peanuts'],
    intolerances: [],
    medical_conditions: [],
    medications: [],
    biomarkers: {},
    primary_goal: 'weight_loss',
    secondary_goals: [],
    exercise_sessions: [],
    goal_pace: 'moderate',
    diet_type: null,
    cuisine_preferences: [],
    disliked_ingredients: [],
    bmr_kcal: 1500,
    tdee_kcal: 2100,
    target_kcal: 1800,
    macro_targets: { protein_g: 130, carbs_g: 200, fat_g: 55 },
    version: 1,
    created_at: '2026-05-24T00:00:00.000Z',
    updated_at: '2026-05-24T00:00:00.000Z',
  },
};

// Walk name → … → prefs(Finish) → reveal. `glp1Label` selects the GLP-1 answer.
async function advanceToReveal(glp1Label: 'No' | 'Yes, I take one' = 'No'): Promise<void> {
  // 0 — name
  fireEvent.changeText(screen.getByLabelText('Name'), 'Dohyun');
  fireEvent.press(screen.getByLabelText('Continue'));
  // 1 — birth year (drum default 1995)
  await screen.findByText('When were you born?');
  fireEvent.press(screen.getByLabelText('Continue'));
  // 2 — sex
  await screen.findByText("What's your sex?");
  fireEvent.press(screen.getByLabelText('Male'));
  fireEvent.press(screen.getByLabelText('Continue'));
  // 3 — height (drums default 5'8")
  await screen.findByText('How tall are you?');
  fireEvent.press(screen.getByLabelText('Continue'));
  // 4 — weight (drum default 150 lb)
  await screen.findByText("What's your weight?");
  fireEvent.press(screen.getByLabelText('Continue'));
  // 5 — activity
  await screen.findByText('How active are you?');
  fireEvent.press(screen.getByLabelText('Moderate'));
  fireEvent.press(screen.getByLabelText('Continue'));
  // 6 — allergies (optional; pick one)
  await screen.findByText('Any allergies?');
  fireEvent.press(screen.getByLabelText('Peanuts'));
  fireEvent.press(screen.getByLabelText('Continue'));
  // 7 — GLP-1
  await screen.findByText('GLP-1 medication?');
  fireEvent.press(screen.getByLabelText(glp1Label));
  fireEvent.press(screen.getByLabelText('Continue'));
  // 8 — primary goal
  await screen.findByText("What's your main goal?");
  fireEvent.press(screen.getByLabelText('Weight loss'));
  fireEvent.press(screen.getByLabelText('Continue'));
  // 9 — preferences (optional) → Finish
  await screen.findByText('Any preferences?');
  fireEvent.press(screen.getByLabelText('Finish'));
}

describe('<OnboardingFlow /> one-question flow', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPendingRefresh();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders the first step (name)', () => {
    renderScreen(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('What should we call you?')).toBeTruthy();
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('✕ Close → onClose', () => {
    const onClose = jest.fn();
    renderScreen(<OnboardingFlow onDone={jest.fn()} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('happy path → single bio-profile POST (data-min) + onDone', async () => {
    fetchSpy.mockImplementation((url: unknown) =>
      typeof url === 'string' && url.includes('/api/users/me/bio-profile')
        ? Promise.resolve(makeResponse(201, BIO_PROFILE_OK))
        : Promise.reject(new Error(`Unmocked fetch: ${String(url)}`)),
    );
    const onDone = jest.fn();

    renderScreen(<OnboardingFlow onDone={onDone} onClose={jest.fn()} />);
    await advanceToReveal();

    await screen.findByText(/You're all set/);
    fireEvent.press(screen.getByLabelText('Enter Celebase'));
    expect(onDone).toHaveBeenCalledTimes(1);

    const calls = fetchSpy.mock.calls as Array<[string, RequestInit]>;
    const postCall = calls.find(
      ([url, init]) => url.endsWith('/api/users/me/bio-profile') && init.method === 'POST',
    );
    expect(postCall).toBeDefined();
    if (postCall === undefined) return;
    const body = JSON.parse(postCall[1].body as string) as Record<string, unknown>;
    // Data minimization: medical_conditions never collected; GLP-1 'No' → no meds.
    expect(body.medical_conditions).toEqual([]);
    expect(body.medications).toEqual([]);
    // Allergy chips now emit canonical recipe-tag tokens, not display labels.
    expect(body.allergies).toEqual(['peanuts']);
    expect(body.sex).toBe('male');
    expect(body.birth_year).toBe(1995);
    expect(body.activity_level).toBe('moderate');
    expect(body.primary_goal).toBe('weight_loss');
    expect(body.height_cm).toBe(172.7); // 5'8" via lib/units
    expect(body.weight_kg).toBe(68); // 150 lb
    // persona removed — slug must never appear in the bio-profile body.
    expect(body.preferred_celebrity_slug).toBeUndefined();
  });

  it('GLP-1 = Yes → medications ["glp1"] (the only signal the engine consumes)', async () => {
    fetchSpy.mockImplementation((url: unknown) =>
      typeof url === 'string' && url.includes('/api/users/me/bio-profile')
        ? Promise.resolve(makeResponse(201, BIO_PROFILE_OK))
        : Promise.reject(new Error(`Unmocked fetch: ${String(url)}`)),
    );

    renderScreen(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await advanceToReveal('Yes, I take one');
    await screen.findByText(/You're all set/);

    const calls = fetchSpy.mock.calls as Array<[string, RequestInit]>;
    const postCall = calls.find(
      ([url, init]) => url.endsWith('/api/users/me/bio-profile') && init.method === 'POST',
    );
    expect(postCall).toBeDefined();
    if (postCall === undefined) return;
    const body = JSON.parse(postCall[1].body as string) as Record<string, unknown>;
    expect(body.medications).toEqual(['glp1']);
  });

  it('POST 5xx → error screen + retry button', async () => {
    fetchSpy.mockImplementation((url: unknown) =>
      typeof url === 'string' && url.includes('/api/users/me/bio-profile')
        ? Promise.resolve(
            makeResponse(500, { error: { code: 'AUDIT_LOG_FAILURE', message: 'fail-closed' } }),
          )
        : Promise.reject(new Error(`Unmocked fetch: ${String(url)}`)),
    );

    renderScreen(<OnboardingFlow onDone={jest.fn()} onClose={jest.fn()} />);
    await advanceToReveal();

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeTruthy();
    });
    expect(screen.getByText(/Couldn't save your profile/)).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });
});
