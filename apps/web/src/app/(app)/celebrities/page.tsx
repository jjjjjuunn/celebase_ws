'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CelebrityCard,
  CategoryTabs,
} from '@celebbase/ui-kit';
import type { CelebrityCardData, CelebrityCategory, CategoryTabOption } from '@celebbase/ui-kit';
import { schemas } from '@celebbase/shared-types';

type CelebrityItem = schemas.CelebrityListResponse['items'][number];
import { fetcher } from '../../../lib/fetcher.js';
import styles from './celebrities.module.css';

const CATEGORY_LABELS: Record<string, string> = {
  '': 'All',
  diet: 'Diet',
  protein: 'High Protein',
  vegetarian: 'Vegetarian',
  general: 'General',
};

function toCardData(c: CelebrityItem): CelebrityCardData {
  return {
    slug: c.slug,
    displayName: c.display_name,
    shortBio: c.short_bio,
    avatarUrl: c.avatar_url,
    coverImageUrl: c.cover_image_url,
    category: c.category as CelebrityCategory,
    tags: c.tags,
    isFeatured: c.is_featured,
  };
}

function buildTabOptions(items: CelebrityItem[]): ReadonlyArray<CategoryTabOption> {
  const CATEGORY_ORDER = ['', 'diet', 'protein', 'vegetarian', 'general'] as const;
  return CATEGORY_ORDER.map((cat) => ({
    value: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    count: cat === '' ? items.length : items.filter((c) => c.category === cat).length,
  }));
}

export default function CelebritiesPage(): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [items, setItems] = useState<CelebrityItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetcher('/api/celebrities', {
      schema: schemas.CelebrityListResponseSchema,
    })
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    activeCategory === '' ? items : items.filter((c) => c.category === activeCategory);

  const tabOptions = buildTabOptions(items);

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Celebrity Plans</h1>
        <p className={styles.loadingText}>Loading celebrities…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Celebrity Plans</h1>
        <p role="alert" className={styles.errorText}>
          Failed to load celebrities. Please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Celebrity Plans</h1>
      <p className={styles.subheading}>
        Hand-curated by our dietitian team. Find the plan that fits your goals.
      </p>
      <CategoryTabs
        id="celebrity-category-tabs"
        options={tabOptions}
        value={activeCategory}
        onChange={setActiveCategory}
        ariaLabel="Filter celebrities by category"
      />
      {filtered.length === 0 ? (
        <p className={styles.emptyText}>No celebrities in this category yet.</p>
      ) : (
        <ul className={styles.grid} aria-label="Celebrity plans">
          {filtered.map((c) => (
            <li key={c.id}>
              <CelebrityCard
                data={toCardData(c)}
                onClick={(slug) => router.push(`/celebrities/${slug}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
