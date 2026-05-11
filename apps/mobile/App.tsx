import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { configureCognito } from './src/lib/cognito';
import { LoginScreen } from './src/screens/LoginScreen';
import { SignupScreen } from './src/screens/SignupScreen';
import { px, resolveToken } from './src/lib/tokens';

// Amplify v6 의 Cognito User Pool 설정을 module load 시점에 1회 적용한다.
// signIn / signUp 호출 전에 반드시 configure 되어 있어야 한다.
configureCognito();

type Screen = 'login' | 'signup' | 'authenticated';

export default function App(): React.JSX.Element {
  // 초기 진입 시 LoginScreen. signUp 흐름은 '계정 만들기' 링크로 진입.
  // 앱 재시작 시 SecureStore 토큰 검증으로 자동 진입은 M2 영역 (auto-login).
  const [screen, setScreen] = useState<Screen>('login');

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CelebBase</Text>
      <Text style={styles.subtitle}>건강한 일상을 위한 웰니스 플랫폼</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
    marginBottom: px(tokens.light['--cb-space-3']),
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
});
