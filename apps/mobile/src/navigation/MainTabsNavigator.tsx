// Main bottom navigator — News-first (IMPL-MOBILE-NEWS-NAV-ABSORB-001).
//   - News: 셀럽 wellness claim 피드 (게스트·authed 공통 홈)
//   - Plan: 식단 (Meal Plan) — 탭바에서 숨김(등록은 유지). News 헤더 "My Plan" 버튼 ·
//           ClaimDetail "Make my Plan" 게이트로만 진입. authed 전용(protected).
//   - SettingsTab: account/subscription/legal — authed 전용
//
// 흡수 결정 (사용자 2026-05-30): 단독 Celebrities 탭은 셀럽 attribution 이 News 피드에
// 이미 노출돼 중복 → 제거. Meal Plan 은 탭 대신 News 헤더 버튼으로 흡수(이용할 사람만).
//   - 게스트: News 단일 → 탭바 숨김(Plan/Settings 는 protected → boot-kick 회피).
//   - authed: News(표시) + SettingsTab(표시), Plan 은 등록·숨김.
// (legacy CelebritiesNavigator/screens 는 orphan 으로 잔존 — dead-code 정리는 후속 CHORE.)

import { useMemo, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useIsGuest } from '../lib/guest-mode';
import { useTheme, type Theme } from '../ui';
import { NewsNavigator } from './NewsNavigator';
import { PlanNavigator } from './PlanNavigator';
import { SettingsNavigator } from './SettingsNavigator';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_LABELS = {
  News: 'News',
  Plan: 'Meal Plan',
  SettingsTab: 'Settings',
} as const;

// Ionicons outline line-icons (thin, Lucide-adjacent). Font-based
// (@expo/vector-icons) → loaded at runtime, no native rebuild.
type IoniconName = ComponentProps<typeof Ionicons>['name'];
const TAB_ICONS: Record<keyof typeof TAB_LABELS, IoniconName> = {
  News: 'newspaper-outline',
  Plan: 'restaurant-outline',
  SettingsTab: 'settings-outline',
};

function tabIcon(name: keyof typeof TAB_LABELS, color: string, size: number): React.JSX.Element {
  return <Ionicons name={TAB_ICONS[name]} size={size} color={color} />;
}

export function MainTabsNavigator(): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // 게스트: News 단일 홈 → 탭바 숨김. authed: News + Settings(2탭 표시), Plan 은 숨김.
  const isGuest = useIsGuest();

  return (
    <Tab.Navigator
      initialRouteName="News"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.textMuted,
        // 게스트는 News 한 화면뿐 → 탭바 숨김(단일 탭 바 노출 방지).
        tabBarStyle: isGuest ? styles.tabBarHidden : styles.tabBar,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tab.Screen
        name="News"
        component={NewsNavigator}
        options={{
          tabBarLabel: TAB_LABELS.News,
          tabBarIcon: ({ color, size }) => tabIcon('News', color, size),
        }}
      />
      {!isGuest ? (
        <Tab.Screen
          name="Plan"
          component={PlanNavigator}
          options={({ route }) => {
            // RecipeDetail(몰입 step view)에서는 하단 탭바를 숨겨 전체화면 확보 → MealPlan 복귀 시 복원.
            const focused = getFocusedRouteNameFromRoute(route) ?? 'MealPlan';
            return {
              tabBarLabel: TAB_LABELS.Plan,
              tabBarIcon: ({ color, size }: { color: string; size: number }) => tabIcon('Plan', color, size),
              // 탭바 버튼 숨김 — News 헤더 "My Plan" / ClaimDetail 게이트로만 진입(등록 유지).
              // tabBarButton:()=>null 만으론 flex 슬롯이 남아 News/Settings 가 양 끝으로 벌어진다 →
              // tabBarItemStyle display:none 으로 슬롯을 layout 에서 제거해 2탭이 균등 분배되게 한다.
              tabBarButton: () => null,
              tabBarItemStyle: styles.tabItemHidden,
              tabBarStyle: focused === 'RecipeDetail' ? styles.tabBarHidden : styles.tabBar,
            };
          }}
        />
      ) : null}
      {!isGuest ? (
        <Tab.Screen
          name="SettingsTab"
          component={SettingsNavigator}
          options={{
            tabBarLabel: TAB_LABELS.SettingsTab,
            tabBarIcon: ({ color, size }) => tabIcon('SettingsTab', color, size),
          }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    tabBar: { backgroundColor: theme.color.surface, borderTopColor: theme.color.border },
    tabBarHidden: { display: 'none' },
    // 숨긴 Plan 탭 슬롯을 layout 에서 제거(빈 가운데 슬롯 → News/Settings 균등 분배).
    tabItemHidden: { display: 'none' },
    label: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold },
  });
}
