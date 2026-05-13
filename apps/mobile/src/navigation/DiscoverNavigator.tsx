// Discover tab 의 inner stack — ClaimsFeed (root) → ClaimDetail / CelebrityDetail.

import { useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import { ClaimsFeedScreen } from '../screens/ClaimsFeedScreen';
import { ClaimDetailScreen } from '../screens/ClaimDetailScreen';
import { CelebrityDetailScreen } from '../screens/CelebrityDetailScreen';
import type {
  DiscoverStackParamList,
  DiscoverStackScreenProps,
  RootStackParamList,
} from './types';

const Stack = createNativeStackNavigator<DiscoverStackParamList>();

function ClaimsFeedRoute({
  navigation,
}: DiscoverStackScreenProps<'ClaimsFeed'>): React.JSX.Element {
  // Root stack 의 modal (Onboarding/Paywall) navigate 는 root nav 객체로 직접.
  // CompositeScreenProps 의 getParent() 체이닝 보다 가독성 + 타입 안전성 ↑.
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ClaimsFeedScreen
      onClaimPress={(claimId) => {
        navigation.navigate('ClaimDetail', { claimId });
      }}
      onOnboardingPress={() => {
        rootNav.navigate('Onboarding');
      }}
      onUpgradePress={() => {
        rootNav.navigate('Paywall');
      }}
    />
  );
}

function ClaimDetailRoute({
  navigation,
  route,
}: DiscoverStackScreenProps<'ClaimDetail'>): React.JSX.Element {
  return (
    <ClaimDetailScreen
      claimId={route.params.claimId}
      onBack={() => {
        navigation.goBack();
      }}
    />
  );
}

function CelebrityDetailRoute({
  navigation,
  route,
}: DiscoverStackScreenProps<'CelebrityDetail'>): React.JSX.Element {
  return (
    <CelebrityDetailScreen
      slug={route.params.slug}
      onBack={() => {
        navigation.goBack();
      }}
      onClaimPress={(claimId) => {
        navigation.navigate('ClaimDetail', { claimId });
      }}
    />
  );
}

export function DiscoverNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClaimsFeed" component={ClaimsFeedRoute} />
      <Stack.Screen name="ClaimDetail" component={ClaimDetailRoute} />
      <Stack.Screen name="CelebrityDetail" component={CelebrityDetailRoute} />
    </Stack.Navigator>
  );
}
