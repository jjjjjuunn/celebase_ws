import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SSOGroup } from '../_components/SSOGroup.js';
import { EmailSignupForm } from '../_components/EmailSignupForm.js';
import styles from './signup.module.css';

export const metadata: Metadata = { title: 'Create account — CelebBase Wellness' };

interface SignupPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps): Promise<React.ReactElement> {
  const params = await searchParams;
  const t = await getTranslations('auth');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('signup.title')}</h1>
      <p className={styles.subtitle}>{t('signup.subtitle')}</p>
      <EmailSignupForm />
      <p className={styles.divider}>{t('sso.orContinueWith')}</p>
      <SSOGroup returnTo="/onboarding" errorCode={params.error} />
      <p className={styles.switchLink}>
        <Link href="/login">{t('signup.switchToLogin')}</Link>
      </p>
    </div>
  );
}
