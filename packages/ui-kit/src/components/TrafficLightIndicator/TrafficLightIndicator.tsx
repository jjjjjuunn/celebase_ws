import type { HTMLAttributes, ReactElement } from 'react';
import styles from './TrafficLightIndicator.module.css';

export type TrafficLightStatus = 'green' | 'orange' | 'red';
export type TrafficLightVariant = 'standalone' | 'swap-context';
export type TrafficLightSize = 'sm' | 'md';

export interface TrafficLightIndicatorProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: TrafficLightStatus;
  label?: string;
  variant?: TrafficLightVariant;
  size?: TrafficLightSize;
}

const STATUS_LABEL: Record<TrafficLightStatus, string> = {
  green: 'Safe',
  orange: 'Caution',
  red: 'Avoid',
};

const STATUS_CLASS: Record<TrafficLightStatus, string> = {
  green: styles.statusGreen ?? '',
  orange: styles.statusOrange ?? '',
  red: styles.statusRed ?? '',
};

export function TrafficLightIndicator(props: TrafficLightIndicatorProps): ReactElement {
  const {
    status,
    label,
    variant = 'standalone',
    size = 'md',
    className,
    ...rest
  } = props;

  const visibleLabel = label ?? STATUS_LABEL[status];
  const variantClass =
    variant === 'swap-context' ? (styles.variantSwapContext ?? '') : (styles.variantStandalone ?? '');
  const sizeClass = size === 'sm' ? (styles.sizeSm ?? '') : (styles.sizeMd ?? '');

  const classes = [styles.indicator, variantClass, sizeClass, STATUS_CLASS[status], className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      {...rest}
      className={classes}
      role="img"
      aria-label={`${visibleLabel} — ingredient safety status`}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{visibleLabel}</span>
    </span>
  );
}
