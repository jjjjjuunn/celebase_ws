'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import styles from '../layout.module.css';

const NAV_ITEMS = [
  { href: '/home', key: 'home' },
  { href: '/celebrities', key: 'celebrities' },
  { href: '/plans', key: 'plans' },
  { href: '/track', key: 'track' },
  { href: '/dashboard', key: 'insights' },
  { href: '/account', key: 'account' },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  const tNav = useTranslations('nav');

  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map(({ href, key }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
          >
            {tNav(key)}
          </Link>
        );
      })}
    </nav>
  );
}
