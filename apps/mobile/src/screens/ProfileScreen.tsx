// Profile — 사용자 자기 정보 + bio-profile 요약 + subscription tier badge.
//
// 데이터:
//   - GET /api/users/me — display_name, email, joined date, preferred_celebrity_slug, tier
//   - 추후 GET /api/users/me/bio-profile — bio summary (current sub-task X, 별도 chore)
//
// 액션:
//   - "Edit profile" → Onboarding modal 재진입 (기존 onboarding flow 재사용)
//   - "Upgrade to Premium" → Paywall (free tier 만 노출)

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
import { getCurrentUser } from '../services/users';

interface ProfileScreenProps {
  onEditBioProfile: () => void;
  onUpgradePress: () => void;
}

type Phase =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; user: schemas.UserWire };

export function ProfileScreen({
  onEditBioProfile,
  onUpgradePress,
}: ProfileScreenProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'loading' });

    getCurrentUser()
      .then((res) => {
        if (cancelled) return;
        setPhase({ state: 'loaded', user: res.user });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown';
        setPhase({ state: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  if (phase.state === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color={resolveToken('light', '--cb-color-brand')}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (phase.state === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load your profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { user } = phase;
  const isFreeTier = user.subscription_tier === 'free';
  const joinedDate = formatJoinedDate(user.created_at);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.avatarSection}>
          {user.avatar_url !== null ? (
            <Image
              accessibilityLabel={`${user.display_name} avatar`}
              source={{ uri: user.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {user.display_name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.displayName}>{user.display_name}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <TierBadge tier={user.subscription_tier} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About you</Text>
          <View style={styles.sectionBody}>
            <Row label="Joined" value={joinedDate} />
            <Row
              label="Following"
              value={user.preferred_celebrity_slug ?? 'None yet'}
            />
            <Row label="Language" value={user.locale} />
          </View>
        </View>

        {isFreeTier ? (
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeTitle}>Unlock CelebBase Pro</Text>
            <Text style={styles.upgradeBody}>
              Personalized plans, full celebrity libraries, daily insights.
            </Text>
            <TouchableOpacity
              onPress={onUpgradePress}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Pro"
              testID="profile-upgrade"
              style={styles.upgradeButton}
            >
              <Text style={styles.upgradeButtonText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.actionsSection}>
          <TouchableOpacity
            onPress={onEditBioProfile}
            accessibilityRole="button"
            accessibilityLabel="Edit profile details"
            testID="profile-edit"
            style={styles.editButton}
          >
            <Text style={styles.editButtonText}>Edit profile details</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

interface TierBadgeProps {
  tier: schemas.UserWire['subscription_tier'];
}

function TierBadge({ tier }: TierBadgeProps): React.JSX.Element {
  const label = tier === 'free' ? 'Free' : tier === 'premium' ? 'Premium' : 'Elite';
  const isPaid = tier !== 'free';
  return (
    <View style={[styles.tierBadge, isPaid ? styles.tierBadgePaid : null]}>
      <Text style={[styles.tierBadgeText, isPaid ? styles.tierBadgeTextPaid : null]}>
        {label}
      </Text>
    </View>
  );
}

function formatJoinedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  body: {
    paddingBottom: px(tokens.light['--cb-space-5']),
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: px(tokens.light['--cb-space-5']),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-2']),
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: px(tokens.light['--cb-space-2']),
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: px(tokens.light['--cb-space-2']),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  email: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  tierBadge: {
    marginTop: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: resolveToken('light', '--cb-color-neutral-100'),
  },
  tierBadgePaid: {
    backgroundColor: resolveToken('light', '--cb-color-brand'),
  },
  tierBadgeText: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierBadgeTextPaid: {
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  section: {
    marginTop: px(tokens.light['--cb-space-3']),
  },
  sectionTitle: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text-muted'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-2']),
  },
  sectionBody: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
    borderBottomWidth: 1,
    borderBottomColor: resolveToken('light', '--cb-color-border'),
  },
  rowLabel: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
  },
  rowValue: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  upgradeCard: {
    margin: px(tokens.light['--cb-space-4']),
    padding: px(tokens.light['--cb-space-4']),
    borderRadius: 16,
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
    alignItems: 'center',
    gap: px(tokens.light['--cb-space-2']),
  },
  upgradeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
  },
  upgradeBody: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
  upgradeButton: {
    marginTop: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-5']),
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    backgroundColor: resolveToken('light', '--cb-color-brand'),
    borderRadius: 8,
  },
  upgradeButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  actionsSection: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingTop: px(tokens.light['--cb-space-3']),
  },
  editButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
  },
  editButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
});
