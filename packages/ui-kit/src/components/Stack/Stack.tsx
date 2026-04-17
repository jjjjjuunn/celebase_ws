import type { CSSProperties, ElementType, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { createElement } from 'react';
import styles from './Stack.module.css';

export type SpaceTokenKey = '1' | '2' | '3' | '4' | '6' | '8' | '12' | '16';

export interface StackProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: ElementType;
  direction?: 'row' | 'column';
  gap?: SpaceTokenKey;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  children?: ReactNode;
}

const ALIGN_CLASS: Record<NonNullable<StackProps['align']>, string> = {
  start: styles.alignStart ?? '',
  center: styles.alignCenter ?? '',
  end: styles.alignEnd ?? '',
  stretch: styles.alignStretch ?? '',
};

const JUSTIFY_CLASS: Record<NonNullable<StackProps['justify']>, string> = {
  start: styles.justifyStart ?? '',
  center: styles.justifyCenter ?? '',
  end: styles.justifyEnd ?? '',
  between: styles.justifyBetween ?? '',
  around: styles.justifyAround ?? '',
};

export function Stack(props: StackProps): ReactElement {
  const {
    as = 'div',
    direction = 'column',
    gap = '4',
    align = 'stretch',
    justify = 'start',
    wrap = false,
    className,
    style,
    children,
    ...rest
  } = props;

  const classes = [
    styles.stack,
    direction === 'row' ? styles.row : styles.column,
    ALIGN_CLASS[align],
    JUSTIFY_CLASS[justify],
    wrap ? styles.wrap : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const mergedStyle: CSSProperties = {
    ...(style ?? {}),
    ['--stack-gap' as string]: `var(--cb-space-${gap})`,
  };

  return createElement(as, { className: classes, style: mergedStyle, ...rest }, children);
}
