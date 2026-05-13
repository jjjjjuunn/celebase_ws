// React Navigation 의 route param 타입 정의.
//
// Topology:
//   Root (Stack)
//     ├── Auth (Stack) — 비로그인 상태
//     │     ├── Login
//     │     └── Signup
//     └── Main (Tabs) — 로그인 상태
//           ├── DiscoverTab (Stack)
//           │     ├── ClaimsFeed
//           │     ├── ClaimDetail
//           │     └── CelebrityDetail
//           ├── PlanTab (Stack)
//           │     └── MealPlan
//           ├── ProfileTab (Stack)
//           │     └── Profile
//           └── SettingsTab (Stack)
//                 └── Settings
//     └── Modal screens (presentation: 'modal')
//           ├── Onboarding
//           └── Paywall

import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// ── Auth stack ─────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

// ── Discover stack (claims feed + detail + celeb detail) ────
export type DiscoverStackParamList = {
  ClaimsFeed: undefined;
  ClaimDetail: { claimId: string };
  CelebrityDetail: { slug: string };
};

// ── Plan / Profile / Settings stacks (single screen each for now) ────
export type PlanStackParamList = {
  MealPlan: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};

// ── Main tabs ───────────────────────────────────────────────
export type MainTabsParamList = {
  Discover: NavigatorScreenParams<DiscoverStackParamList>;
  Plan: NavigatorScreenParams<PlanStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

// ── Root stack (Auth | Main | Modals) ───────────────────────
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabsParamList>;
  Onboarding: undefined;
  Paywall: undefined;
};

// ── Screen prop helpers ─────────────────────────────────────
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<AuthStackParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

export type DiscoverStackScreenProps<T extends keyof DiscoverStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<DiscoverStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<MainTabsParamList, 'Discover'>,
      RootStackScreenProps<keyof RootStackParamList>
    >
  >;

export type PlanStackScreenProps<T extends keyof PlanStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<PlanStackParamList, T>,
    BottomTabScreenProps<MainTabsParamList, 'Plan'>
  >;

export type ProfileStackScreenProps<T extends keyof ProfileStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ProfileStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<MainTabsParamList, 'ProfileTab'>,
      RootStackScreenProps<keyof RootStackParamList>
    >
  >;

export type SettingsStackScreenProps<T extends keyof SettingsStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<SettingsStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<MainTabsParamList, 'SettingsTab'>,
      RootStackScreenProps<keyof RootStackParamList>
    >
  >;
