import type { ReactNode } from 'react';
import styles from './landing.module.css';
import { StoreBadges } from './StoreBadges';
import { SocialWall } from './SocialWall';
import { IDENTITY_AXES } from './data';

const TRUST_ITEMS = ['USDA FoodData Central', 'NIH ODS', 'Every claim cited'];

export function Hero(): ReactNode {
  return (
    <header id="top" className={styles.hero}>
      <SocialWall />

      <div className={styles.heroContent}>
        <p className={`${styles.kicker} ${styles.reveal} ${styles.d1}`}>
          <span className={styles.kickerRule} aria-hidden="true" />
          Vol. 01 — The Wellness Dossier
          <span className={styles.kickerRule} aria-hidden="true" />
        </p>

        <h1 className={styles.heroTitle}>
          <span className={`${styles.heroLede} ${styles.reveal} ${styles.d2}`}>Celebrity</span>
          <span className={`${styles.heroSubline} ${styles.reveal} ${styles.d3}`}>
            wellness, <em>recomputed</em> for your body.
          </span>
        </h1>

        <div className={`${styles.ctaRow} ${styles.reveal} ${styles.d6}`}>
          <a className={styles.ctaPrimary} href="#feed">
            See how it works
          </a>
          <a className={styles.ctaSecondary} href="#engine">
            Inside the engine
            <span className={styles.ctaArrow} aria-hidden="true">
              →
            </span>
          </a>
        </div>

        <ol className={`${styles.heroAxes} ${styles.reveal} ${styles.d6}`}>
          {IDENTITY_AXES.map((axis) => (
            <li key={axis.index} className={styles.heroAxis}>
              <span className={styles.heroAxisIndex} aria-hidden="true">
                {axis.index}
              </span>
              <span className={styles.heroAxisLabel}>{axis.label}</span>
              <span className={styles.heroAxisBlurb}>{axis.blurb}</span>
            </li>
          ))}
        </ol>

        <div className={`${styles.reveal} ${styles.d6}`}>
          <StoreBadges />
        </div>

        <div className={`${styles.trustStrip} ${styles.reveal} ${styles.d6}`}>
          {TRUST_ITEMS.map((item, i) => (
            <span key={item} className={styles.trustItem}>
              {i > 0 ? (
                <span className={styles.trustDot} aria-hidden="true">
                  ·&nbsp;&nbsp;
                </span>
              ) : null}
              {item}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
