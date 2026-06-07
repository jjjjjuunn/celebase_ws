// Plan tab — 셀럽 inspired meal plan 표시 + 크레딧 기반 생성.

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import { MealPlanScreen } from '../screens/MealPlanScreen';
import { RecipeDetailScreen } from '../screens/RecipeDetailScreen';
import type { PlanStackParamList, PlanStackScreenProps, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<PlanStackParamList>();

// MealPlan 화면을 root 모달(Onboarding) 네비게이션 + 탭/스택 네비 + focus refresh 로 감싼다.
// 화면 자체는 nav 비의존(테스트 용이) — 콜백 주입 + reloadKey/focusPlanId prop 으로 통신.
// 뉴스-우선: 생성·크레딧 게이트는 claim CTA 로 이동 → '+'/빈상태는 News 로 안내(onNavigateNews).
function MealPlanRoute({ route, navigation }: PlanStackScreenProps<'MealPlan'>): React.JSX.Element {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reloadKey, setReloadKey] = useState(0);
  const firstFocus = useRef(true);

  // Onboarding 모달에서 돌아오면 bio/credits/plans 를 재fetch. 최초 focus 는 mount fetch 와 중복이라 skip.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setReloadKey((k) => k + 1);
    }, []),
  );

  return (
    <MealPlanScreen
      reloadKey={reloadKey}
      focusPlanId={route.params?.focusPlanId}
      onNavigateOnboarding={() => {
        rootNav.navigate('Onboarding');
      }}
      onNavigateNews={() => {
        navigation.navigate('News', { screen: 'NewsFeed' });
      }}
      onNavigateRecipe={(recipeId) => {
        navigation.navigate('RecipeDetail', { recipeId });
      }}
    />
  );
}

// 끼니 탭 → recipe 상세. recipeId 를 route param 에서 꺼내 nav 비의존 화면에 주입.
function RecipeDetailRoute({
  route,
  navigation,
}: PlanStackScreenProps<'RecipeDetail'>): React.JSX.Element {
  return (
    <RecipeDetailScreen
      recipeId={route.params.recipeId}
      onBack={() => {
        navigation.goBack();
      }}
    />
  );
}

export function PlanNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MealPlan" component={MealPlanRoute} />
      <Stack.Screen name="RecipeDetail" component={RecipeDetailRoute} />
    </Stack.Navigator>
  );
}
