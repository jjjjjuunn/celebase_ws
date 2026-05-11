import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { configureCognito } from './src/lib/cognito';
import { LoginScreen } from './src/screens/LoginScreen';
import { px, resolveToken } from './src/lib/tokens';

// Amplify v6 의 Cognito User Pool 설정을 module load 시점에 1회 적용한다.
// signIn / signUp 호출 전에 반드시 configure 되어 있어야 한다.
configureCognito();

export default function App(): React.JSX.Element {
  // 초기 진입 시 LoginScreen. 로그인 성공 → authenticated=true 로 home view.
  // 앱 재시작 시 SecureStore 토큰 검증으로 자동 진입은 M2 영역 (auto-login).
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return (
      <>
        <LoginScreen
          onSuccess={() => {
            setAuthenticated(true);
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
