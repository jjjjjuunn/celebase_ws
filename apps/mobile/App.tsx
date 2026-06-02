// App entry — React Navigation root. SafeAreaProvider 로 wrap + Amplify/RevenueCat
// configure 를 module load 시점에 1회.
//
// Navigation topology 는 src/navigation/RootNavigator.tsx 참조.

import 'react-native-gesture-handler'; // RN gesture handler 는 모든 navigation import 이전 1회 필요.

import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
// News/카드뉴스 브랜드 폰트 (News-scoped) — Design Canvas card-system 과 일치.
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk';
import { SplineSansMono_600SemiBold } from '@expo-google-fonts/spline-sans-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configureCognito } from './src/lib/cognito';
import { configureRevenueCat } from './src/lib/revenuecat';
import { initSentry } from './src/lib/sentry';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/ui';

// Sentry 를 가장 먼저 init — 이후 configure / 렌더 단계의 에러도 포착한다.
// DSN 미설정 시 no-op (fail-open). PHI/PII 는 beforeSend 에서 스크러빙.
initSentry();
// Amplify v6 의 Cognito User Pool 설정을 module load 시점에 1회 적용한다.
// signIn / signUp 호출 전에 반드시 configure 되어 있어야 한다.
configureCognito();
// RevenueCat SDK — IAP 호출 전에 configure 되어야 한다. DEV 에서 API key 부재 시
// silent skip (UI 둘러보기 전용 — purchase 호출 시점에 native module 부재로 throw).
// EXPO_PUBLIC_DEMO_MODE=true 빌드 (e.g. 발표 데모 standalone — IAP 미사용 + 키
// 미발급) 는 configure 호출 자체를 스킵해 Release 부팅 시 throw → 흰 화면 방지.
// 일반 빌드(env 미설정) 는 그대로 configure — main-safe.
if (process.env['EXPO_PUBLIC_DEMO_MODE'] !== 'true') {
  configureRevenueCat();
}

export default function App(): React.JSX.Element {
  // Non-blocking font load: register design-token font families (Fraunces serif
  // display, Plus Jakarta Sans body, JetBrains Mono numerals) under their bare
  // names so theme styles (fontFamily: 'Fraunces' / 'Plus Jakarta Sans' /
  // 'JetBrains Mono') resolve once loaded. We render immediately with the
  // system-font fallback and swap in on success — if the native module is
  // unavailable the catch keeps the app on system fonts (no crash).
  const [, setFontsReady] = useState(false);
  useEffect(() => {
    Font.loadAsync({
      Fraunces: Fraunces_600SemiBold,
      'Plus Jakarta Sans': PlusJakartaSans_500Medium,
      'JetBrains Mono': JetBrainsMono_600SemiBold,
      // News-scoped 브랜드 폰트 (theme.news.font 이 이 bare name 으로 참조).
      'Hanken Grotesk': HankenGrotesk_500Medium,
      'Spline Sans Mono': SplineSansMono_600SemiBold,
    })
      .then(() => {
        setFontsReady(true);
      })
      .catch(() => {
        // Keep system-font fallback — never block the UI on font loading.
      });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
