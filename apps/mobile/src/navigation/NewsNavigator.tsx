// News tab 의 inner stack — NewsFeed (root). 아티클 상세는 후속 sub-task.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { NewsScreen } from '../screens/NewsScreen';
import type { NewsStackParamList } from './types';

const Stack = createNativeStackNavigator<NewsStackParamList>();

export function NewsNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NewsFeed" component={NewsScreen} />
    </Stack.Navigator>
  );
}
