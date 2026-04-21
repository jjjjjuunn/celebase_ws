import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LogoutButton } from './_components/LogoutButton.js';
import { NavLinks } from './_components/NavLinks.js';
import { UserProvider } from './_components/UserProvider.js';
import styles from './layout.module.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  const tApp = useTranslations('app');

  return (
    <div className={styles.shell}>
      <header className={styles.topnav}>
        <Link href="/dashboard" className={styles.brand}>
          {tApp('name')}
          <span className={styles.brandDot} aria-hidden="true" />
        </Link>
        <NavLinks />
        <div className={styles.navRight}>
          <LogoutButton />
        </div>
      </header>
      <main className={styles.main}>
        <UserProvider>{children}</UserProvider>
      </main>
    </div>
  );
}
