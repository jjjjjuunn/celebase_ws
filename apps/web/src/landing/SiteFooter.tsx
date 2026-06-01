import Link from 'next/link';
import styles from './landing.module.css';

export function SiteFooter({ year }: { year: number }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <span className={styles.footerBrand}>Celebase</span>
          <nav className={styles.footerLinks} aria-label="Footer">
            <Link href="/terms" className={styles.footerLink}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={styles.footerLink}>
              Privacy Policy
            </Link>
          </nav>
        </div>
        <p className={styles.disclaimer}>
          This information is for educational purposes only and is not intended as medical advice.
        </p>
        <p className={styles.copyright}>© {year} CelebBase. All rights reserved.</p>
      </div>
    </footer>
  );
}
