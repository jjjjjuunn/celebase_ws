import { QueryClient } from '@tanstack/react-query';
import { FetcherError, postJson } from './fetcher.js';

const STALE_TIME_MS = 60_000;
const DEFAULT_RETRY = 1;
const REFRESH_PATH = '/api/auth/refresh';

let refreshPromise: Promise<void> | null = null;

async function refreshTokens(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = postJson<void>(REFRESH_PATH, {}).then(
      () => undefined,
      (err: unknown) => {
        refreshPromise = null;
        throw err;
      },
    );
    refreshPromise.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function shouldAttemptRefresh(err: unknown): boolean {
  return (
    err instanceof FetcherError && err.status === 401 && err.tokenExpired
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: (failureCount, error) => {
          if (shouldAttemptRefresh(error) && failureCount === 0) {
            return true;
          }
          if (error instanceof FetcherError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < DEFAULT_RETRY;
        },
        retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 5_000),
      },
      mutations: {
        retry: (failureCount, error) => {
          if (shouldAttemptRefresh(error) && failureCount === 0) {
            return true;
          }
          return false;
        },
      },
    },
  });
}

export { refreshTokens, shouldAttemptRefresh };
