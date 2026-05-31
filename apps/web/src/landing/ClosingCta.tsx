import styles from './landing.module.css';
import { StoreBadges } from './StoreBadges';

export function ClosingCta() {
  return (
    <section id="get-the-app" className={styles.closing}>
      <div className={styles.container}>
        <div className={`${styles.closingInner} ${styles.scrollReveal}`}>
          <p className={styles.closingKicker}>Coming to iOS &amp; Android · 2026</p>
          <h2 className={styles.closingTitle}>
            Your first plan is <em>one tap</em> away.
          </h2>
          <p className={styles.closingBody}>
            Be first when Celebase opens — sourced wellness, bio-adapted to you, on the App Store and
            Google Play.
          </p>
          <StoreBadges />
        </div>
      </div>
    </section>
  );
}
