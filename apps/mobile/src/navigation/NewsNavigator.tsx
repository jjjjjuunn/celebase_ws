// News tab 의 inner stack — NewsFeed (claim 피드) → ClaimDetail (claim + "Eat like
// this celebrity" CTA). ClaimDetail 은 CelebritiesNavigator 와 동일 화면을 재사용한다.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { NewsScreen } from '../screens/NewsScreen';
import { ClaimDetailScreen } from '../screens/ClaimDetailScreen';
import type { NewsStackParamList, NewsStackScreenProps } from './types';

const Stack = createNativeStackNavigator<NewsStackParamList>();

function NewsFeedRoute({
  navigation,
}: NewsStackScreenProps<'NewsFeed'>): React.JSX.Element {
  return (
    <NewsScreen
      onClaimPress={(claimId) => {
        navigation.navigate('ClaimDetail', { claimId });
      }}
    />
  );
}

function ClaimDetailRoute({
  navigation,
  route,
}: NewsStackScreenProps<'ClaimDetail'>): React.JSX.Element {
  return (
    <ClaimDetailScreen
      claimId={route.params.claimId}
      onBack={() => {
        navigation.goBack();
      }}
    />
  );
}

export function NewsNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NewsFeed" component={NewsFeedRoute} />
      <Stack.Screen name="ClaimDetail" component={ClaimDetailRoute} />
    </Stack.Navigator>
  );
}
