'use client';

import { useEffect, useState } from 'react';
import { fetcher, postJson, patchJson, FetcherError } from '@/lib/fetcher.js';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import styles from './account.module.css';

type UserWire = z.infer<typeof schemas.UserWireSchema>;
type SubscriptionTier = UserWire['subscription_tier'];
type SubscriptionWire = z.infer<typeof schemas.SubscriptionWireSchema>;

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  premium: 'Premium',
  elite: 'Elite',
};

const TIER_PRICES: Record<'premium' | 'elite', string> = {
  premium: '$9.99 / mo',
  elite: '$29.99 / mo',
};

const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  free: ['5 meal plans/month', 'Celebrity diet library', 'Basic daily tracking'],
  premium: ['Unlimited meal plans', 'Personalised recipes', 'Advanced analytics', 'Priority support'],
  elite: ['Everything in Premium', 'Coaching copilot (AI)', 'Grocery integration', 'Early access features'],
};

function TierBadge({ tier }: { tier: SubscriptionTier }): React.ReactElement {
  return (
    <span className={`${styles.tierBadge} ${styles[`tier_${tier}`]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}

function getInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface UpgradeCardProps {
  tier: 'premium' | 'elite';
  onUpgrade: () => void;
  upgrading: boolean;
}

function UpgradeCard({ tier, onUpgrade, upgrading }: UpgradeCardProps): React.ReactElement {
  return (
    <div className={`${styles.upgradeCard} ${tier === 'elite' ? styles.upgradeCardElite : ''}`}>
      {tier === 'premium' && (
        <span className={styles.upgradeCardBadge}>Most picked</span>
      )}
      <h3 className={styles.upgradeCardName}>{TIER_LABELS[tier]}</h3>
      <p className={styles.upgradeCardPrice}>{TIER_PRICES[tier]}</p>
      <ul className={styles.upgradeCardFeatures}>
        {TIER_FEATURES[tier].map((f) => (
          <li key={f} className={styles.upgradeCardFeature}>
            <span aria-hidden="true">✓</span> {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.upgradeCardBtn}
        onClick={onUpgrade}
        disabled={upgrading}
      >
        {upgrading ? 'Redirecting…' : `Start ${TIER_LABELS[tier]}`}
      </button>
    </div>
  );
}

export function AccountClient(): React.ReactElement {
  const [user, setUser] = useState<UserWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sub, setSub] = useState<SubscriptionWire | null>(null);
  const [upgrading, setUpgrading] = useState<'premium' | 'elite' | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [meRes, subRes] = await Promise.all([
          fetcher('/api/users/me', { schema: schemas.MeResponseSchema }),
          fetcher('/api/subscriptions/me', { schema: schemas.GetMySubscriptionResponseSchema }),
        ]);
        setUser(meRes.user);
        setNameInput(meRes.user.display_name);
        setSub(subRes.subscription);
      } catch (err) {
        setLoadError(
          err instanceof FetcherError ? err.message : 'Could not load account info.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveName = async (): Promise<void> => {
    if (user === null || nameInput.trim() === user.display_name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await patchJson('/api/users/me', { display_name: nameInput.trim() }, {
        schema: schemas.MeResponseSchema,
      });
      setUser(res.user);
      setEditingName(false);
    } catch (err) {
      setSaveError(err instanceof FetcherError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = async (targetTier: 'premium' | 'elite'): Promise<void> => {
    setUpgrading(targetTier);
    setUpgradeError(null);
    try {
      const res = await postJson('/api/subscriptions', { tier: targetTier }, {
        schema: schemas.CreateSubscriptionResponseSchema,
      });
      window.location.href = res.checkout_url;
    } catch (err) {
      setUpgradeError(err instanceof FetcherError ? err.message : 'Could not start checkout. Try again.');
      setUpgrading(null);
    }
  };

  const handleCancel = async (): Promise<void> => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await postJson('/api/subscriptions/me/cancel', {}, {
        schema: schemas.CancelSubscriptionResponseSchema,
      });
      setSub(res.subscription);
      setCancelConfirm(false);
    } catch (err) {
      setCancelError(err instanceof FetcherError ? err.message : 'Could not cancel. Try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  if (loadError !== null || user === null) {
    return (
      <div className={styles.page}>
        <p className={styles.errorText}>{loadError ?? 'Something went wrong.'}</p>
      </div>
    );
  }

  const tier = user.subscription_tier;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Account</h1>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Profile</h2>
        <div className={styles.profileRow}>
          <div className={styles.avatar}>{getInitial(user.display_name)}</div>
          <div className={styles.profileInfo}>
            {editingName ? (
              <div className={styles.editRow}>
                <input
                  className={styles.nameInput}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={100}
                  autoFocus
                  disabled={saving}
                />
                {saveError !== null && (
                  <p className={styles.inlineError}>{saveError}</p>
                )}
                <div className={styles.editActions}>
                  <button
                    type="button"
                    className={styles.saveNameBtn}
                    onClick={() => void handleSaveName()}
                    disabled={saving || nameInput.trim().length === 0}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => {
                      setEditingName(false);
                      setNameInput(user.display_name);
                      setSaveError(null);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.nameRow}>
                <span className={styles.displayName}>{user.display_name}</span>
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => setEditingName(true)}
                >
                  Edit
                </button>
              </div>
            )}
            <p className={styles.email}>{user.email}</p>
            <p className={styles.joinDate}>Joined {formatDate(user.created_at)}</p>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Plan</h2>

        <div className={styles.tierRow}>
          <TierBadge tier={tier} />
          {sub !== null && sub.cancel_at_period_end && sub.current_period_end !== null && (
            <span className={styles.cancelNotice}>
              Cancels {formatDate(sub.current_period_end)}
            </span>
          )}
          {sub !== null && !sub.cancel_at_period_end && sub.current_period_end !== null && (
            <span className={styles.renewalMeta}>
              Renews {formatDate(sub.current_period_end)}
            </span>
          )}
        </div>

        <ul className={styles.featureList}>
          {TIER_FEATURES[tier].map((f) => (
            <li key={f} className={styles.featureItem}>
              <span className={styles.checkmark} aria-hidden="true">✓</span>
              {f}
            </li>
          ))}
        </ul>

        {upgradeError !== null && (
          <p role="alert" className={styles.inlineError}>{upgradeError}</p>
        )}

        {tier !== 'elite' && (
          <div className={styles.upgradeGrid}>
            {tier === 'free' && (
              <UpgradeCard
                tier="premium"
                onUpgrade={() => void handleUpgrade('premium')}
                upgrading={upgrading === 'premium'}
              />
            )}
            <UpgradeCard
              tier="elite"
              onUpgrade={() => void handleUpgrade('elite')}
              upgrading={upgrading === 'elite'}
            />
          </div>
        )}

        {tier !== 'free' && sub !== null && !sub.cancel_at_period_end && (
          <div className={styles.cancelSection}>
            {cancelError !== null && (
              <p role="alert" className={styles.inlineError}>{cancelError}</p>
            )}
            {cancelConfirm ? (
              <div className={styles.cancelConfirmBox}>
                <p className={styles.cancelConfirmText}>
                  Your plan stays active until the end of the billing period.
                </p>
                <div className={styles.cancelConfirmActions}>
                  <button
                    type="button"
                    className={styles.cancelConfirmBtn}
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                  >
                    {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelDismissBtn}
                    onClick={() => {
                      setCancelConfirm(false);
                      setCancelError(null);
                    }}
                    disabled={cancelling}
                  >
                    Keep plan
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.cancelLink}
                onClick={() => setCancelConfirm(true)}
              >
                Cancel subscription
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
