// App entry — React Navigation root. SafeAreaProvider 로 wrap + Amplify/RevenueCat
// configure 를 module load 시점에 1회.
//
// Navigation topology 는 src/navigation/RootNavigator.tsx 참조.

import 'react-native-gesture-handler'; // RN gesture handler 는 모든 navigation import 이전 1회 필요.

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configureCognito } from './src/lib/cognito';
import { configureRevenueCat } from './src/lib/revenuecat';
import { RootNavigator } from './src/navigation/RootNavigator';

// Amplify v6 의 Cognito User Pool 설정을 module load 시점에 1회 적용한다.
// signIn / signUp 호출 전에 반드시 configure 되어 있어야 한다.
configureCognito();
// RevenueCat SDK — IAP 호출 전에 configure 되어야 한다. DEV 에서 API key 부재 시
// silent skip (UI 둘러보기 전용 — purchase 호출 시점에 native module 부재로 throw).
configureRevenueCat();

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
