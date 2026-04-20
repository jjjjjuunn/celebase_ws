import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SSOGroup } from '../_components/SSOGroup.js';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Log in — CelebBase Wellness' };

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.ReactElement> {
  const params = await searchParams;
  const t = await getTranslations('auth');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('login.title')}</h1>
      <p className={styles.subtitle}>{t('login.subtitle')}</p>
      <SSOGroup returnTo="/dashboard" errorCode={params.error} />
      <p className={styles.switchLink}>
        <Link href="/signup">{t('login.switchToSignup')}</Link>
      </p>
    </div>
  );
}
