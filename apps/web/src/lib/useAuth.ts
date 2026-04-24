'use client';

import { useQuery } from '@tanstack/react-query';
import { schemas } from '@celebbase/shared-types';
import { FetcherError, fetcher, postJson } from './fetcher.js';

export interface AuthState {
  user: schemas.UserWire | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => fetcher('/api/users/me', { schema: schemas.MeResponseSchema }),
    // Don't retry 4xx errors other than 401-with-tokenExpired (query-client
    // handles the refresh+retry cycle for those automatically).
    retry: (failureCount, err) => {
      if (
        err instanceof FetcherError &&
        err.status >= 400 &&
        err.status < 500 &&
        !err.tokenExpired
      ) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 60_000,
  });

  const logout = async (): Promise<void> => {
    await postJson<void>('/api/auth/logout', {}).catch(() => undefined);
    window.location.href = '/login';
  };

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: (data?.user ?? null) !== null,
    logout,
  };
}
