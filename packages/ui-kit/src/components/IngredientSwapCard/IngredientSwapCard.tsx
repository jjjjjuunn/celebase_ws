import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { Card } from '../Card/Card.js';
import { TrafficLightIndicator } from '../TrafficLightIndicator/TrafficLightIndicator.js';
import type { TrafficLightStatus } from '../TrafficLightIndicator/TrafficLightIndicator.js';
import styles from './IngredientSwapCard.module.css';

export interface IngredientInfo {
  name: string;
  note?: string;
}

export interface IngredientSwapCardProps extends HTMLAttributes<HTMLElement> {
  original: IngredientInfo;
  replacement: IngredientInfo;
  status: TrafficLightStatus;
  reason: string;
  children?: ReactNode;
}

export function IngredientSwapCard(props: IngredientSwapCardProps): ReactElement {
  const { original, replacement, status, reason, children, className, ...rest } = props;

  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <Card {...rest} variant="standard" className={classes}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Ingredient swap</span>
        <TrafficLightIndicator status={status} variant="swap-context" size="sm" />
      </div>

      <div className={styles.swap}>
        <div className={styles.column}>
          <span className={styles.columnLabel}>Original</span>
          <span className={styles.originalName}>{original.name}</span>
          {original.note ? <span className={styles.note}>{original.note}</span> : null}
        </div>

        <span className={styles.arrow} aria-hidden="true">
          →
        </span>

        <div className={styles.column}>
          <span className={styles.columnLabel}>Replace with</span>
          <span className={styles.replacementName}>{replacement.name}</span>
          {replacement.note ? <span className={styles.note}>{replacement.note}</span> : null}
        </div>
      </div>

      <p className={styles.reason}>{reason}</p>

      {children ? <div className={styles.footnote}>{children}</div> : null}
    </Card>
  );
}
