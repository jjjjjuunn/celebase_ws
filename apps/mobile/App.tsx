import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configureCognito } from './src/lib/cognito';
import { configureRevenueCat } from './src/lib/revenuecat';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignupScreen } from './src/screens/SignupScreen';
import { ClaimsFeedScreen } from './src/screens/ClaimsFeedScreen';
import { ClaimDetailScreen } from './src/screens/ClaimDetailScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { resolveToken } from './src/lib/tokens';
import { bootstrapSession } from './src/services/auth-bootstrap';
import { onLogoutSignal, type LogoutReason } from './src/lib/auth-events';

// Amplify v6 의 Cognito User Pool 설정을 module load 시점에 1회 적용한다.
// signIn / signUp 호출 전에 반드시 configure 되어 있어야 한다.
configureCognito();
// RevenueCat SDK — IAP 호출 전에 configure 되어야 한다. DEV 에서 API key 부재 시
// silent skip (UI 둘러보기 전용 — purchase 호출 시점에 native module 부재로 throw).
configureRevenueCat();

type Screen =
  | 'loading'
  | 'login'
  | 'signup'
  | 'authenticated'
  | 'claim_detail'
  | 'onboarding'
  | 'paywall';

// 5종 reason 중 사용자에게 사유를 알려야 하는 두 케이스는 Alert. 나머지는 silent.
function describeLogout(reason: LogoutReason): { title: string; message: string } | null {
  if (reason === 'reuse_detected') {
    return {
      title: 'Security alert',
      message:
        "We detected your account being used from another location and signed you out everywhere. Please sign in again.",
    };
  }
  if (reason === 'account_deleted') {
    return {
      title: 'Account notice',
      message: 'Your account has been deleted. Contact support if you need to restore it.',
    };
  }
  return null;
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent(): React.JSX.Element {
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
          onDone={() => {
            // S7 reveal 의 "홈으로". 본 sub-task 부터 bio-profile POST 완료 시점.
            setScreen('authenticated');
          }}
          onClose={() => {
            setScreen('authenticated');
          }}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (screen === 'paywall') {
    return (
      <>
        <PaywallScreen
          onClose={() => {
            // PurchaseResult 는 향후 tier-aware navigation 에서 활용 — 본 sub-task 는
            // ClaimsFeed 복귀까지만. CHORE-MOBILE-PAYWALL-EXIT-001 백로그.
            setScreen('authenticated');
          }}
        />
        <StatusBar style="auto" />
      </>
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
        onUpgradePress={() => {
          setScreen('paywall');
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
});
