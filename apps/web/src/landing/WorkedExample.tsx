'use client';

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import styles from './landing.module.css';
import { MacroRing, type RingMacro } from './MacroRing';
import { CountUp, withCommas } from './CountUp';
import { Reveal } from './Reveal';
import { WORKED_PERSONAS, type PersonaAccent } from './data';

const ACCENT_VAR: Record<PersonaAccent, string> = {
  biohacker: 'var(--cb-accent-biohacker)',
  glp1: 'var(--cb-accent-glp1)',
  aspirational: 'var(--cb-accent-aspirational)',
  household: 'var(--cb-brand-500)',
};

const CHART_VAR: Record<RingMacro['token'], string> = {
  protein: 'var(--cb-chart-protein)',
  weight: 'var(--cb-chart-weight)',
  calories: 'var(--cb-chart-calories)',
};

export function WorkedExample(): ReactNode {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const persona = WORKED_PERSONAS[active];
  if (persona === undefined) {
    return null;
  }
  const accent = ACCENT_VAR[persona.accent];
  const ringMacros: RingMacro[] = persona.macros.map((m) => ({
    label: m.label,
    pct: m.pct,
    token: m.token,
  }));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const last = WORKED_PERSONAS.length - 1;
    let next = active;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = active === last ? 0 : active + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = active === 0 ? last : active - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    } else {
      return;
    }
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="example" className={styles.section}>
      <div className={styles.container}>
        <Reveal>
          <div className={styles.sectionHead}>
            <div className={styles.sectionMeta}>
              <span className={styles.sectionIndex}>04</span>
              <p className={styles.eyebrow}>The Payoff</p>
            </div>
            <h2 className={styles.sectionTitle}>
              Their base day, <em>your target.</em>
            </h2>
            <p className={styles.sectionIntro}>
              Pick a celebrity: their reported base day, re-computed into a personalized target for a
              sample profile — with a protein-first macro split and a cited sample day.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div
            className={styles.exampleTabs}
            role="tablist"
            aria-label="Choose an illustrative archetype"
          >
            {WORKED_PERSONAS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${p.id}`}
                aria-selected={i === active}
                aria-controls={`${baseId}-panel`}
                tabIndex={i === active ? 0 : -1}
                ref={(el): void => {
                  tabRefs.current[i] = el;
                }}
                className={`${styles.exampleTab} ${i === active ? styles.exampleTabActive : ''}`}
                style={{ '--tab-accent': ACCENT_VAR[p.accent] } as CSSProperties}
                onClick={(): void => setActive(i)}
                onKeyDown={onKeyDown}
              >
                <span className={styles.exampleTabInitial} aria-hidden="true">
                  {p.initial}
                </span>
                {p.archetype}
              </button>
            ))}
          </div>
        </Reveal>

        <div
          className={styles.examplePanel}
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${persona.id}`}
          style={{ '--panel-accent': accent } as CSSProperties}
        >
          <div className={styles.exampleRingCol}>
            <MacroRing
              macros={ringMacros}
              centerValue={persona.targetKcal}
              centerUnit="kcal / day"
              label={`Macro split for ${persona.archetype}: ${persona.macros
                .map((m) => `${String(m.pct)}% ${m.label.toLowerCase()}`)
                .join(', ')}`}
            />
            <div className={styles.macroLegend}>
              {persona.macros.map((m) => (
                <div key={m.label} className={styles.legendRow}>
                  <span
                    className={styles.legendDot}
                    style={{ '--legend-color': CHART_VAR[m.token] } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span className={styles.legendLabel}>{m.label}</span>
                  <span className={styles.legendGrams}>{m.grams}g</span>
                  <span className={styles.legendPct}>{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.exampleDetailCol}>
            <p className={styles.inspiredBy}>
              <span className={styles.inspiredTag}>Inspired by</span>
              <strong className={styles.inspiredName}>{persona.celebrity}</strong>
              <span className={styles.inspiredNote}>{persona.celebrityProfile}</span>
            </p>

            <div className={styles.transformRow}>
              <div className={styles.transformBlock}>
                <span className={styles.transformLabel}>Celebrity base day</span>
                <span className={styles.transformBase}>
                  <CountUp to={persona.baseKcal} format={withCommas} /> kcal
                </span>
              </div>
              <span className={styles.transformArrow} aria-hidden="true">
                →
              </span>
              <div className={styles.transformBlock}>
                <span className={styles.transformLabel}>Your personalized target</span>
                <span className={styles.transformTarget}>
                  <CountUp to={persona.targetKcal} format={withCommas} /> kcal
                </span>
                <span className={styles.transformFactor}>{persona.goalFactor}</span>
              </div>
            </div>

            <div className={styles.profileCompare}>
              <span className={styles.computedTag}>Profiles — theirs vs yours</span>
              <dl className={styles.profileGrid}>
                <div className={styles.profileRow}>
                  <dt className={styles.profileWho}>{persona.celebrity}</dt>
                  <dd className={styles.profileStats}>{persona.celebrityBody}</dd>
                </div>
                <div className={`${styles.profileRow} ${styles.profileRowYou}`}>
                  <dt className={styles.profileWho}>You</dt>
                  <dd className={styles.profileStats}>{persona.profile}</dd>
                </div>
              </dl>
              <p className={styles.profileSource}>
                Celebrity base day &amp; diet: publicly reported · {persona.source}
              </p>
            </div>

            <p className={styles.rationale}>
              <span className={styles.rationaleTag} aria-hidden="true">
                Why
              </span>
              {persona.rationale}
            </p>

            <table className={styles.dayTable}>
              <caption className={styles.dayCaption}>A sample day</caption>
              <tbody>
                {persona.day.map((meal) => (
                  <tr key={meal.slot} className={styles.dayRow}>
                    <th scope="row" className={styles.daySlot}>
                      {meal.slot}
                    </th>
                    <td className={styles.dayDish}>{meal.dish}</td>
                    <td className={styles.dayKcal}>{withCommas(meal.kcal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className={styles.gridNote}>
          Celebrity diets &amp; base calories are publicly reported (graded &amp; sourced in-app);
          celebrity profiles are approximate. The sample profile and your target are illustrative.
          Not affiliated with or endorsed by the celebrities; not medical advice.
        </p>
      </div>
    </section>
  );
}
