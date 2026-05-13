// Main 4-tab bottom navigator — 로그인 후 진입.
//   - Discover: claims feed + claim/celeb detail
//   - Plan: inspired meal plan
//   - ProfileTab: user profile
//   - SettingsTab: account/subscription/legal

import { StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';
import { DiscoverNavigator } from './DiscoverNavigator';
import { PlanNavigator } from './PlanNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import { SettingsNavigator } from './SettingsNavigator';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

// Emoji icons — 디자인 시스템 정식 아이콘 도입 전 임시.
// CHORE-MOBILE-TAB-ICONS-001 백로그: SVG icon set 으로 교체.
const TAB_ICONS = {
  Discover: '🔍',
  Plan: '🥗',
  ProfileTab: '👤',
  SettingsTab: '⚙️',
} as const;

const TAB_LABELS = {
  Discover: 'Discover',
  Plan: 'Plan',
  ProfileTab: 'Profile',
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
        name="Discover"
        component={DiscoverNavigator}
        options={{
          tabBarLabel: TAB_LABELS.Discover,
          tabBarIcon: ({ focused }) => tabIcon('Discover', focused),
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
        name="ProfileTab"
        component={ProfileNavigator}
        options={{
          tabBarLabel: TAB_LABELS.ProfileTab,
          tabBarIcon: ({ focused }) => tabIcon('ProfileTab', focused),
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
