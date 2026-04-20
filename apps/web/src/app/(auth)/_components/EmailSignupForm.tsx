'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { postJson, FetcherError } from '@/lib/fetcher.js';
import styles from './EmailSignupForm.module.css';

export function EmailSignupForm(): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await postJson('/api/auth/signup', { email, display_name: displayName });
      router.replace('/onboarding');
    } catch (err) {
      if (err instanceof FetcherError && err.status === 409) {
        setError(t('errors.invalidCredentials'));
      } else if (err instanceof FetcherError && err.status >= 500) {
        setError(tCommon('unexpectedError'));
      } else {
        setError(t('errors.networkError'));
      }
      setPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
      {error !== null && (
        <p role="alert" className={styles.error}>{error}</p>
      )}
      <label className={styles.label} htmlFor="signup-display-name">
        {t('signup.displayNameLabel')}
      </label>
      <input
        id="signup-display-name"
        className={styles.input}
        type="text"
        autoComplete="name"
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={pending}
      />
      <label className={styles.label} htmlFor="signup-email">
        {t('signup.emailLabel')}
      </label>
      <input
        id="signup-email"
        className={styles.input}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? t('signup.pending') : t('signup.submit')}
      </button>
    </form>
  );
}
