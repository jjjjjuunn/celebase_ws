import styles from './landing.module.css';
import { STORE_BADGES, type StoreBadge } from './data';

// Inline brand glyphs drawn with currentColor (no raw hex, inherits --cb-* text color).
function StoreGlyph({ store }: { store: StoreBadge['store'] }) {
  if (store === 'apple') {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M16.37 1.43c.04 1.06-.36 2.1-1.05 2.87-.72.8-1.9 1.42-2.99 1.33-.13-1.02.38-2.09 1.03-2.79.72-.78 1.96-1.36 3.01-1.41zM19.6 17.4c-.53 1.22-.78 1.77-1.46 2.85-.95 1.5-2.29 3.37-3.95 3.38-1.47.02-1.85-.96-3.85-.95-2 .01-2.42.97-3.89.95-1.66-.02-2.93-1.71-3.88-3.21-2.66-4.2-2.94-9.14-1.3-11.76 1.17-1.86 3.01-2.95 4.74-2.95 1.76 0 2.87 1 4.32 1 1.41 0 2.27-1 4.31-1 1.54 0 3.18.84 4.34 2.29-3.82 2.09-3.2 7.54.27 9.45z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.043.906-.214l13.324-7.545-3.23-3.174z" />
    </svg>
  );
}

// Pre-launch store badges. The app is not live yet, so these are presentational
// "coming soon" markers (not links) — announced to assistive tech via aria-label.
export function StoreBadges() {
  return (
    <div className={styles.storeRow}>
      {STORE_BADGES.map((badge) => (
        <div
          key={badge.name}
          className={styles.storeBadge}
          aria-label={`${badge.small} ${badge.name}`}
        >
          <span className={styles.storeGlyph}>
            <StoreGlyph store={badge.store} />
          </span>
          <span className={styles.storeText}>
            <span className={styles.storeSmall}>{badge.small}</span>
            <span className={styles.storeName}>{badge.name}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
