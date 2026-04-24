'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Chip, NutritionRing } from '@celebbase/ui-kit';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../../lib/fetcher.js';
import {
  useCountUp,
  useHeroScrollFx,
  useScrollProgress,
  useScrollReveal,
} from '../../../../lib/scroll-fx.js';
import { DisclaimerBanner } from '../../_components/DisclaimerBanner.js';
import styles from './celebrity-detail.module.css';

type Celebrity = schemas.CelebrityDetailResponse['celebrity'];
type BaseDiet = schemas.CelebrityDietsResponse['diets'][number];

const CATEGORY_LABELS: Record<string, string> = {
  diet: 'Diet',
  protein: 'High Protein',
  vegetarian: 'Vegetarian',
  general: 'General',
};

function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]*/g);
  if (matches === null) return [text];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

export default function CelebrityDetailPage(): React.ReactElement {
  const params = useParams<{ slug: string }>();
  const { slug } = params;
  const router = useRouter();

  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [celebrity, setCelebrity] = useState<Celebrity | null>(null);
  const [diets, setDiets] = useState<BaseDiet[]>([]);

  const scrollProgress = useScrollProgress();
  const heroRef = useHeroScrollFx<HTMLElement>();
  const philosophy = useScrollReveal<HTMLElement>();
  const macros = useScrollReveal<HTMLElement>();
  const kitchen = useScrollReveal<HTMLElement>();
  const sources = useScrollReveal<HTMLElement>();
  const closing = useScrollReveal<HTMLElement>();

  useEffect(() => {
    let cancelled = false;
    const safeSlug = encodeURIComponent(slug);

    Promise.all([
      fetcher(`/api/celebrities/${safeSlug}`, {
        schema: schemas.CelebrityDetailResponseSchema,
      }),
      fetcher(`/api/celebrities/${safeSlug}/diets`, {
        schema: schemas.CelebrityDietsResponseSchema,
      }),
    ])
      .then(([detailData, dietsData]) => {
        if (!cancelled) {
          setCelebrity(detailData.celebrity);
          setDiets(dietsData.diets);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const primaryDiet = diets[0] ?? null;

  const kcalTarget = primaryDiet?.avg_daily_kcal ?? 0;
  const kcalValue = useCountUp(kcalTarget, macros.revealed && kcalTarget > 0);

  const philosophyLines = useMemo(() => {
    const raw = primaryDiet?.philosophy ?? '';
    return raw !== '' ? splitIntoSentences(raw) : [];
  }, [primaryDiet?.philosophy]);

  if (status === 'loading') {
    return (
      <div className={styles.stateWrap}>
        <Link href="/celebrities" className={styles.backLink}>
          ← Back to celebrities
        </Link>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  if (status === 'error' || celebrity === null) {
    return (
      <div className={styles.stateWrap}>
        <Link href="/celebrities" className={styles.backLink}>
          ← Back to celebrities
        </Link>
        <p role="alert" className={styles.errorText}>
          Celebrity not found or failed to load. Please go back and try again.
        </p>
      </div>
    );
  }

  const heroSrc = celebrity.cover_image_url ?? celebrity.avatar_url;
  const firstName = celebrity.display_name.split(' ')[0] ?? celebrity.display_name;

  const ringProtein = macros.revealed ? primaryDiet?.macro_ratio.protein_pct ?? 0 : 0;
  const ringCarbs = macros.revealed ? primaryDiet?.macro_ratio.carbs_pct ?? 0 : 0;
  const ringFat = macros.revealed ? primaryDiet?.macro_ratio.fat_pct ?? 0 : 0;

  return (
    <article className={styles.canvas}>
      <div
        className={styles.scrollBar}
        style={{ transform: `scaleX(${scrollProgress.toFixed(3)})` }}
        aria-hidden="true"
      />

      <header
        ref={heroRef}
        className={styles.hero}
        aria-label={`${celebrity.display_name} hero`}
      >
        {heroSrc !== null && heroSrc !== undefined ? (
          <img src={heroSrc} alt="" aria-hidden="true" className={styles.heroImg} />
        ) : (
          <div className={styles.heroPlaceholder} aria-hidden="true" />
        )}
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroTopBar}>
          <Link href="/celebrities" className={styles.heroBackLink}>
            ← Back
          </Link>
          <Badge variant="brand">
            {CATEGORY_LABELS[celebrity.category] ?? celebrity.category}
          </Badge>
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}>A day in the life of</p>
          <h1 className={styles.heroName}>{celebrity.display_name}</h1>
          {celebrity.short_bio ? (
            <p className={styles.heroBio}>{celebrity.short_bio}</p>
          ) : null}
          {celebrity.tags.length > 0 ? (
            <div className={styles.heroTags} aria-label="Signature notes">
              {celebrity.tags.slice(0, 4).map((tag, i) => (
                <span
                  key={tag}
                  className={styles.heroTag}
                  style={{ animationDelay: `${String(400 + i * 80)}ms` }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className={styles.scrollCue} aria-hidden="true">
          <span>scroll</span>
          <span className={styles.scrollCueLine} />
        </div>
      </header>

      {primaryDiet !== null ? (
        <>
          {philosophyLines.length > 0 ? (
            <section
              ref={philosophy.ref}
              className={styles.philosophyAct}
              data-reveal={philosophy.revealed ? 'shown' : 'pending'}
              aria-labelledby="philosophy-heading"
            >
              <p id="philosophy-heading" className={styles.actEyebrow}>
                The philosophy
              </p>
              <blockquote className={styles.pullquote}>
                <span className={styles.quoteMark} aria-hidden="true">
                  &ldquo;
                </span>
                <div className={styles.pullquoteText}>
                  {philosophyLines.map((line, i) => (
                    <span
                      key={`${String(i)}-${line.slice(0, 12)}`}
                      className={styles.pullquoteLine}
                      style={{ transitionDelay: `${String(i * 140)}ms` }}
                    >
                      {line}
                      {i < philosophyLines.length - 1 ? ' ' : null}
                    </span>
                  ))}
                </div>
                <footer className={styles.pullquoteAttr}>— {firstName}&apos;s ritual</footer>
              </blockquote>
            </section>
          ) : null}

          <section
            ref={macros.ref}
            className={styles.macroAct}
            data-reveal={macros.revealed ? 'shown' : 'pending'}
            aria-labelledby="macro-heading"
          >
            <div className={styles.actHead}>
              <p className={styles.actEyebrow}>Daily canvas</p>
              <h2 id="macro-heading" className={styles.actTitle}>
                {primaryDiet.name}
              </h2>
              {primaryDiet.description !== null && primaryDiet.description !== '' ? (
                <p className={styles.actSubtitle}>{primaryDiet.description}</p>
              ) : null}
            </div>

            <div className={styles.macroRings}>
              <NutritionRing
                value={ringProtein}
                label="Protein"
                subLabel={`${String(primaryDiet.macro_ratio.protein_pct)}%`}
                size="lg"
                tone="persona"
              />
              <NutritionRing
                value={ringCarbs}
                label="Carbs"
                subLabel={`${String(primaryDiet.macro_ratio.carbs_pct)}%`}
                size="lg"
                tone="persona"
              />
              <NutritionRing
                value={ringFat}
                label="Fat"
                subLabel={`${String(primaryDiet.macro_ratio.fat_pct)}%`}
                size="lg"
                tone="persona"
              />
            </div>

            {primaryDiet.avg_daily_kcal !== null ? (
              <div className={styles.kcalStone}>
                <span className={styles.kcalValue}>{kcalValue}</span>
                <span className={styles.kcalLabel}>kcal a day, softly held</span>
              </div>
            ) : null}
          </section>

          {primaryDiet.included_foods.length > 0 ||
          primaryDiet.excluded_foods.length > 0 ||
          primaryDiet.key_supplements.length > 0 ? (
            <section
              ref={kitchen.ref}
              className={styles.kitchenAct}
              data-reveal={kitchen.revealed ? 'shown' : 'pending'}
              aria-labelledby="kitchen-heading"
            >
              <div className={styles.actHead}>
                <p className={styles.actEyebrow}>In {firstName}&apos;s kitchen</p>
                <h2 id="kitchen-heading" className={styles.actTitle}>
                  What stays close, what steps aside
                </h2>
              </div>

              {primaryDiet.included_foods.length > 0 ? (
                <div className={styles.foodBlock}>
                  <p className={styles.foodBlockLabel}>Always on the counter</p>
                  <div className={styles.chipRail}>
                    {primaryDiet.included_foods.map((food, i) => (
                      <span
                        key={food}
                        className={styles.chipSlot}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        <Chip label={food} size="md" />
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {primaryDiet.excluded_foods.length > 0 ? (
                <div className={styles.foodBlock}>
                  <p className={styles.foodBlockLabel}>Left off the plate</p>
                  <div className={`${styles.chipRail} ${styles.chipRailMuted}`}>
                    {primaryDiet.excluded_foods.map((food, i) => (
                      <span
                        key={food}
                        className={styles.mutedChip}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        {food}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {primaryDiet.key_supplements.length > 0 ? (
                <div className={styles.foodBlock}>
                  <p className={styles.foodBlockLabel}>The quiet ritual</p>
                  <div className={styles.ritualRow}>
                    {primaryDiet.key_supplements.map((supp, i) => (
                      <span
                        key={supp}
                        className={styles.ritualItem}
                        style={{ '--i': i } as React.CSSProperties}
                      >
                        {supp}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {primaryDiet.source_refs.length > 0 ? (
            <section
              ref={sources.ref}
              className={styles.sourceAct}
              data-reveal={sources.revealed ? 'shown' : 'pending'}
              aria-label="Sources"
            >
              <p className={styles.actEyebrow}>Where this is drawn from</p>
              <ul className={styles.sourceList}>
                {primaryDiet.source_refs.map((ref, idx) => {
                  const label = `${ref.outlet} · ${ref.type}`;
                  return (
                    <li
                      key={`${ref.outlet}-${String(idx)}`}
                      className={styles.sourceItem}
                      style={{ '--i': idx } as React.CSSProperties}
                    >
                      {ref.url !== undefined && ref.url !== '' ? (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.sourceLink}
                        >
                          {label}
                        </a>
                      ) : (
                        <span className={styles.sourceLink}>{label}</span>
                      )}
                      <span className={styles.sourceDate}>{ref.date}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <section
        ref={closing.ref}
        className={styles.closingAct}
        data-reveal={closing.revealed ? 'shown' : 'pending'}
      >
        <DisclaimerBanner />
        {primaryDiet !== null ? (
          <div className={styles.cta}>
            <Button
              variant="primary"
              size="md"
              onClick={() =>
                router.push(
                  `/plans/new?celebrity=${encodeURIComponent(slug)}&diet=${primaryDiet.id}`,
                )
              }
            >
              Generate my plan inspired by {firstName}
            </Button>
          </div>
        ) : null}
      </section>
    </article>
  );
}
