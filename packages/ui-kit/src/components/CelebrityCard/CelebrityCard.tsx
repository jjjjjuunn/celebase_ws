'use client';

import type { KeyboardEvent, ReactElement } from 'react';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariant } from '../Badge/Badge.js';
import styles from './CelebrityCard.module.css';

export type CelebrityCategory = 'diet' | 'protein' | 'vegetarian' | 'general';

export interface CelebrityCardData {
  slug: string;
  displayName: string;
  shortBio: string | null;
  avatarUrl: string;
  coverImageUrl: string | null;
  category: CelebrityCategory;
  tags: string[];
  isFeatured: boolean;
}

export interface CelebrityCardProps {
  data: CelebrityCardData;
  onClick?: (slug: string) => void;
}

const CATEGORY_LABEL: Record<CelebrityCategory, string> = {
  diet: 'Diet',
  protein: 'High Protein',
  vegetarian: 'Vegetarian',
  general: 'General',
};

const CATEGORY_VARIANT: Record<CelebrityCategory, BadgeVariant> = {
  diet: 'brand',
  protein: 'success',
  vegetarian: 'success',
  general: 'neutral',
};

export function CelebrityCard({ data, onClick }: CelebrityCardProps): ReactElement {
  const { slug, displayName, shortBio, avatarUrl, coverImageUrl, category, tags, isFeatured } =
    data;

  const photoSrc = coverImageUrl ?? avatarUrl;
  const subtitle = shortBio ?? tags[0] ?? '';

  const handleClick = (): void => {
    onClick?.(slug);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(slug);
    }
  };

  return (
    <article
      className={styles.card}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={displayName}
    >
      <div className={styles.photo}>
        <img src={photoSrc} alt={displayName} className={styles.img} />
        <span className={styles.categoryBadge}>
          <Badge variant={CATEGORY_VARIANT[category]}>{CATEGORY_LABEL[category]}</Badge>
        </span>
        {isFeatured ? (
          <span className={styles.featuredBadge}>
            <Badge variant="brand">Featured</Badge>
          </span>
        ) : null}
      </div>
      <div className={styles.body}>
        <h3 className={styles.name}>{displayName}</h3>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
    </article>
  );
}
