// Main 4-tab bottom navigator — 로그인 후 진입.
//   - Celebrities: 셀럽 그리드 + 셀럽/claim 디테일
//   - Plan: 식단 및 루틴 (Meal & Routine)
//   - News: 아티클 피드
//   - SettingsTab: account/subscription/legal (+ 사용자 프로필 병합 예정)
//
// 사용자 스펙 (2026-05-14): 하단 4탭 — 좌→우 Celebrities / Meal & Routine / News / Settings.

import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';
import { CelebritiesNavigator } from './CelebritiesNavigator';
import { NewsNavigator } from './NewsNavigator';
import { PlanNavigator } from './PlanNavigator';
import { SettingsNavigator } from './SettingsNavigator';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

// Emoji icons — 디자인 시스템 정식 아이콘 도입 전 임시.
// CHORE-MOBILE-TAB-ICONS-001 백로그: SVG icon set 으로 교체.
const TAB_ICONS = {
  Celebrities: '⭐',
  Plan: '🥗',
  News: '📰',
  SettingsTab: '⚙️',
} as const;

const TAB_LABELS = {
  Celebrities: 'Celebrities',
  Plan: 'Meal & Routine',
  News: 'News',
  SettingsTab: 'Settings',
} as const;

function tabIcon(name: keyof typeof TAB_ICONS, focused: boolean) {
  return (
    <Text style={[styles.icon, focused ? styles.iconFocused : null]}>
      {TAB_ICONS[name]}
    </Text>
  );
}

export function MainTabsNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: resolveToken('light', '--cb-color-brand'),
        tabBarInactiveTintColor: resolveToken('light', '--cb-color-text-muted'),
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tab.Screen
        name="Celebrities"
        component={CelebritiesNavigator}
        options={{
          tabBarLabel: TAB_LABELS.Celebrities,
          tabBarIcon: ({ focused }) => tabIcon('Celebrities', focused),
        }}
      />
      <Tab.Screen
        name="Plan"
        component={PlanNavigator}
        options={{
          tabBarLabel: TAB_LABELS.Plan,
          tabBarIcon: ({ focused }) => tabIcon('Plan', focused),
        }}
      />
      <Tab.Screen
        name="News"
        component={NewsNavigator}
        options={{
          tabBarLabel: TAB_LABELS.News,
          tabBarIcon: ({ focused }) => tabIcon('News', focused),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsNavigator}
        options={{
          tabBarLabel: TAB_LABELS.SettingsTab,
          tabBarIcon: ({ focused }) => tabIcon('SettingsTab', focused),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderTopColor: resolveToken('light', '--cb-color-border'),
  },
  label: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '600',
  },
  icon: {
    fontSize: 20,
    opacity: 0.6,
  },
  iconFocused: {
    opacity: 1,
  },
});
