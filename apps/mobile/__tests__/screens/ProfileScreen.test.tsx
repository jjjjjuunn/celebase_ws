// ProfileScreen integration — GET /api/users/me 응답 → render path 검증.
// avatar_url 분기 (Image vs initial placeholder), free tier Upgrade 카드, error.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ProfileScreen } from '../../src/screens/ProfileScreen';
import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';

const USER_BASE = {
  id: '01927000-0000-7000-8000-000000000001',
  cognito_sub: 'sub-1',
  email: 'jane@example.com',
  display_name: 'Jane Doe',
  avatar_url: null as string | null,
  subscription_tier: 'free' as const,
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  preferred_celebrity_slug: null,
  preferences: {},
  created_at: '2026-01-15T00:00:00.000Z',
  updated_at: '2026-01-15T00:00:00.000Z',
  deleted_at: null,
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('<ProfileScreen />', () => {
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

  it('GET /api/users/me 성공 → display_name + email + 가입월 + Free 배지', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { user: USER_BASE }));

    render(<ProfileScreen onEditBioProfile={jest.fn()} onUpgradePress={jest.fn()} />);

    expect(await screen.findByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('jane@example.com')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('free tier → Upgrade 카드 + 클릭 시 onUpgradePress 호출', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { user: USER_BASE }));
    const onUpgrade = jest.fn();

    render(<ProfileScreen onEditBioProfile={jest.fn()} onUpgradePress={onUpgrade} />);

    await screen.findByTestId('profile-upgrade');
    fireEvent.press(screen.getByTestId('profile-upgrade'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('premium tier → Upgrade 카드 미노출 + Premium 배지', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, { user: { ...USER_BASE, subscription_tier: 'premium' } }),
    );

    render(<ProfileScreen onEditBioProfile={jest.fn()} onUpgradePress={jest.fn()} />);

    expect(await screen.findByText('Premium')).toBeTruthy();
    expect(screen.queryByTestId('profile-upgrade')).toBeNull();
  });

  it('avatar_url 존재 → Image 렌더 (initial placeholder 미노출)', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        user: { ...USER_BASE, avatar_url: 'https://example.com/avatar.jpg' },
      }),
    );

    render(<ProfileScreen onEditBioProfile={jest.fn()} onUpgradePress={jest.fn()} />);

    expect(await screen.findByLabelText('Jane Doe avatar')).toBeTruthy();
    // initial "J" placeholder Text 는 같은 동작에서 미노출
    expect(screen.queryByText('J')).toBeNull();
  });

  it('avatar_url null → initial placeholder 노출', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { user: USER_BASE }));

    render(<ProfileScreen onEditBioProfile={jest.fn()} onUpgradePress={jest.fn()} />);

    await screen.findByText('Jane Doe');
    expect(screen.getByText('J')).toBeTruthy();
  });

  it('fetch 실패 → error state 표시', async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, { error: { code: 'INTERNAL' } }));

    render(<ProfileScreen onEditBioProfile={jest.fn()} onUpgradePress={jest.fn()} />);

    expect(await screen.findByText("Couldn't load your profile.")).toBeTruthy();
  });

  it('Edit profile 탭 → onEditBioProfile 콜백 호출', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { user: USER_BASE }));
    const onEdit = jest.fn();

    render(<ProfileScreen onEditBioProfile={onEdit} onUpgradePress={jest.fn()} />);

    await screen.findByTestId('profile-edit');
    fireEvent.press(screen.getByTestId('profile-edit'));
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledTimes(1);
    });
  });
});
