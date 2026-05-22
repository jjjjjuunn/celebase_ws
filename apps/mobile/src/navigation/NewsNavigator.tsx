// News tab 의 inner stack — NewsFeed (root) → NewsDetail (article body).

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { NewsScreen } from '../screens/NewsScreen';
import { NewsDetailScreen } from '../screens/NewsDetailScreen';
import type { NewsStackParamList, NewsStackScreenProps } from './types';

const Stack = createNativeStackNavigator<NewsStackParamList>();

function NewsFeedRoute({
  navigation,
}: NewsStackScreenProps<'NewsFeed'>): React.JSX.Element {
  return (
    <NewsScreen
      onArticlePress={(id) => {
        navigation.navigate('NewsDetail', { id });
      }}
    />
  );
}

function NewsDetailRoute({
  navigation,
  route,
}: NewsStackScreenProps<'NewsDetail'>): React.JSX.Element {
  return (
    <NewsDetailScreen
      id={route.params.id}
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
      <Stack.Screen name="NewsDetail" component={NewsDetailRoute} />
    </Stack.Navigator>
  );
}
