import styles from './landing.module.css';

// Sticky editorial masthead. Pure CSS (position: sticky) — no client JS needed.
export function TopNav() {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <a href="#top" className={styles.navBrand}>
        Celebase
      </a>
      <div className={styles.navRight}>
        <div className={styles.navLinks}>
          <a href="#decode" className={styles.navLink}>
            Decode
          </a>
          <a href="#feed" className={styles.navLink}>
            The&nbsp;Feed
          </a>
          <a href="#engine" className={styles.navLink}>
            The&nbsp;Engine
          </a>
          <a href="#example" className={styles.navLink}>
            The&nbsp;Payoff
          </a>
        </div>
        <span className={styles.navPill}>
          <span className={styles.navDot} aria-hidden="true" />
          Coming 2026
        </span>
      </div>
    </nav>
  );
}
