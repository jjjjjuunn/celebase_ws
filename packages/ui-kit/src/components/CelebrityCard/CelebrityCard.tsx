'use client';

import type { KeyboardEvent, ReactElement } from 'react';
import { useState } from 'react';
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
  selected?: boolean;
  dimmed?: boolean;
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

// CSS class names for placeholder gradient slots — cycles by first char code
const GRADIENT_SLOTS = [
  'gradientBrand',
  'gradientTeal',
  'gradientPurple',
  'gradientCoral',
  'gradientDark',
] as const;

function gradientSlot(name: string): string {
  const idx = name.charCodeAt(0) % GRADIENT_SLOTS.length;
  return GRADIENT_SLOTS[idx] ?? 'gradientBrand';
}

export function CelebrityCard({
  data,
  onClick,
  selected = false,
  dimmed = false,
}: CelebrityCardProps): ReactElement {
  const { slug, displayName, shortBio, avatarUrl, coverImageUrl, category, tags, isFeatured } =
    data;

  const photoSrc = coverImageUrl ?? avatarUrl;
  const subtitle = shortBio ?? tags[0] ?? '';
  const [imgError, setImgError] = useState(false);
  const showPlaceholder = !photoSrc || imgError;

  const handleClick = (): void => {
    onClick?.(slug);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(slug);
    }
  };

  const className = [
    styles.card,
    selected ? styles.cardSelected : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={displayName}
      aria-pressed={onClick ? (selected ? 'true' : 'false') : undefined}
      data-dimmed={dimmed ? 'true' : undefined}
    >
      <div
        className={[
          styles.photo,
          showPlaceholder ? (styles[gradientSlot(displayName)] ?? '') : '',
        ].join(' ')}
      >
        {showPlaceholder ? (
          <span className={styles.placeholderInitial} aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
        ) : (
          <img
            src={photoSrc}
            alt={displayName}
            className={styles.img}
            onError={() => { setImgError(true); }}
          />
        )}
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
