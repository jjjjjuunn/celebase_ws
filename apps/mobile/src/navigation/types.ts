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
//           ├── Selection   — post-signup path picker (personalized | trend-only)
//           ├── Onboarding
//           └── Paywall

import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// ── Auth stack ─────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

// ── Discover stack (claims feed + detail + celeb detail) ────
// LEGACY — PIVOT 으로 Celebrities stack 으로 대체됨. DiscoverNavigator orphan 정리 시 제거.
export type DiscoverStackParamList = {
  ClaimsFeed: undefined;
  ClaimDetail: { claimId: string };
  CelebrityDetail: { slug: string };
};

// ── Celebrities stack (celeb grid → celeb detail → claim detail) ────
export type CelebritiesStackParamList = {
  CelebritiesGrid: undefined;
  CelebrityDetail: { slug: string };
  ClaimDetail: { claimId: string };
};

// ── News stack (claim feed → claim detail) ──────────────────
// News-first 퍼널: 실 lifestyle_claims 피드(NewsFeed) → ClaimDetail("Eat like this celebrity" CTA).
export type NewsStackParamList = {
  NewsFeed: undefined;
  ClaimDetail: { claimId: string };
};

// ── Plan / Profile / Settings stacks (single screen each for now) ────
export type PlanStackParamList = {
  MealPlan: undefined;
  RecipeDetail: { recipeId: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
  EditProfile: undefined;
};

// ── Main tabs ───────────────────────────────────────────────
// News-first (IMPL-MOBILE-NEWS-NAV-ABSORB-001): 표시 탭 = News + SettingsTab(authed).
// Plan 은 등록·숨김(News 헤더 "My Plan" / ClaimDetail 게이트로 진입). 게스트는 News 단독.
// Celebrities / Discover / ProfileTab 은 orphan navigator 의 타입 호환 유지용 — 정리 시 제거.
export type MainTabsParamList = {
  Celebrities: NavigatorScreenParams<CelebritiesStackParamList>;
  Plan: NavigatorScreenParams<PlanStackParamList>;
  News: NavigatorScreenParams<NewsStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
  Discover: NavigatorScreenParams<DiscoverStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

// ── Root stack (Auth | Main | Modals) ───────────────────────
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabsParamList>;
  Selection: undefined;
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

export type CelebritiesStackScreenProps<T extends keyof CelebritiesStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<CelebritiesStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<MainTabsParamList, 'Celebrities'>,
      RootStackScreenProps<keyof RootStackParamList>
    >
  >;

export type NewsStackScreenProps<T extends keyof NewsStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<NewsStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<MainTabsParamList, 'News'>,
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
