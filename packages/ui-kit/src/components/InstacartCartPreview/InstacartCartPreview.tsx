'use client';

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { Badge } from '../Badge/Badge.js';
import { Card } from '../Card/Card.js';
import styles from './InstacartCartPreview.module.css';

export type InstacartFulfillmentStatus =
  | 'ready'
  | 'shopping'
  | 'on_route'
  | 'private_chef'
  | 'failed';

export interface InstacartLineItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  priceCents: number;
  substituted?: boolean;
}

export interface InstacartCartPreviewProps extends HTMLAttributes<HTMLElement> {
  items: InstacartLineItem[];
  subtotalCents: number;
  currency?: string;
  status?: InstacartFulfillmentStatus;
  onCheckout?: () => void;
  footer?: ReactNode;
}

const STATUS_LABEL: Record<InstacartFulfillmentStatus, string> = {
  ready: 'Ready to checkout',
  shopping: 'Shopper picking your items',
  on_route: 'On the way',
  private_chef: 'Private Chef in prep',
  failed: 'Needs your attention',
};

const STATUS_VARIANT: Record<
  InstacartFulfillmentStatus,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger'
> = {
  ready: 'brand',
  shopping: 'neutral',
  on_route: 'success',
  private_chef: 'brand',
  failed: 'danger',
};

function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function InstacartCartPreview(props: InstacartCartPreviewProps): ReactElement {
  const {
    items,
    subtotalCents,
    currency = 'USD',
    status = 'ready',
    onCheckout,
    footer,
    className,
    ...rest
  } = props;

  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <Card {...rest} variant="standard" className={classes}>
      <header className={styles.header}>
        <h3 className={styles.title}>Your cart</h3>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </header>

      <ul className={styles.items} aria-label="Cart line items">
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemBody}>
              <span className={styles.itemName}>
                {item.name}
                {item.substituted ? (
                  <span className={styles.subTag} aria-label="substituted">
                    Swapped
                  </span>
                ) : null}
              </span>
              <span className={styles.itemQty}>
                {String(item.quantity)}
                {item.unit ? ` ${item.unit}` : ''}
              </span>
            </div>
            <span className={styles.itemPrice}>
              {formatMoney(item.priceCents, currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.subtotal}>
        <span className={styles.subtotalLabel}>Subtotal</span>
        <span className={styles.subtotalValue}>
          {formatMoney(subtotalCents, currency)}
        </span>
      </div>

      {onCheckout ? (
        <button type="button" className={styles.cta} onClick={onCheckout}>
          Checkout on Instacart →
        </button>
      ) : null}

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </Card>
  );
}
