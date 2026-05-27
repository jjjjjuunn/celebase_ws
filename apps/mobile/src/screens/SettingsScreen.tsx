// Settings — Apple Guideline 5.1.1(v) 준수.
//
// 비주얼은 settings mockup 을 참조한 재설계 (프로필 카드 + 아이콘 섹션 카드 +
// chevron). 기능/문구는 기존 그대로 유지 — mockup 의 신규 항목(다크모드/언어/캐시/
// 고객센터/프로필 편집)은 백엔드 동작이 없어 추가하지 않는다 (dead control 방지).
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
import { deleteAccount, getCurrentUser } from '../services/users';
import { Avatar, Badge, Card, Text, useTheme, type Theme } from '../ui';

const TERMS_URL = 'https://celebase.app/terms';
const PRIVACY_URL = 'https://celebase.app/privacy';
const SUPPORT_EMAIL = 'support@celebase.app';

// Apple / Play 의 subscription 관리 시스템 설정 deep link.
// CHORE-MOBILE-PLATFORM-LINK-001 백로그: Platform.OS 분기로 _PLAY_SUBSCRIPTIONS_URL 활성화.
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
// Reserved for Android — Platform.OS branch 도입 시 활성화 (prefix `_` = 미사용 의도).
const _PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
void _PLAY_SUBSCRIPTIONS_URL;

const AVATAR_SIZE = 84;

interface SettingsScreenProps {
  /** 프로필 편집 화면으로 이동(SettingsNavigator 주입). 미주입 시 프로필 카드는
   *  비클릭 상태로 렌더된다(테스트 등). */
  onEditProfile?: () => void;
  /** dev 빌드 전용 — Settings 에서 온보딩 모달을 다시 열기 위한 콜백(root nav 주입).
   *  미주입(테스트 등) 시 Developer 섹션 자체가 렌더되지 않는다. */
  onReplayOnboarding?: () => void;
  /** 화면이 포커스를 (재)획득할 때 프로필을 다시 불러오기 위한 신호. EditProfile
   *  에서 이름/사진을 바꾸고 goBack 해도 네이티브 스택은 본 화면을 언마운트하지
   *  않으므로(useEffect 재실행 X), SettingsNavigator 가 useIsFocused() 를 주입해
   *  포커스 복귀 시 재조회한다. 미주입(테스트 등) 시 true → 마운트 시 1회 fetch. */
  isFocused?: boolean;
}

