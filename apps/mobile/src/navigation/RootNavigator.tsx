// Root stack — 인증 상태에 따라 Auth | Main 토글 + Modal 화면 (Onboarding/Paywall).

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { resolveToken } from '../lib/tokens';
import { onLogoutSignal, type LogoutReason } from '../lib/auth-events';
import { bootstrapSession } from '../services/auth-bootstrap';
import { AuthNavigator } from './AuthNavigator';
import { MainTabsNavigator } from './MainTabsNavigator';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { PaywallScreen } from '../screens/PaywallScreen';
import type { RootStackParamList, RootStackScreenProps } from './types';
import { useRef } from 'react';

const Stack = createNativeStackNavigator<RootStackParamList>();

// 사용자에게 logout 사유를 알리는 두 케이스만 Alert.
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

function OnboardingRoute({
  navigation,
}: RootStackScreenProps<'Onboarding'>): React.JSX.Element {
  return (
    <OnboardingFlow
      onDone={() => {
        navigation.goBack();
      }}
      onClose={() => {
        navigation.goBack();
      }}
    />
  );
}

function PaywallRoute({
  navigation,
}: RootStackScreenProps<'Paywall'>): React.JSX.Element {
  return (
    <PaywallScreen
      onClose={() => {
        navigation.goBack();
      }}
    />
  );
}

export function RootNavigator(): React.JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'auth' | 'main'>('loading');
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    let cancelled = false;

    void bootstrapSession().then((result) => {
      if (cancelled) return;
      setPhase(result === 'authenticated' ? 'main' : 'auth');
    });

    const off = onLogoutSignal((reason) => {
      const message = describeLogout(reason);
      if (message !== null) {
        Alert.alert(message.title, message.message);
      }
      setPhase('auth');
    });

    return (): void => {
      cancelled = true;
      off();
    };
  }, []);

  if (phase === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {phase === 'main' ? (
          <Stack.Screen name="Main" component={MainTabsNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
        <Stack.Screen
          name="Onboarding"
          component={OnboardingRoute}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="Paywall"
          component={PaywallRoute}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
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
