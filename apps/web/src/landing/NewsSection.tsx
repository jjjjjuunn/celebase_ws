import type { CSSProperties, ReactNode } from 'react';
import styles from './landing.module.css';
import { Reveal } from './Reveal';
import { Motif } from './Motif';
import { NEWS_TOPICS, type PersonaAccent, type TrustGrade } from './data';

const ACCENT_VAR: Record<PersonaAccent, string> = {
  biohacker: 'var(--cb-accent-biohacker)',
  glp1: 'var(--cb-accent-glp1)',
  aspirational: 'var(--cb-accent-aspirational)',
  household: 'var(--cb-brand-500)',
};

const GRADE_CLASS: Record<TrustGrade, string> = {
  A: styles.gradeA,
  B: styles.gradeB,
  C: styles.gradeC,
  D: styles.gradeD,
};

// Display the feed ordered by trust grade (A → B → C → D). Array.sort is stable,
// so cards within the same grade keep their authored order.
const GRADE_ORDER: Record<TrustGrade, number> = { A: 0, B: 1, C: 2, D: 3 };
const SORTED_TOPICS = [...NEWS_TOPICS].sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]);

export function NewsSection(): ReactNode {
  return (
    <section id="feed" className={styles.section}>
      <div className={styles.container}>
        <Reveal>
          <div className={styles.sectionHead}>
            <div className={styles.sectionMeta}>
              <span className={styles.sectionIndex}>02</span>
              <p className={styles.eyebrow}>The Feed</p>
            </div>
            <h2 className={styles.sectionTitle}>
              The trend, <em>followed first.</em>
            </h2>
            <p className={styles.sectionIntro}>
              Each story is graded for trust and tied to a primary source before it publishes —
              weak claims never ship.
            </p>
          </div>
        </Reveal>

        <div className={styles.cardGrid}>
          {SORTED_TOPICS.map((topic, i) => (
            <Reveal key={topic.headline} delay={(i % 3) * 0.08}>
              <article
                className={styles.newsCard}
                style={{ '--card-accent': ACCENT_VAR[topic.accent] } as CSSProperties}
              >
                <div className={styles.newsArt}>
                  <span className={styles.newsMotif} aria-hidden="true">
                    <Motif name={topic.motif} />
                  </span>
                  {topic.trending === true ? (
                    <span className={styles.newsTrend}>
                      <span className={styles.newsTrendDot} aria-hidden="true" />
                      Trending now
                    </span>
                  ) : null}
                  <span className={styles.newsCategory}>{topic.category}</span>
                </div>
                <div className={styles.newsBody}>
                  <h3 className={styles.newsHeadline}>{topic.headline}</h3>
                  <p className={styles.newsSummary}>{topic.summary}</p>
                </div>
                <div className={styles.newsFoot}>
                  <span className={styles.sourceLabel}>{topic.sourceType}</span>
                  <span className={`${styles.trustBadge} ${GRADE_CLASS[topic.grade]}`}>
                    Grade&nbsp;{topic.grade}
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <p className={styles.gridNote}>
          * Topics illustrate the kinds of claims the feed grades — not real attributions or
          scraped posts.
        </p>
      </div>
    </section>
  );
}
