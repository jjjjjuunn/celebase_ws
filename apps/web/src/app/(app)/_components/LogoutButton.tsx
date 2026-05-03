'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { postJson } from '@/lib/fetcher.js';
import { WIZARD_DRAFT_KEY } from '@/app/(onboarding)/onboarding/wizard-schema.js';

export function LogoutButton(): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('nav');
  const [pending, setPending] = useState(false);

  const handleLogout = async (): Promise<void> => {
    setPending(true);
    try {
      await postJson('/api/auth/logout', {});
    } finally {
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(WIZARD_DRAFT_KEY);
        } catch {
          // ignore storage failures (quota, privacy mode)
        }
      }
      router.replace('/login');
    }
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void handleLogout()}
      style={{
        background: 'none',
        border: 'none',
        padding: '4px 0',
        cursor: pending ? 'not-allowed' : 'pointer',
        color: 'var(--cb-color-text-muted)',
        fontFamily: 'var(--cb-font-family-body)',
        fontSize: 'var(--cb-font-size-sm)',
        textAlign: 'left',
        opacity: pending ? 0.55 : 1,
      }}
    >
      {t('logout')}
    </button>
  );
}
