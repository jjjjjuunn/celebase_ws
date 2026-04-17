import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { createElement } from 'react';
import styles from './Text.module.css';

export type TextVariant = 'display' | 'heading' | 'body' | 'label' | 'mono';
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextTone = 'default' | 'muted';
export type TextAs = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';

export interface TextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: TextAs;
  variant?: TextVariant;
  size?: TextSize;
  weight?: TextWeight;
  tone?: TextTone;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<TextVariant, string> = {
  display: styles.variantDisplay ?? '',
  heading: styles.variantHeading ?? '',
  body: styles.variantBody ?? '',
  label: styles.variantLabel ?? '',
  mono: styles.variantMono ?? '',
};

const TONE_CLASS: Record<TextTone, string> = {
  default: styles.toneDefault ?? '',
  muted: styles.toneMuted ?? '',
};

export function Text(props: TextProps): ReactElement {
  const {
    as = 'p',
    variant = 'body',
    size = 'md',
    weight = 'regular',
    tone = 'default',
    className,
    style,
    children,
    ...rest
  } = props;

  const classes = [styles.text, VARIANT_CLASS[variant], TONE_CLASS[tone], className]
    .filter(Boolean)
    .join(' ');

  const mergedStyle: CSSProperties = {
    ...(style ?? {}),
    ['--text-size' as string]: `var(--cb-font-size-${size})`,
    ['--text-weight' as string]: `var(--cb-font-weight-${weight})`,
  };

  return createElement(as, { className: classes, style: mergedStyle, ...rest }, children);
}
