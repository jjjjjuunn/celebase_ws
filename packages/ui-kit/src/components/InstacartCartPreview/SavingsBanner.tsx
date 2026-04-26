'use client';

import type { HTMLAttributes, ReactElement } from 'react';
import styles from './SavingsBanner.module.css';

export interface SavingsBannerProps extends HTMLAttributes<HTMLElement> {
  aiPlanCents: number;
  diyCents: number;
  privateChefCents: number;
  currency?: string;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function pct(value: number, reference: number): number {
  if (reference === 0) return 0;
  return Math.round(((reference - value) / reference) * 100);
}

export function SavingsBanner(props: SavingsBannerProps): ReactElement {
  const { aiPlanCents, diyCents, privateChefCents, currency = 'USD', className, ...rest } = props;

  const vsDiy = pct(aiPlanCents, diyCents);
  const vsChef = pct(aiPlanCents, privateChefCents);

  const classes = [styles.banner, className].filter(Boolean).join(' ');

  return (
    <section {...rest} className={classes} aria-label="Savings comparison">
      <header className={styles.header}>
        <h3 className={styles.title}>You save with this plan</h3>
        <p className={styles.sub}>
          AI-curated cart priced at{' '}
          <strong className={styles.highlight}>
            {formatMoney(aiPlanCents, currency)}
          </strong>{' '}
          — compared against two alternatives.
        </p>
      </header>

      <div className={styles.grid}>
        <article className={styles.cell}>
          <span className={styles.cellLabel}>DIY shopping</span>
          <span className={styles.cellPrice}>{formatMoney(diyCents, currency)}</span>
          <span className={styles.cellDelta}>
            {vsDiy > 0 ? `−${String(vsDiy)}% cheaper` : 'Comparable'}
          </span>
        </article>

        <article className={[styles.cell, styles.cellFeatured].filter(Boolean).join(' ')}>
          <span className={styles.cellLabel}>Your AI plan</span>
          <span className={styles.cellPrice}>
            {formatMoney(aiPlanCents, currency)}
          </span>
          <span className={styles.cellDeltaStrong}>Selected</span>
        </article>

        <article className={styles.cell}>
          <span className={styles.cellLabel}>Private chef</span>
          <span className={styles.cellPrice}>
            {formatMoney(privateChefCents, currency)}
          </span>
          <span className={styles.cellDelta}>
            {vsChef > 0 ? `−${String(vsChef)}% cheaper` : 'Comparable'}
          </span>
        </article>
      </div>
    </section>
  );
}
