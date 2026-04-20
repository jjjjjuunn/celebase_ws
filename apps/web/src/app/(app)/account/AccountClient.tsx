'use client';

import { useEffect, useState } from 'react';
import { fetcher, patchJson, FetcherError } from '@/lib/fetcher.js';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import styles from './account.module.css';

type UserWire = z.infer<typeof schemas.UserWireSchema>;
type SubscriptionTier = UserWire['subscription_tier'];

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  premium: 'Premium',
  elite: 'Elite',
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

function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function AccountClient(): React.ReactElement {
  const [user, setUser] = useState<UserWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetcher('/api/users/me', { schema: schemas.MeResponseSchema });
        setUser(res.user);
        setNameInput(res.user.display_name);
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
      setSaveError(
        err instanceof FetcherError ? err.message : 'Could not save changes.',
      );
    } finally {
      setSaving(false);
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

      {/* Profile card */}
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
                    onClick={() => { setEditingName(false); setNameInput(user.display_name); setSaveError(null); }}
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
            <p className={styles.joinDate}>Joined {formatJoinDate(user.created_at)}</p>
          </div>
        </div>
      </section>

      {/* Subscription card */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Plan</h2>
        <div className={styles.tierRow}>
          <TierBadge tier={tier} />
          {tier === 'free' && (
            <button type="button" className={styles.upgradeBtn}>
              Upgrade to Premium
            </button>
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
      </section>
    </div>
  );
}
