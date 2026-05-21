// useMealPlanCredits hook — 성공 시 credits 채움, fetch 실패 시 fail-closed(null).

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { __resetPendingRefresh } from '../../src/lib/fetch-with-refresh';
import { useMealPlanCredits } from '../../src/lib/use-meal-plan-credits';

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useMealPlanCredits', () => {
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

  it('성공 → credits 채움 + loading false', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        tier: 'premium',
        credits_remaining: 14,
        credits_total: 15,
        credits_reset_at: '2026-06-01T00:00:00.000Z',
      }),
    );

    const { result } = renderHook(() => useMealPlanCredits());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.credits?.tier).toBe('premium');
    expect(result.current.credits?.credits_remaining).toBe(14);
  });

  it('fetch 실패 → fail-closed (credits null)', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }),
    );

    const { result } = renderHook(() => useMealPlanCredits());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.credits).toBeNull();
  });

  it('refresh() → 재fetch (생성 완료 후 잔량 갱신 경로)', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        makeResponse(200, {
          tier: 'premium',
          credits_remaining: 14,
          credits_total: 15,
          credits_reset_at: '2026-06-01T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          tier: 'premium',
          credits_remaining: 13,
          credits_total: 15,
          credits_reset_at: '2026-06-01T00:00:00.000Z',
        }),
      );

    const { result } = renderHook(() => useMealPlanCredits());

    await waitFor(() => {
      expect(result.current.credits?.credits_remaining).toBe(14);
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.credits?.credits_remaining).toBe(13);
    });
  });
});
