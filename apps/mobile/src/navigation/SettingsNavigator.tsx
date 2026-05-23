// Settings tab — Account / Subscription / Legal / Sign out.
// Account deletion (Apple Guideline 5.1.1(v) 필수) 도 본 화면 안에서.

import { useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import { SettingsScreen } from '../screens/SettingsScreen';
import type { RootStackParamList, SettingsStackParamList } from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

// SettingsScreen 은 nav 비의존(테스트 용이) — root 모달(Onboarding) navigate 는
// 콜백으로 주입. PlanNavigator 의 onNavigateOnboarding 패턴과 동일.
function SettingsRoute(): React.JSX.Element {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <SettingsScreen
      onReplayOnboarding={() => {
        rootNav.navigate('Onboarding');
      }}
    />
  );
}

export function SettingsNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsRoute} />
    </Stack.Navigator>
  );
}
