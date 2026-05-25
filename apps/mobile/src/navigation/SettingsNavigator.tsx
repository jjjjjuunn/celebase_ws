// Settings tab — Account / Subscription / Legal / Sign out, plus the
// EditProfile push (FEAT-PROFILE-EDIT). Account deletion (Apple Guideline
// 5.1.1(v)) lives inside SettingsScreen.

import { useIsFocused, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SettingsScreen } from '../screens/SettingsScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import type { SettingsStackParamList, SettingsStackScreenProps } from './types';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

// SettingsScreen 은 nav 비의존(테스트 용이) — root 모달(Onboarding) + EditProfile
// navigate 는 콜백으로 주입. The composite nav type covers both the settings
// stack (EditProfile) and root (Onboarding).
function SettingsRoute(): React.JSX.Element {
  const nav = useNavigation<SettingsStackScreenProps<'Settings'>['navigation']>();
  // EditProfile 저장 후 goBack 하면 본 화면이 다시 포커스된다. 네이티브 스택은
  // 화면을 언마운트하지 않으므로, 포커스 상태를 주입해 SettingsScreen 이 최신
  // 프로필(이름/사진)을 재조회하도록 한다.
  const isFocused = useIsFocused();
  return (
    <SettingsScreen
      isFocused={isFocused}
      onEditProfile={() => {
        nav.navigate('EditProfile');
      }}
      onReplayOnboarding={() => {
        nav.navigate('Onboarding');
      }}
    />
  );
}

function EditProfileRoute(): React.JSX.Element {
  const nav = useNavigation<SettingsStackScreenProps<'EditProfile'>['navigation']>();
  return (
    <EditProfileScreen
      onDone={() => {
        nav.goBack();
      }}
    />
  );
}

export function SettingsNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsRoute} />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileRoute}
        options={{ headerShown: true, title: 'Edit profile' }}
      />
    </Stack.Navigator>
  );
}
