import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { configureCognito } from './src/lib/cognito';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignupScreen } from './src/screens/SignupScreen';
import { ClaimsFeedScreen } from './src/screens/ClaimsFeedScreen';
import { ClaimDetailScreen } from './src/screens/ClaimDetailScreen';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { resolveToken, px } from './src/lib/tokens';
import { tokens } from '@celebbase/design-tokens';
import { bootstrapSession } from './src/services/auth-bootstrap';
import { onLogoutSignal, type LogoutReason } from './src/lib/auth-events';

// Amplify v6 의 Cognito User Pool 설정을 module load 시점에 1회 적용한다.
// signIn / signUp 호출 전에 반드시 configure 되어 있어야 한다.
configureCognito();

type Screen =
  | 'loading'
  | 'login'
  | 'signup'
  | 'authenticated'
  | 'claim_detail'
  | 'onboarding'
  | 'onboarding_complete_placeholder';

// 5종 reason 중 사용자에게 사유를 알려야 하는 두 케이스는 Alert. 나머지는 silent.
function describeLogout(reason: LogoutReason): { title: string; message: string } | null {
  if (reason === 'reuse_detected') {
    return {
      title: '보안 알림',
      message:
        '다른 위치에서 동일한 계정이 사용된 정황이 감지되어 모든 디바이스에서 로그아웃했습니다. 다시 로그인해 주세요.',
    };
  }
  if (reason === 'account_deleted') {
    return {
      title: '계정 안내',
      message: '계정이 삭제되었습니다. 복구가 필요하면 고객센터로 문의해 주세요.',
    };
  }
  return null;
}

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('loading');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void bootstrapSession().then((result) => {
      if (cancelled) return;
      setScreen(result);
    });

    const off = onLogoutSignal((reason) => {
      const message = describeLogout(reason);
      if (message !== null) {
        Alert.alert(message.title, message.message);
      }
      setSelectedClaimId(null);
      setScreen('login');
    });

    return (): void => {
      cancelled = true;
      off();
    };
  }, []);

  if (screen === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <>
        <LoginScreen
          onSuccess={() => {
            setScreen('authenticated');
          }}
          onSignupRequest={() => {
            setScreen('signup');
          }}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (screen === 'signup') {
    return (
      <>
        <SignupScreen
          onSuccess={() => {
            setScreen('authenticated');
          }}
          onBackToLogin={() => {
            setScreen('login');
          }}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (screen === 'claim_detail' && selectedClaimId !== null) {
    return (
      <>
        <ClaimDetailScreen
          claimId={selectedClaimId}
          onBack={() => {
            setSelectedClaimId(null);
            setScreen('authenticated');
          }}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (screen === 'onboarding') {
    return (
      <>
        <OnboardingFlow
          onComplete={() => {
            // S2-S4 완료. S5-S7 (PHI + Reveal + 최종 POST) 는 후속 sub-task.
            setScreen('onboarding_complete_placeholder');
          }}
          onClose={() => {
            setScreen('authenticated');
          }}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (screen === 'onboarding_complete_placeholder') {
    return (
      <View style={styles.placeholderContainer}>
        <Text style={styles.placeholderTitle}>입력 완료 🎉</Text>
        <Text style={styles.placeholderBody}>
          기본 정보가 저장되었습니다. 다음 단계 (활동량 · 알러지 · 목표 · 최종 결과)는 곧 추가됩니다.
        </Text>
        <TouchableOpacity
          onPress={() => {
            setScreen('authenticated');
          }}
          accessibilityRole="button"
          style={styles.placeholderButton}
        >
          <Text style={styles.placeholderButtonText}>홈으로</Text>
        </TouchableOpacity>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      <ClaimsFeedScreen
        onClaimPress={(id) => {
          setSelectedClaimId(id);
          setScreen('claim_detail');
        }}
        onOnboardingPress={() => {
          setScreen('onboarding');
        }}
      />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    padding: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-3']),
  },
  placeholderTitle: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    textAlign: 'center',
  },
  placeholderBody: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  placeholderButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
    marginTop: px(tokens.light['--cb-space-3']),
  },
  placeholderButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
});
