import styles from './DisclaimerBanner.module.css';

interface DisclaimerBannerProps {
  className?: string;
}

export function DisclaimerBanner({ className }: DisclaimerBannerProps): React.ReactElement {
  return (
    <aside
      role="note"
      aria-label="Health disclaimer"
      className={[styles.banner, className].filter(Boolean).join(' ')}
    >
      <span className={styles.icon} aria-hidden="true">ℹ</span>
      <p className={styles.text}>
        This information is for educational purposes only and is not intended as medical advice.
        Consult your healthcare provider before making significant dietary changes.
      </p>
    </aside>
  );
}
