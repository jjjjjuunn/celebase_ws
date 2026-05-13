// Profile tab — 사용자 본인 정보 + bio-profile + subscription tier badge.

import { useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import { ProfileScreen } from '../screens/ProfileScreen';
import type { ProfileStackParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileRoute(): React.JSX.Element {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ProfileScreen
      onEditBioProfile={() => {
        rootNav.navigate('Onboarding');
      }}
      onUpgradePress={() => {
        rootNav.navigate('Paywall');
      }}
    />
  );
}

export function ProfileNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileRoute} />
    </Stack.Navigator>
  );
}
