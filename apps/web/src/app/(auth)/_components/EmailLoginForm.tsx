'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { postJson, FetcherError } from '@/lib/fetcher.js';
import styles from './EmailLoginForm.module.css';

export function EmailLoginForm(): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await postJson('/api/auth/login', { email });
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof FetcherError && err.status === 401) {
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
      <label className={styles.label} htmlFor="email-login">
        {t('login.emailLabel')}
      </label>
      <input
        id="email-login"
        className={styles.input}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? t('login.pending') : t('login.submit')}
      </button>
    </form>
  );
}
