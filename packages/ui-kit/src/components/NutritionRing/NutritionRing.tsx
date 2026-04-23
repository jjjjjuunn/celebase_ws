import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import styles from './NutritionRing.module.css';

export type NutritionRingSize = 'sm' | 'md' | 'lg';
export type NutritionRingTone = 'brand' | 'persona';

export interface NutritionRingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 0-100 percentage of target achieved */
  value: number;
  label: string;
  subLabel?: ReactNode;
  size?: NutritionRingSize;
  tone?: NutritionRingTone;
}

const SIZE_PX: Record<NutritionRingSize, number> = {
  sm: 72,
  md: 120,
  lg: 176,
};

const STROKE_PX: Record<NutritionRingSize, number> = {
  sm: 6,
  md: 10,
  lg: 14,
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function NutritionRing(props: NutritionRingProps): ReactElement {
  const {
    value,
    label,
    subLabel,
    size = 'md',
    tone = 'brand',
    className,
    ...rest
  } = props;

  const pct = clampPercent(value);
  const dim = SIZE_PX[size];
  const stroke = STROKE_PX[size];
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const isComplete = pct >= 100;

  const toneClass = tone === 'persona' ? (styles.tonePersona ?? '') : (styles.toneBrand ?? '');
  const sizeClass = styles[`size${size.toUpperCase()}`] ?? '';
  const classes = [styles.ring, toneClass, sizeClass, isComplete ? styles.complete : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...rest}
      className={classes}
      role="img"
      aria-label={`${label}: ${String(Math.round(pct))}%`}
    >
      <svg
        className={styles.svg}
        width={dim}
        height={dim}
        viewBox={`0 0 ${String(dim)} ${String(dim)}`}
        aria-hidden="true"
      >
        <circle
          className={styles.track}
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className={styles.progress}
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={String(circumference)}
          strokeDashoffset={String(dashOffset)}
          transform={`rotate(-90 ${String(dim / 2)} ${String(dim / 2)})`}
        />
      </svg>
      <div className={styles.center}>
        <span className={styles.value}>{String(Math.round(pct))}%</span>
        <span className={styles.label}>{label}</span>
        {subLabel ? <span className={styles.subLabel}>{subLabel}</span> : null}
      </div>
    </div>
  );
}
