// Settings tab — Account / Subscription / Legal / Sign out.
// Account deletion (Apple Guideline 5.1.1(v) 필수) 도 본 화면 안에서.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SettingsScreen } from '../screens/SettingsScreen';
import type { SettingsStackParamList, SettingsStackScreenProps } from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

function SettingsRoute({
  navigation: _navigation,
}: SettingsStackScreenProps<'Settings'>): React.JSX.Element {
  return <SettingsScreen />;
}

export function SettingsNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsRoute} />
    </Stack.Navigator>
  );
}
