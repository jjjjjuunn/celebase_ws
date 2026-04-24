'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button } from '@celebbase/ui-kit';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../../lib/fetcher.js';
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

export default function CelebrityDetailPage(): React.ReactElement {
  const params = useParams<{ slug: string }>();
  const { slug } = params;
  const router = useRouter();

  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [celebrity, setCelebrity] = useState<Celebrity | null>(null);
  const [diets, setDiets] = useState<BaseDiet[]>([]);

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

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <Link href="/celebrities" className={styles.backLink}>
          ← Back to celebrities
        </Link>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  if (status === 'error' || celebrity === null) {
    return (
      <div className={styles.page}>
        <Link href="/celebrities" className={styles.backLink}>
          ← Back to celebrities
        </Link>
        <p role="alert" className={styles.errorText}>
          Celebrity not found or failed to load. Please go back and try again.
        </p>
      </div>
    );
  }

  const primaryDiet = diets[0] ?? null;
  const heroSrc = celebrity.cover_image_url ?? celebrity.avatar_url;

  return (
    <div className={styles.page}>
      <Link href="/celebrities" className={styles.backLink}>
        ← Back to celebrities
      </Link>

      <div className={styles.hero}>
        {heroSrc !== null && heroSrc !== undefined ? (
          <img src={heroSrc} alt={celebrity.display_name} className={styles.heroImg} />
        ) : (
          <div className={styles.heroPlaceholder} aria-hidden="true" />
        )}
        <div className={styles.heroOverlay}>
          <div className={styles.heroStats}>
            <Badge variant="brand">{CATEGORY_LABELS[celebrity.category] ?? celebrity.category}</Badge>
            {diets.length > 0 && (
              <span className={styles.heroStatPill}>
                {diets.length} {diets.length === 1 ? 'diet plan' : 'diet plans'}
              </span>
            )}
          </div>
          <h1 className={styles.heroName}>{celebrity.display_name}</h1>
          {celebrity.short_bio ? (
            <p className={styles.heroBio}>{celebrity.short_bio}</p>
          ) : null}
        </div>
      </div>

      {celebrity.tags.length > 0 ? (
        <div className={styles.tags} aria-label="Tags">
          {celebrity.tags.map((tag) => (
            <Badge key={tag} variant="neutral">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {primaryDiet !== null ? (
        <section className={styles.dietSection} aria-labelledby="diet-heading">
          <h2 id="diet-heading" className={styles.sectionHeading}>
            {primaryDiet.name}
          </h2>
          {primaryDiet.description ? (
            <p className={styles.dietDescription}>{primaryDiet.description}</p>
          ) : null}
          {primaryDiet.philosophy ? (
            <p className={styles.dietPhilosophy}>{primaryDiet.philosophy}</p>
          ) : null}

          <div className={styles.macroRow}>
            <div className={styles.macroItem}>
              <span className={styles.macroValue}>{primaryDiet.macro_ratio.protein_pct}%</span>
              <span className={styles.macroLabel}>Protein</span>
            </div>
            <div className={styles.macroItem}>
              <span className={styles.macroValue}>{primaryDiet.macro_ratio.carbs_pct}%</span>
              <span className={styles.macroLabel}>Carbs</span>
            </div>
            <div className={styles.macroItem}>
              <span className={styles.macroValue}>{primaryDiet.macro_ratio.fat_pct}%</span>
              <span className={styles.macroLabel}>Fat</span>
            </div>
            {primaryDiet.avg_daily_kcal !== null ? (
              <div className={styles.macroItem}>
                <span className={styles.macroValue}>{primaryDiet.avg_daily_kcal}</span>
                <span className={styles.macroLabel}>kcal / day</span>
              </div>
            ) : null}
          </div>

          {primaryDiet.included_foods.length > 0 ? (
            <div className={styles.foodSection}>
              <h3 className={styles.foodHeading}>Key foods</h3>
              <ul className={styles.foodList}>
                {primaryDiet.included_foods.map((food) => (
                  <li key={food}>{food}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {primaryDiet.excluded_foods.length > 0 ? (
            <div className={styles.foodSection}>
              <h3 className={styles.foodHeading}>Avoided foods</h3>
              <ul className={styles.foodList}>
                {primaryDiet.excluded_foods.map((food) => (
                  <li key={food}>{food}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <DisclaimerBanner />

      {primaryDiet !== null ? (
        <div className={styles.cta}>
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              router.push(`/plans/new?celebrity=${encodeURIComponent(slug)}&diet=${primaryDiet.id}`)
            }
          >
            Generate My Plan
          </Button>
        </div>
      ) : null}
    </div>
  );
}
