// Auth stack — 비로그인 상태에서만 활성. Login ↔ Signup 전환.
// 두 screen 의 onSuccess 는 RootStack 의 logoutHandler 가 처리 (auth-events 신호).

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import type { AuthStackParamList, AuthStackScreenProps } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

function LoginRoute({ navigation }: AuthStackScreenProps<'Login'>): React.JSX.Element {
  return (
    <LoginScreen
      // onSuccess: 토큰이 SecureStore 에 저장된 직후 호출. RootStack 이 SecureStore 변화를
      // 감지하지 못하므로 (passive), 명시적으로 'Main' 으로 replace.
      onSuccess={() => {
        navigation.getParent()?.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
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
        navigation.getParent()?.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
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
