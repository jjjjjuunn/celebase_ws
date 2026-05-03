'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { SSOButton } from '@celebbase/ui-kit';
import { fetcher } from '@/lib/fetcher.js';
import styles from './SSOGroup.module.css';

const AuthorizeUrlResponseSchema = z.object({ authorize_url: z.string().url() });

type LoadingProvider = 'google' | 'apple' | null;

interface SSOGroupProps {
  returnTo?: string;
  errorCode?: string;
}

const OAUTH_ERROR_KEYS: Record<string, 'oauthFailed' | 'stateMismatch'> = {
  STATE_MISMATCH: 'stateMismatch',
  MISSING_PARAMS: 'oauthFailed',
  TOKEN_EXCHANGE_FAILED: 'oauthFailed',
  MISSING_EMAIL: 'oauthFailed',
  AUTH_FAILED: 'oauthFailed',
};

export function SSOGroup({ returnTo = '/dashboard', errorCode }: SSOGroupProps): React.ReactElement {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState<LoadingProvider>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const errorKey = errorCode !== undefined ? OAUTH_ERROR_KEYS[errorCode] : undefined;
  const errorMessage =
    fetchError ??
    (errorKey !== undefined ? t(`errors.${errorKey}`) : null);

  const handleSSO = async (provider: 'google' | 'apple'): Promise<void> => {
    setLoading(provider);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ return_to: returnTo });
      const result = await fetcher(`/api/auth/authorize-url?${params.toString()}`, {
        schema: AuthorizeUrlResponseSchema,
      });
      window.location.href = result.authorize_url;
    } catch {
      setFetchError(tCommon('unexpectedError'));
      setLoading(null);
    }
  };

  return (
    <div className={styles.root}>
      {errorMessage !== null && (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      )}
      <SSOButton
        provider="google"
        loading={loading === 'google'}
        disabled={loading !== null}
        onClick={() => void handleSSO('google')}
      />
      <SSOButton
        provider="apple"
        loading={loading === 'apple'}
        disabled={loading !== null}
        onClick={() => void handleSSO('apple')}
      />
    </div>
  );
}
