// Celebrities tab 의 inner stack — CelebritiesGrid (root) → CelebrityDetail → ClaimDetail.
// (PIVOT 이전 DiscoverNavigator 의 ClaimsFeed root 를 셀럽 그리드로 교체.)

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CelebritiesScreen } from '../screens/CelebritiesScreen';
import { CelebrityDetailScreen } from '../screens/CelebrityDetailScreen';
import { ClaimDetailScreen } from '../screens/ClaimDetailScreen';
import type {
  CelebritiesStackParamList,
  CelebritiesStackScreenProps,
} from './types';

const Stack = createNativeStackNavigator<CelebritiesStackParamList>();

function CelebritiesGridRoute({
  navigation,
}: CelebritiesStackScreenProps<'CelebritiesGrid'>): React.JSX.Element {
  return (
    <CelebritiesScreen
      onCelebPress={(slug) => {
        navigation.navigate('CelebrityDetail', { slug });
      }}
    />
  );
}

function CelebrityDetailRoute({
  navigation,
  route,
}: CelebritiesStackScreenProps<'CelebrityDetail'>): React.JSX.Element {
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

function ClaimDetailRoute({
  navigation,
  route,
}: CelebritiesStackScreenProps<'ClaimDetail'>): React.JSX.Element {
  return (
    <ClaimDetailScreen
      claimId={route.params.claimId}
      onBack={() => {
        navigation.goBack();
      }}
    />
  );
}

export function CelebritiesNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CelebritiesGrid" component={CelebritiesGridRoute} />
      <Stack.Screen name="CelebrityDetail" component={CelebrityDetailRoute} />
      <Stack.Screen name="ClaimDetail" component={ClaimDetailRoute} />
    </Stack.Navigator>
  );
}