export function SettingsScreen({
  onEditProfile,
  onReplayOnboarding,
  isFocused = true,
}: SettingsScreenProps = {}): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tier } = useCurrentTier();
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Profile — GET /api/users/me. This screen only renders when signed in
  // (RootNavigator gates auth), so a fetch failure shows "Unavailable", not a
  // misleading "Not signed in".
  const [email, setEmail] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    // 포커스가 없을 때(EditProfile 로 이동한 상태)는 재조회하지 않는다 — 포커스
    // 복귀 시 isFocused 가 false→true 로 바뀌며 effect 가 다시 돌아 최신 프로필을 반영.
    if (!isFocused) return undefined;
    let cancelled = false;
    getCurrentUser()
      .then((res) => {
        if (cancelled) return;
        setEmail(res.user.email);
        // 테스트 mock 은 email 만 제공 → 런타임 display_name/avatar_url 은 undefined 가
        // 될 수 있어 resolveProfileName / Avatar 가 `!= null` 로 방어한다.
        setDisplayName(res.user.display_name);
        setAvatarUrl(res.user.avatar_url);
      })
      .catch(() => {
        if (!cancelled) setEmailFailed(true);
      });
    return (): void => {
      cancelled = true;
    };
  }, [isFocused]);

  const emailValue = email ?? (emailFailed ? 'Unavailable' : 'Loading…');
  const profileName = resolveProfileName(displayName, email);

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

  async function handleDeleteAccount(): Promise<void> {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
    } catch {
      // 삭제 실패 — 세션 유지 (재시도 가능). 명시적 안내, silent ignore 금지.
      Alert.alert(
        "Couldn't delete account",
        `Please try again, or contact ${SUPPORT_EMAIL} if this keeps happening.`,
      );
      setDeleting(false);
      return;
    }
    // 서버에서 deleted_at soft-delete 완료 → 로그인/refresh 차단됨. 로컬 세션 정리 후
    // Auth 로 복귀. signOut() 은 토큰 폐기 + Amplify signOut(best-effort) — 화면 전환
    // 자체가 사용자에게 삭제 완료 신호.
    await signOut();
    signalLogout('expired_or_missing');
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
          onPress: () => void handleDeleteAccount(),
        },
      ],
    );
  }

  function manageSubscription(): void {
    // iOS 와 Android 분기는 후속 chore — 현재는 Apple 우선.
    void Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h1" style={styles.screenTitle}>
          Settings
        </Text>

        <ProfileCard
          name={profileName}
          email={emailValue}
          avatarUrl={avatarUrl}
          onPress={onEditProfile}
        />

        <Section title="Account">
          <Row
            icon="mail-outline"
            label="Email"
            trailing={
              <Text variant="body" tone="muted" numberOfLines={1} style={styles.valueText}>
                {emailValue}
              </Text>
            }
            isLast
          />
        </Section>

        <Section title="Subscription">
          <Row
            icon="star-outline"
            label="Current plan"
            trailing={<Badge label={tierLabel(tier).toUpperCase()} tone={tier === 'free' ? 'subtle' : 'brand'} />}
            isLast={tier === 'free'}
          />
          {tier !== 'free' ? (
            <Row
              icon="card-outline"
              label="Manage subscription"
              onPress={manageSubscription}
              testID="settings-manage-subscription"
              isLast
            />
          ) : null}
        </Section>

        <Section title="Legal">
          <Row
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => {
              void Linking.openURL(TERMS_URL);
            }}
            testID="settings-terms"
          />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => {
              void Linking.openURL(PRIVACY_URL);
            }}
            testID="settings-privacy"
          />
          <Row
            icon="help-circle-outline"
            label="Contact support"
            onPress={() => {
              void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
            testID="settings-support"
            isLast
          />
        </Section>

        {__DEV__ && onReplayOnboarding !== undefined ? (
          <Section title="Developer">
            <Row
              icon="refresh-outline"
              label="Replay onboarding"
              onPress={onReplayOnboarding}
              testID="settings-replay-onboarding"
              isLast
            />
          </Section>
        ) : null}

        <View style={styles.section}>
          <Card variant="surface" padded={false}>
            <Row
              icon="log-out-outline"
              label={signingOut ? 'Signing out...' : 'Sign out'}
              destructive
              disabled={signingOut}
              onPress={confirmSignOut}
              testID="settings-signout"
              trailing={null}
              isLast
            />
          </Card>
        </View>

        {/* 되돌릴 수 없는 삭제는 Sign out 아래 별도 카드로 가장 끝에 배치. */}
        <View style={styles.section}>
          <Card variant="surface" padded={false}>
            <Row
              icon="trash-outline"
              label={deleting ? 'Deleting…' : 'Delete account'}
              destructive
              disabled={deleting}
              onPress={confirmDeleteAccount}
              testID="settings-delete-account"
              trailing={null}
              isLast
            />
          </Card>
        </View>

        <Text variant="caption" tone="muted" center style={styles.versionText}>
          Celebase · v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface ProfileCardProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  /** When provided the card is pressable (→ edit profile) and shows a pencil badge. */
  onPress?: () => void;
}

function ProfileCard({ name, email, avatarUrl, onPress }: ProfileCardProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Card
      style={styles.profileCard}
      {...(onPress ? { onPress, accessibilityLabel: 'Edit profile' } : {})}
    >
      <View style={styles.avatarRing}>
        <Avatar name={name} uri={avatarUrl} size={AVATAR_SIZE} />
        {onPress ? (
          <View style={styles.editBadge} testID="settings-edit-profile">
            <Ionicons name="pencil" size={14} color={theme.color.onBrand} />
          </View>
        ) : null}
      </View>
      <Text variant="h2" style={styles.profileName} numberOfLines={1}>
        {name}
      </Text>
      <Text variant="body" tone="muted" numberOfLines={1}>
        {email}
      </Text>
    </Card>
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
      <Card variant="surface" padded={false}>
        {children}
      </Card>
    </View>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface RowProps {
  icon: IoniconName;
  label: string;
  onPress?: () => void;
  /** undefined → 기본값(pressable 이면 chevron, 아니면 없음). null → 명시적 비표시. */
  trailing?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
  /** 마지막 행이면 하단 divider 를 그리지 않는다. */
  isLast?: boolean;
}

function Row({
  icon,
  label,
  onPress,
  trailing,
  destructive = false,
  disabled = false,
  testID,
  isLast = false,
}: RowProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const iconColor = destructive ? theme.color.error : theme.color.textMuted;
  const resolvedTrailing =
    trailing !== undefined ? (
      trailing
    ) : onPress ? (
      <Ionicons name="chevron-forward" size={18} color={theme.color.textSubtle} />
    ) : null;

  const body = (
    <View style={styles.rowInner}>
      <Ionicons name={icon} size={22} color={iconColor} style={styles.rowIcon} />
      <View style={[styles.rowBody, isLast ? null : styles.rowDivider]}>
        <Text
          variant="body"
          tone={destructive ? 'error' : 'default'}
          style={styles.rowLabel}
          numberOfLines={1}
        >
          {label}
        </Text>
        {resolvedTrailing != null ? <View style={styles.rowTrailing}>{resolvedTrailing}</View> : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        testID={testID}
        activeOpacity={0.6}
        style={disabled ? styles.rowDisabled : undefined}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View testID={testID}>{body}</View>;
}

function resolveProfileName(displayName: string | null, email: string | null): string {
  if (displayName != null && displayName.length > 0) return displayName;
  if (email != null && email.length > 0) return email.split('@')[0];
  return 'Your profile';
}

function tierLabel(tier: string): string {
  if (tier === 'premium') return 'Premium';
  if (tier === 'elite') return 'Elite';
  return 'Free';
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    body: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(8) },
    screenTitle: { paddingTop: theme.space(2), paddingBottom: theme.space(4) },

    // Profile hero card.
    profileCard: { alignItems: 'center', paddingVertical: theme.space(6) },
    avatarRing: {
      padding: theme.space(1),
      borderRadius: 999,
      borderWidth: 2,
      borderColor: theme.color.brand,
      marginBottom: theme.space(3),
    },
    editBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.color.brand,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.color.surface,
    },
    profileName: { marginBottom: theme.space(1) },

    // Section + rows.
    section: { marginTop: theme.space(5) },
    sectionTitle: { paddingLeft: theme.space(3), paddingBottom: theme.space(2) },
    rowInner: { flexDirection: 'row', alignItems: 'center', paddingLeft: theme.space(4) },
    rowIcon: { width: 26, textAlign: 'center', marginRight: theme.space(3) },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: theme.space(4),
      paddingRight: theme.space(4),
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.border },
    rowDisabled: { opacity: 0.5 },
    rowLabel: { flexShrink: 1, marginRight: theme.space(2) },
    rowTrailing: { flexDirection: 'row', alignItems: 'center' },
    valueText: { flexShrink: 1, textAlign: 'right' },

    versionText: { marginTop: theme.space(6) },
  });
}
