// Profile — 사용자 자기 정보 + bio-profile 요약 + subscription tier badge.
//
// 데이터:
//   - GET /api/users/me — display_name, email, joined date, preferred_celebrity_slug, tier
//
// 액션:
//   - "Edit profile" → Onboarding modal 재진입 (기존 onboarding flow 재사용)
//   - "Upgrade to Premium" → Paywall (free tier 만 노출)
//
// ui/ primitive 레이어로 재작성 (IMPL-MOBILE-CELEB-REDESIGN-001 design system).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { schemas } from '@celebbase/shared-types';

import { getCurrentUser } from '../services/users';
import { Avatar, Badge, Button, Card, Text, useTheme, type BadgeTone, type Theme } from '../ui';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          <ActivityIndicator size="large" color={theme.color.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase.state === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text variant="body" tone="error">
            Couldn't load your profile.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { user } = phase;
  const isFreeTier = user.subscription_tier === 'free';
  const joinedDate = formatJoinedDate(user.created_at);
  const tierLabel =
    user.subscription_tier === 'free'
      ? 'Free'
      : user.subscription_tier === 'premium'
        ? 'Premium'
        : 'Elite';
  const tierTone: BadgeTone = isFreeTier ? 'neutral' : 'brand';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.avatarSection}>
          <Avatar name={user.display_name} uri={user.avatar_url} size={96} />
          <Text variant="h2">{user.display_name}</Text>
          <Text variant="body" tone="muted">
            {user.email}
          </Text>
          <Badge label={tierLabel} tone={tierTone} />
        </View>

        <View style={styles.section}>
          <Text variant="label" tone="muted" style={styles.sectionTitle}>
            About you
          </Text>
          <View style={styles.sectionBody}>
            <Row label="Joined" value={joinedDate} />
            <Row label="Following" value={user.preferred_celebrity_slug ?? 'None yet'} />
            <Row label="Language" value={user.locale} />
          </View>
        </View>

        {isFreeTier ? (
          <Card variant="subtle" style={styles.upgradeCard}>
            <Text variant="h3" tone="brand" center>
              Unlock Celebase Pro
            </Text>
            <Text variant="bodySm" center>
              Personalized plans, full celebrity libraries, daily insights.
            </Text>
            <View style={styles.upgradeButton}>
              <Button
                label="Upgrade"
                onPress={onUpgradePress}
                testID="profile-upgrade"
                accessibilityLabel="Upgrade to Pro"
              />
            </View>
          </Card>
        ) : null}

        <View style={styles.actionsSection}>
          <Button
            label="Edit profile details"
            variant="secondary"
            onPress={onEditBioProfile}
            testID="profile-edit"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Text variant="body">{label}</Text>
      <Text variant="body" tone="muted">
        {value}
      </Text>
    </View>
  );
}

function formatJoinedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    body: { paddingBottom: theme.space(5) },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space(4) },
    avatarSection: {
      alignItems: 'center',
      paddingVertical: theme.space(5),
      paddingHorizontal: theme.space(4),
      gap: theme.space(2),
    },
    section: { marginTop: theme.space(3) },
    sectionTitle: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(2) },
    sectionBody: {
      backgroundColor: theme.color.surface,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.color.border,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    upgradeCard: { margin: theme.space(4), alignItems: 'center', gap: theme.space(2) },
    upgradeButton: { marginTop: theme.space(2), alignSelf: 'stretch' },
    actionsSection: { paddingHorizontal: theme.space(4), paddingTop: theme.space(3) },
  });
}
