// Main 4-tab bottom navigator — 로그인 후 진입.
//   - Celebrities: 셀럽 그리드 + 셀럽/claim 디테일
//   - Plan: 식단 (Meal Plan)
//   - News: 아티클 피드
//   - SettingsTab: account/subscription/legal (+ 사용자 프로필 병합 예정)
//
// 사용자 스펙 (2026-05-24): 하단 4탭 — 좌→우 Celebrities / Meal Plan / News / Settings.
// (2026-05-14 원안의 "Meal & Routine" → routine 미노출 결정으로 "Meal Plan" 으로 변경)

import { useMemo, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useIsGuest } from '../lib/guest-mode';
import { useTheme, type Theme } from '../ui';
import { CelebritiesNavigator } from './CelebritiesNavigator';
import { NewsNavigator } from './NewsNavigator';
import { PlanNavigator } from './PlanNavigator';
import { SettingsNavigator } from './SettingsNavigator';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_LABELS = {
  Celebrities: 'Celebrities',
  Plan: 'Meal Plan',
  News: 'News',
  SettingsTab: 'Settings',
} as const;

// Ionicons outline line-icons (thin, Lucide-adjacent) replace the placeholder
// emoji. Font-based (@expo/vector-icons) → loaded at runtime, no native rebuild.
type IoniconName = ComponentProps<typeof Ionicons>['name'];
const TAB_ICONS: Record<keyof typeof TAB_LABELS, IoniconName> = {
  Celebrities: 'star-outline',
  Plan: 'restaurant-outline',
  News: 'newspaper-outline',
  SettingsTab: 'settings-outline',
};

function tabIcon(name: keyof typeof TAB_LABELS, color: string, size: number): React.JSX.Element {
  return <Ionicons name={TAB_ICONS[name]} size={size} color={color} />;
}

export function MainTabsNavigator(): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // 게스트: News 홈 + Celebrities/News 2탭만(Plan/Settings 는 protected → boot-kick 회피).
  // authed: 기존 4탭 + Celebrities 기본(로그인 후 News 로 dump 방지; News-first 는 fast-follow).
  const isGuest = useIsGuest();

  return (
    <Tab.Navigator
      initialRouteName={isGuest ? 'News' : 'Celebrities'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tab.Screen
        name="Celebrities"
        component={CelebritiesNavigator}
        options={{
          tabBarLabel: TAB_LABELS.Celebrities,
          tabBarIcon: ({ color, size }) => tabIcon('Celebrities', color, size),
        }}
      />
      {!isGuest ? (
        <Tab.Screen
          name="Plan"
          component={PlanNavigator}
          options={{
            tabBarLabel: TAB_LABELS.Plan,
            tabBarIcon: ({ color, size }) => tabIcon('Plan', color, size),
          }}
        />
      ) : null}
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
    label: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold },
  });
}
