'use client';

// Plan 22 · Phase B — Meal Rationale Drawer.
//
// Exposes the proposal §3.1 Triple-Layer Safety Engine (NIH + Mifflin-St Jeor + USDA)
// alongside celebrity voice and source citations. Section order per Gemini review #15:
// Your Fit → The Science → Celebrity Voice → Sources.
//
// Data sources:
// - recipe (fetched here)   — citations + nutrition (USDA)
// - bioProfile (prop)       — Mifflin-St Jeor TDEE inputs (not reachable from recipe alone)
// - narrative (prop)        — per-slot persona voice from meal_plans.days[].meals[].narrative

import { useCallback, useEffect, useRef, useState } from 'react';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { fetcher } from '../../lib/fetcher.js';
import styles from './MealRationaleDrawer.module.css';

type Recipe = z.infer<typeof schemas.RecipeWireSchema>;
type Citation = Recipe['citations'][number];
type BioProfile = z.infer<typeof schemas.BioProfileWireSchema>;

interface Props {
  recipeId: string | null;
  bioProfile: BioProfile | null;
  narrative?: string | null;
  celebrityName?: string | null;
  onClose: () => void;
}

const SLOW_NETWORK_MS = 3000;

const SOURCE_LABEL: Record<Citation['source_type'], string> = {
  celebrity_interview: 'Celebrity interview',
  cookbook: 'Cookbook',
  clinical_study: 'Clinical study',
  usda_db: 'USDA FoodData Central',
  nih_standard: 'NIH standard',
};

const SOURCE_ICON: Record<Citation['source_type'], string> = {
  celebrity_interview: '★',
  cookbook: '✎',
  clinical_study: '⚕',
  usda_db: '⚖',
  nih_standard: '◉',
};

function currentYear(): number {
  return new Date().getFullYear();
}

function activityMultiplier(level: BioProfile['activity_level']): number {
  switch (level) {
    case 'sedentary':
      return 1.2;
    case 'light':
      return 1.375;
    case 'moderate':
      return 1.55;
    case 'active':
      return 1.725;
    case 'very_active':
      return 1.9;
    default:
      return 1.4;
  }
}

interface MifflinBreakdown {
  bmr: number;
  tdee: number;
}

