import type { ReactNode } from 'react';
import styles from './landing.module.css';
import { Reveal } from './Reveal';
import { CALORIE_STEPS, ENGINE_PASSES, SAFETY_POINTS } from './data';

export function EngineSection(): ReactNode {
  return (
    <section id="engine" className={styles.section}>
      <div className={styles.container}>
        <Reveal>
          <div className={styles.sectionHead}>
            <div className={styles.sectionMeta}>
              <span className={styles.sectionIndex}>03</span>
              <p className={styles.eyebrow}>The Engine</p>
            </div>
            <h2 className={styles.sectionTitle}>
              Calculated, <em>not guessed.</em>
            </h2>
            <p className={styles.sectionIntro}>
              Your calories come from established formulas. Then a two-pass engine — with an AI that
              selects each meal from a vetted, allergen-safe pool — turns that target into a varied
              week, every number sourced.
            </p>
          </div>
        </Reveal>

        {/* The math */}
        <div className={styles.stepJourney}>
          {CALORIE_STEPS.map((step, i) => (
            <Reveal key={step.title} delay={(i % 4) * 0.07}>
              <div className={styles.stepCard}>
                <span className={styles.stepNum}>{String(i + 1)}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <span className={styles.stepFormula}>{step.formula}</span>
                <p className={styles.stepDetail}>{step.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* The two-pass engine */}
        <div className={styles.twoPass}>
          {ENGINE_PASSES.map((pass, i) => (
            <Reveal key={pass.tag} delay={i * 0.1}>
              <div className={styles.pass}>
                <div className={styles.passHead}>
                  <div>
                    <span className={styles.passTag}>{pass.tag}</span>
                    <h3 className={styles.passTitle}>{pass.title}</h3>
                  </div>
                  <span className={styles.passTiming}>{pass.timing}</span>
                </div>
                <ul className={styles.passSteps}>
                  {pass.steps.map((step) => (
                    <li key={step} className={styles.passStep}>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Safety */}
        <Reveal>
          <div className={styles.safety}>
            <h3 className={styles.safetyTitle}>
              <span className={styles.safetyBadge}>Safe</span>
              Built to stay safe
            </h3>
            <ul className={styles.safetyList}>
              {SAFETY_POINTS.map((point) => (
                <li key={point} className={styles.safetyItem}>
                  <span className={styles.safetyCheck} aria-hidden="true">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <p className={styles.safetySource}>
              Nutrition data: USDA FoodData Central · RDA targets: NIH Office of Dietary Supplements
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
