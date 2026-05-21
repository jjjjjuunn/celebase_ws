// Plan tab — 셀럽 inspired meal plan 표시 + 크레딧 기반 생성.

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import { MealPlanScreen } from '../screens/MealPlanScreen';
import type { PlanStackParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<PlanStackParamList>();

// MealPlan 화면을 root 모달(Onboarding/Paywall) 네비게이션 + focus refresh 로 감싼다.
// 화면 자체는 nav 비의존(테스트 용이) — 콜백 주입 + reloadKey prop 으로 통신.
function MealPlanRoute(): React.JSX.Element {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reloadKey, setReloadKey] = useState(0);
  const firstFocus = useRef(true);

  // Paywall/Onboarding 모달에서 돌아오면 credits/plans 를 재fetch — 결제 직후
  // stale "업그레이드" CTA 가 남는 것을 막는다. 최초 focus 는 mount fetch 와 중복이라 skip.
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
      onNavigateOnboarding={() => {
        rootNav.navigate('Onboarding');
      }}
      onNavigatePaywall={() => {
        rootNav.navigate('Paywall');
      }}
    />
  );
}

export function PlanNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MealPlan" component={MealPlanRoute} />
    </Stack.Navigator>
  );
}