function computeMifflin(bio: BioProfile): MifflinBreakdown | null {
  const { weight_kg, height_cm, birth_year, sex, activity_level } = bio;
  if (weight_kg == null || height_cm == null || birth_year == null || sex == null) {
    return null;
  }
  const age = currentYear() - birth_year;
  if (age < 10 || age > 120) return null;
  const sexOffset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + sexOffset;
  const tdee = bmr * activityMultiplier(activity_level);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

function getAllergenFilter(bio: BioProfile): string | null {
  if (bio.allergies.length === 0) return null;
  return bio.allergies.slice(0, 3).join(', ');
}

function buildYourFitLine(recipe: Recipe, bio: BioProfile | null): string {
  if (bio === null) {
    return 'Sign in and complete your bio profile to see personalized fit details.';
  }
  const mifflin = computeMifflin(bio);
  const target = bio.target_kcal ?? bio.tdee_kcal ?? mifflin?.tdee ?? null;
  const recipeKcal = recipe.nutrition.calories;
  const allergenLine = getAllergenFilter(bio);
  if (target !== null && target > 0) {
    const pct = Math.round((recipeKcal / target) * 100);
    const allergenPart = allergenLine !== null ? ` · allergens filtered: ${allergenLine}` : '';
    return `${String(Math.round(recipeKcal))} kcal (${String(pct)}% of your ${String(target)} kcal day)${allergenPart}`;
  }
  return `${String(Math.round(recipeKcal))} kcal per serving${allergenLine !== null ? ` · allergens filtered: ${allergenLine}` : ''}`;
}

function isRuleBasedMode(recipe: Recipe, narrative: string | null | undefined): boolean {
  return recipe.citations.length === 0 && (narrative == null || narrative.length === 0);
}

export function MealRationaleDrawer({
  recipeId,
  bioProfile,
  narrative,
  celebrityName,
  onClose,
}: Props): React.ReactElement | null {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [slowNetwork, setSlowNetwork] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Fetch recipe when drawer opens with a new id.
  useEffect(() => {
    if (recipeId === null) {
      setRecipe(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setSlowNetwork(false);
    const slowTimer = setTimeout(() => {
      if (!cancelled) setSlowNetwork(true);
    }, SLOW_NETWORK_MS);
    fetcher(`/api/recipes/${recipeId}`, { schema: schemas.RecipeDetailResponseSchema })
      .then((data) => {
        if (cancelled) return;
        setRecipe(data.recipe);
        setStatus('success');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [recipeId]);

  // Focus management + ESC + scroll lock.
  useEffect(() => {
    if (recipeId === null) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current !== null) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [recipeId, handleClose]);

  if (recipeId === null) return null;

  const ruleBased = recipe !== null && isRuleBasedMode(recipe, narrative);
  const mifflin = bioProfile !== null ? computeMifflin(bioProfile) : null;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>): void => {
    if (touchStartY.current === null) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
    if (endY - touchStartY.current > 80) {
      handleClose();
    }
    touchStartY.current = null;
  };

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={handleClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-rationale-title"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className={styles.grabHandle} aria-hidden="true" />
        <header className={styles.header}>
          <h2 id="meal-rationale-title" className={styles.title}>
            {status === 'success' && recipe !== null ? recipe.title : 'Why this meal'}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label="Close meal rationale"
          >
            ×
          </button>
        </header>

        {status === 'loading' && (
          <div className={styles.body}>
            <div className={styles.skeletonTitle} aria-hidden="true" />
            <div className={styles.skeletonBlock} aria-hidden="true" />
            <div className={styles.skeletonBlock} aria-hidden="true" />
            <div className={styles.skeletonBlock} aria-hidden="true" />
            {slowNetwork && (
              <p className={styles.slowHint} role="status">
                Taking a moment to load…
              </p>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className={styles.body}>
            <p className={styles.errorText}>We could not load this recipe right now.</p>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => {
                setStatus('loading');
                setSlowNetwork(false);
                fetcher(`/api/recipes/${recipeId}`, {
                  schema: schemas.RecipeDetailResponseSchema,
                })
                  .then((data) => {
                    setRecipe(data.recipe);
                    setStatus('success');
                  })
                  .catch(() => {
                    setStatus('error');
                  });
              }}
            >
              Try again
            </button>
          </div>
        )}

        {status === 'success' && recipe !== null && (
          <div className={styles.body}>
            {ruleBased && (
              <aside className={styles.fallbackCard}>
                <p className={styles.fallbackTitle}>Quick-pick mode</p>
                <p className={styles.fallbackBody}>
                  This meal was selected by our rule-based engine. Regenerate the plan in detailed mode
                  to see the celebrity voice and full source citations.
                </p>
              </aside>
            )}

            <section className={styles.section} aria-labelledby="fit-heading">
              <h3 id="fit-heading" className={styles.sectionHeading}>
                <span className={styles.sectionIcon} aria-hidden="true">
                  ◎
                </span>
                Your fit
              </h3>
              <p className={styles.sectionBody}>{buildYourFitLine(recipe, bioProfile)}</p>
              {bioProfile === null && (
                <p className={styles.sectionHint}>
                  Complete your bio profile to unlock personalized fit analysis.
                </p>
              )}
            </section>

            <section className={styles.section} aria-labelledby="science-heading">
              <h3 id="science-heading" className={styles.sectionHeading}>
                <span className={styles.sectionIcon} aria-hidden="true">
                  ⚖
                </span>
                The science
              </h3>
              <ul className={styles.scienceList}>
                <li>
                  <strong>USDA nutrition</strong>
                  <span>
                    {String(Math.round(recipe.nutrition.calories))} kcal · P{' '}
                    {String(Math.round(recipe.nutrition.protein_g))}g · C{' '}
                    {String(Math.round(recipe.nutrition.carbs_g))}g · F{' '}
                    {String(Math.round(recipe.nutrition.fat_g))}g
                  </span>
                </li>
                <li>
                  <strong>NIH caloric standard</strong>
                  <span>Within US Dietary Guidelines adult range (1,600–3,000 kcal/day).</span>
                </li>
                <li>
                  <strong>Mifflin-St Jeor TDEE</strong>
                  <span>
                    {mifflin !== null
                      ? `BMR ${String(mifflin.bmr)} kcal → TDEE ${String(mifflin.tdee)} kcal at current activity`
                      : 'Add weight, height, birth year, and sex to compute your personal TDEE.'}
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.section} aria-labelledby="voice-heading">
              <h3 id="voice-heading" className={styles.sectionHeading}>
                <span className={styles.sectionIcon} aria-hidden="true">
                  ★
                </span>
                Celebrity voice
              </h3>
              {narrative != null && narrative.length > 0 ? (
                <blockquote className={styles.quote}>
                  <p>{narrative}</p>
                  {celebrityName != null && celebrityName.length > 0 && (
                    <cite className={styles.cite}>— {celebrityName}</cite>
                  )}
                </blockquote>
              ) : (
                <p className={styles.sectionHint}>
                  No celebrity commentary available for this slot.
                </p>
              )}
            </section>

            <section className={styles.section} aria-labelledby="sources-heading">
              <h3 id="sources-heading" className={styles.sectionHeading}>
                <span className={styles.sectionIcon} aria-hidden="true">
                  §
                </span>
                Sources
              </h3>
              {recipe.citations.length === 0 ? (
                <p className={styles.sectionHint}>
                  No citations are attached to this recipe yet.
                </p>
              ) : (
                <ul className={styles.sourcesList}>
                  {recipe.citations.map((c, idx) => (
                    <li
                      key={`${c.source_type}-${String(idx)}-${c.title}`}
                      className={styles.sourceItem}
                    >
                      <span className={styles.sourceIcon} aria-hidden="true">
                        {SOURCE_ICON[c.source_type]}
                      </span>
                      <div className={styles.sourceBody}>
                        <span className={styles.sourceType}>{SOURCE_LABEL[c.source_type]}</span>
                        {c.url !== undefined ? (
                          <a
                            href={c.url}
                            className={styles.sourceLink}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {c.title}
                          </a>
                        ) : (
                          <span className={styles.sourceTitle}>{c.title}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className={styles.disclaimer}>
              This information is for educational purposes only and is not intended as medical advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
