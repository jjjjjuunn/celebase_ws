import type { HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { createElement } from 'react';
import styles from './Card.module.css';

export type CardVariant = 'standard' | 'hero' | 'lineItem';
export type CardAs = 'article' | 'section' | 'button' | 'a' | 'div';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: CardAs;
  interactive?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<CardVariant, string> = {
  standard: styles.variantStandard ?? '',
  hero: styles.variantHero ?? '',
  lineItem: styles.variantLineItem ?? '',
};

function isNativelyInteractive(as: CardAs): boolean {
  return as === 'button' || as === 'a';
}

export function Card(props: CardProps): ReactElement {
  const {
    variant = 'standard',
    as = 'div',
    interactive = false,
    className,
    onClick,
    onKeyDown,
    children,
    ...rest
  } = props;

  const nativeInteractive = isNativelyInteractive(as);
  const injectRole = interactive && !nativeInteractive;

  const classes = [
    styles.card,
    VARIANT_CLASS[variant],
    interactive ? styles.interactive : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    onKeyDown?.(event);
    if (!injectRole || !onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event as unknown as Parameters<NonNullable<typeof onClick>>[0]);
    }
  };

  const elementProps: HTMLAttributes<HTMLElement> = {
    ...rest,
    className: classes,
    onClick,
    onKeyDown: handleKeyDown,
    ...(injectRole ? { role: 'button' as const, tabIndex: 0 } : {}),
  };

  return createElement(as, elementProps, children);
}
