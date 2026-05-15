// Auth stack — 비로그인 상태에서만 활성. Login ↔ Signup 전환.
// 두 screen 의 onSuccess 는 services/auth 의 signalLogin() → RootStack 의
// onLoginSignal 구독이 setPhase('main') 으로 화면 전환을 처리한다.
// (BUG-MOBILE-AUTH-LOGIN-SIGNAL: 이전엔 여기서 navigation.reset('Main') 호출했으나
// phase 미전환 상태에선 'Main' screen 이 navigator 에 등록 안 되어 거절됐다.)

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import type { AuthStackParamList, AuthStackScreenProps } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

function LoginRoute({ navigation }: AuthStackScreenProps<'Login'>): React.JSX.Element {
  return (
    <LoginScreen
      // onSuccess: signalLogin('manual') 은 services/auth.ts:signIn 내부에서 호출됨.
      // RootStack 의 onLoginSignal 구독이 setPhase('main') 으로 화면 전환.
      onSuccess={() => {
        // no-op — phase 전환은 signal 기반
      }}
      onSignupRequest={() => {
        navigation.navigate('Signup');
      }}
    />
  );
}

function SignupRoute({ navigation }: AuthStackScreenProps<'Signup'>): React.JSX.Element {
  return (
    <SignupScreen
      onSuccess={() => {
        // no-op — signalLogin('signup') 이 services/auth.ts:confirmSignUpAndLogin 에서
        // 호출되고 RootStack 의 onLoginSignal 구독이 화면 전환.
      }}
      onBackToLogin={() => {
        navigation.navigate('Login');
      }}
    />
  );
}

export function AuthNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginRoute} />
      <Stack.Screen name="Signup" component={SignupRoute} />
    </Stack.Navigator>
  );
}
