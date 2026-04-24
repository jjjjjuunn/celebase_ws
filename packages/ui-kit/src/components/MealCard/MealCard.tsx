'use client';

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { Badge } from '../Badge/Badge.js';
import { Card } from '../Card/Card.js';
import { TrafficLightIndicator } from '../TrafficLightIndicator/TrafficLightIndicator.js';
import type { TrafficLightStatus } from '../TrafficLightIndicator/TrafficLightIndicator.js';
import styles from './MealCard.module.css';

export interface MealCardProps extends HTMLAttributes<HTMLElement> {
  title: string;
  celebrityTag?: string;
  mealType?: string;
  kcal?: number;
  safetyStatus?: TrafficLightStatus;
  imageUrl?: string | null;
  onShopIngredients?: () => void;
  sourceBadge?: ReactNode;
}

export function MealCard(props: MealCardProps): ReactElement {
  const {
    title,
    celebrityTag,
    mealType,
    kcal,
    safetyStatus,
    imageUrl,
    onShopIngredients,
    sourceBadge,
    className,
    ...rest
  } = props;

  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <Card {...rest} variant="standard" className={classes}>
      {imageUrl ? (
        <div
          className={styles.image}
          style={{ backgroundImage: `url("${imageUrl}")` }}
          role="presentation"
        />
      ) : null}

      <div className={styles.body}>
        <div className={styles.meta}>
          {celebrityTag ? <Badge variant="brand">{celebrityTag}</Badge> : null}
          {safetyStatus ? (
            <TrafficLightIndicator status={safetyStatus} size="sm" />
          ) : null}
        </div>

        <h3 className={styles.title}>{title}</h3>

        <div className={styles.details}>
          {mealType ? <span className={styles.detail}>{mealType}</span> : null}
          {typeof kcal === 'number' ? (
            <span className={styles.detail}>{String(kcal)} kcal</span>
          ) : null}
        </div>

        {sourceBadge ? <div className={styles.source}>{sourceBadge}</div> : null}

        {onShopIngredients ? (
          <button type="button" className={styles.cta} onClick={onShopIngredients}>
            Shop ingredients →
          </button>
        ) : null}
      </div>
    </Card>
  );
}
