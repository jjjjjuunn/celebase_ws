// Plan tab — 셀럽 inspired meal plan 표시.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MealPlanScreen } from '../screens/MealPlanScreen';
import type { PlanStackParamList } from './types';

const Stack = createNativeStackNavigator<PlanStackParamList>();

export function PlanNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MealPlan" component={MealPlanScreen} />
    </Stack.Navigator>
  );
}
