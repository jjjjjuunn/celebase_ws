import type { ReactNode } from 'react';
import styles from './landing.module.css';
import { Reveal } from './Reveal';
import { FAQ_ITEMS } from './data';

// FAQ — native <details>/<summary> so it works with zero JS, is keyboard
// accessible by default, and never hides content from assistive tech.
export function Faq(): ReactNode {
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.container}>
        <Reveal>
          <div className={styles.sectionHead}>
            <div className={styles.sectionMeta}>
              <span className={styles.sectionIndex}>05</span>
              <p className={styles.eyebrow}>Questions</p>
            </div>
            <h2 className={styles.sectionTitle}>
              Asked &amp; <em>answered.</em>
            </h2>
            <p className={styles.sectionIntro}>
              The honest version — what Celebase is, how the personalization works, and where every
              number comes from.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary className={styles.faqQ}>
                  <span>{item.q}</span>
                  <span className={styles.faqMark} aria-hidden="true" />
                </summary>
                <p className={styles.faqA}>{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
