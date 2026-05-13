// Settings — Apple Guideline 5.1.1(v) 준수.
//
// 섹션:
//   - Account: 이메일 표시 (TODO: GET /api/users/me 로 가져오기), 계정 삭제 진입
//   - Subscription: 현재 tier 표시 + Manage (Apple/Play 설정 deep link)
//   - Legal: Terms / Privacy
//   - Sign out
//
// 계정 삭제: 현재 BE 에 DELETE /api/users/me 미구현 — UI 만 준비, 실제 호출은
// 후속 BE task (JUNWON 영역) 머지 후 활성화. 본 sub-task 는 "support 로 이관"
// 메시지로 placeholder. Apple 심사용으로는 UI 흐름 존재만으로 충분 (실제 처리는
// 7일 grace period 안에 manual 가능).

import { useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';
import { signOut } from '../services/auth';
import { signalLogout } from '../lib/auth-events';
import { useCurrentTier } from '../lib/use-current-tier';

const TERMS_URL = 'https://celebbase.com/terms';
const PRIVACY_URL = 'https://celebbase.com/privacy';
const SUPPORT_EMAIL = 'support@celebbase.com';

// Apple / Play 의 subscription 관리 시스템 설정 deep link.
// CHORE-MOBILE-PLATFORM-LINK-001 백로그: Platform.OS 분기로 _PLAY_SUBSCRIPTIONS_URL 활성화.
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
// Reserved for Android — Platform.OS branch 도입 시 활성화 (prefix `_` = 미사용 의도).
const _PLAY_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions';
void _PLAY_SUBSCRIPTIONS_URL;

export function SettingsScreen(): React.JSX.Element {
  const { tier } = useCurrentTier();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
      // signOut() 이 SecureStore 비운 뒤 logout 신호 발사 → RootNavigator 가 Auth 로.
      // 'expired_or_missing' = 토큰 없음 상태. describeLogout 이 silent 처리 (Alert 없음).
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
            // Apple 심사 요건: in-app 삭제 시작점 존재. 실제 처리는 7일 grace 안에
            // manual / BE endpoint (도래 후) — 본 sub-task 는 support 안내.
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
        <Text style={styles.screenTitle}>Settings</Text>

        <Section title="Account">
          <Row label="Email" value="Not signed in" />
          <PressableRow
            label="Delete account"
            destructive
            onPress={confirmDeleteAccount}
            testID="settings-delete-account"
          />
        </Section>

        <Section title="Subscription">
          <Row label="Current plan" value={tierLabel(tier)} />
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
            <Text style={styles.signOutText}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>CelebBase · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionList}>{children}</View>
    </View>
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
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={styles.row}
    >
      <Text style={[styles.rowLabel, destructive ? styles.rowLabelDestructive : null]}>
        {label}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function tierLabel(tier: string): string {
  if (tier === 'premium') return 'Premium';
  if (tier === 'elite') return 'Elite';
  return 'Free';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  body: {
    paddingBottom: px(tokens.light['--cb-space-5']),
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: resolveToken('light', '--cb-color-text'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-4']),
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
  sectionList: {
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
  rowLabelDestructive: {
    color: resolveToken('light', '--cb-color-error'),
  },
  rowValue: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  chevron: {
    fontSize: 20,
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  signOutSection: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingTop: px(tokens.light['--cb-space-5']),
  },
  signOutButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-error'),
  },
  signOutText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-error'),
  },
  versionText: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
    textAlign: 'center',
    marginTop: px(tokens.light['--cb-space-4']),
  },
});
