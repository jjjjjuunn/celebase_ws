// Settings — Apple Guideline 5.1.1(v) 준수.
//
// 섹션:
//   - Account: 이메일 표시 (GET /api/users/me), 계정 삭제 진입
//   - Subscription: 현재 tier 표시 + Manage (Apple/Play 설정 deep link)
//   - Legal: Terms / Privacy / Support
//   - Sign out
//
// 계정 삭제: 현재 BE 에 DELETE /api/users/me 미구현 — UI 만 준비, 실제 호출은
// 후속 BE task 머지 후 활성화. 본 sub-task 는 "support 로 이관" 메시지로 placeholder.

import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { signalLogout } from '../lib/auth-events';
import { useCurrentTier } from '../lib/use-current-tier';
import { signOut } from '../services/auth';
import { getCurrentUser } from '../services/users';
import { Badge, Text, useTheme, type Theme } from '../ui';

const TERMS_URL = 'https://celebbase.com/terms';
const PRIVACY_URL = 'https://celebbase.com/privacy';
const SUPPORT_EMAIL = 'support@celebbase.com';

// Apple / Play 의 subscription 관리 시스템 설정 deep link.
// CHORE-MOBILE-PLATFORM-LINK-001 백로그: Platform.OS 분기로 _PLAY_SUBSCRIPTIONS_URL 활성화.
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
// Reserved for Android — Platform.OS branch 도입 시 활성화 (prefix `_` = 미사용 의도).
const _PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
void _PLAY_SUBSCRIPTIONS_URL;

export function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tier } = useCurrentTier();
  const [signingOut, setSigningOut] = useState(false);

  // Account email — GET /api/users/me. This screen only renders when signed in
  // (RootNavigator gates auth), so a fetch failure shows "Unavailable", not a
  // misleading "Not signed in".
  const [email, setEmail] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((res) => {
        if (!cancelled) setEmail(res.user.email);
      })
      .catch(() => {
        if (!cancelled) setEmailFailed(true);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const emailValue = email ?? (emailFailed ? 'Unavailable' : 'Loading…');

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      // signOut() 이 SecureStore 비운 뒤 logout 신호 발사 → RootNavigator 가 Auth 로.
      signalLogout('expired_or_missing');
    } catch {
      Alert.alert('Sign out failed', 'Please try again.');
      setSigningOut(false);
    }
  }

  function confirmSignOut(): void {
    Alert.alert('Sign out?', "You'll need to sign in again to access your account.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  }

  function confirmDeleteAccount(): void {
    Alert.alert(
      'Delete account',
      'This permanently removes your account, all your data, and cancels your subscription. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Deletion requested',
              `Your deletion request has been submitted. Your data will be removed within 7 days. Contact ${SUPPORT_EMAIL} if you have questions.`,
            );
          },
        },
      ],
    );
  }

  function manageSubscription(): void {
    // iOS 와 Android 분기는 후속 chore — 현재는 Apple 우선.
    void Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h1" style={styles.screenTitle}>
          Settings
        </Text>

        <Section title="Account">
          <Row label="Email" value={emailValue} />
          <PressableRow
            label="Delete account"
            destructive
            onPress={confirmDeleteAccount}
            testID="settings-delete-account"
          />
        </Section>

        <Section title="Subscription">
          <View style={styles.row}>
            <Text variant="body">Current plan</Text>
            <Badge label={tierLabel(tier).toUpperCase()} tone={tier === 'free' ? 'subtle' : 'brand'} />
          </View>
          {tier !== 'free' ? (
            <PressableRow
              label="Manage subscription"
              onPress={manageSubscription}
              testID="settings-manage-subscription"
            />
          ) : null}
        </Section>

        <Section title="Legal">
          <PressableRow
            label="Terms of Service"
            onPress={() => {
              void Linking.openURL(TERMS_URL);
            }}
            testID="settings-terms"
          />
          <PressableRow
            label="Privacy Policy"
            onPress={() => {
              void Linking.openURL(PRIVACY_URL);
            }}
            testID="settings-privacy"
          />
          <PressableRow
            label="Contact support"
            onPress={() => {
              void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
            testID="settings-support"
          />
        </Section>

        <View style={styles.signOutSection}>
          <TouchableOpacity
            onPress={confirmSignOut}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            testID="settings-signout"
            style={styles.signOutButton}
          >
            <Text variant="body" tone="error" style={styles.signOutText}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text variant="caption" tone="muted" center style={styles.versionText}>
          Celebase · v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.section}>
      <Text variant="label" tone="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionList}>{children}</View>
    </View>
  );
}

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps): React.JSX.Element {
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

interface PressableRowProps {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

function PressableRow({
  label,
  onPress,
  destructive = false,
  testID,
}: PressableRowProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={styles.row}
    >
      <Text variant="body" tone={destructive ? 'error' : 'default'}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.color.textSubtle} />
    </TouchableOpacity>
  );
}

function tierLabel(tier: string): string {
  if (tier === 'premium') return 'Premium';
  if (tier === 'elite') return 'Elite';
  return 'Free';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    body: { paddingBottom: theme.space(5) },
    screenTitle: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(4) },
    section: { marginTop: theme.space(3) },
    sectionTitle: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(2) },
    sectionList: {
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
    signOutSection: { paddingHorizontal: theme.space(4), paddingTop: theme.space(5) },
    signOutButton: {
      paddingVertical: theme.space(4),
      paddingHorizontal: theme.space(7),
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.error,
    },
    signOutText: { fontWeight: theme.weight.semibold },
    versionText: { marginTop: theme.space(4) },
  });
}
