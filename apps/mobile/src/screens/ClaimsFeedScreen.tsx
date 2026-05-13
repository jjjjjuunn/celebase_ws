// Wellness claims feed — mobile 의 첫 콘텐츠 화면.
// spec.md §7.2 Tab 1 Discover. cursor pagination + 카테고리 필터.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';
import type { ClaimType, schemas } from '@celebbase/shared-types';

import { ClaimCard } from '../components/ClaimCard';
import { CategoryTabs, type CategoryFilter } from '../components/CategoryTabs';
import { px, resolveToken } from '../lib/tokens';
import { listClaims } from '../services/claims';
import { isClaimLocked, useCurrentTier } from '../lib/use-current-tier';

interface ClaimsFeedScreenProps {
  onClaimPress: (id: string) => void;
  /** 우상단 "프로필 입력" 진입 — bio-profile 미입력 사용자용. */
  onOnboardingPress?: () => void;
  /** 우상단 "Upgrade" 진입 — M5 paywall. tier-gated content lock 시 진입점. */
  onUpgradePress?: () => void;
}

type FeedState = {
  claims: schemas.LifestyleClaimWire[];
  nextCursor: string | null;
  hasNext: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

const INITIAL_STATE: FeedState = {
  claims: [],
  nextCursor: null,
  hasNext: false,
  loading: true,
  loadingMore: false,
  error: null,
};

export function ClaimsFeedScreen({
  onClaimPress,
  onOnboardingPress,
  onUpgradePress,
}: ClaimsFeedScreenProps): React.JSX.Element {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [state, setState] = useState<FeedState>(INITIAL_STATE);
  const { tier } = useCurrentTier();

  // 카테고리 변경 / 첫 mount 시 list reset + 첫 페이지 fetch.
  useEffect(() => {
    let cancelled = false;
    setState({ ...INITIAL_STATE, loading: true });

    const claimType = filter === 'all' ? undefined : filter;
    listClaims(claimType !== undefined ? { claimType } : {})
      .then((res) => {
        if (cancelled) return;
        setState({
          claims: res.claims,
          nextCursor: res.next_cursor,
          hasNext: res.has_next,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown';
        setState({ ...INITIAL_STATE, loading: false, error: message });
      });

    return (): void => {
      cancelled = true;
    };
  }, [filter]);

  const loadMore = useCallback((): void => {
    setState((prev) => {
      if (prev.loadingMore || !prev.hasNext || prev.nextCursor === null) return prev;
      return { ...prev, loadingMore: true };
    });

    const claimType = filter === 'all' ? undefined : filter;
    const cursor = state.nextCursor;
    if (cursor === null) return;

    const params: { claimType?: ClaimType; cursor?: string } = { cursor };
    if (claimType !== undefined) params.claimType = claimType;

    listClaims(params)
      .then((res) => {
        setState((prev) => ({
          claims: [...prev.claims, ...res.claims],
          nextCursor: res.next_cursor,
          hasNext: res.has_next,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'unknown';
        setState((prev) => ({ ...prev, loadingMore: false, error: message }));
      });
  }, [filter, state.nextCursor]);

  const retry = useCallback((): void => {
    setFilter((prev) => prev);
    // filter 가 그대로면 useEffect 가 재실행되지 않으므로 직접 trigger.
    setState({ ...INITIAL_STATE, loading: true });
    const claimType = filter === 'all' ? undefined : filter;
    listClaims(claimType !== undefined ? { claimType } : {})
      .then((res) => {
        setState({
          claims: res.claims,
          nextCursor: res.next_cursor,
          hasNext: res.has_next,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'unknown';
        setState({ ...INITIAL_STATE, loading: false, error: message });
      });
  }, [filter]);

  return (
    <SafeAreaView style={styles.container}>
      {onOnboardingPress !== undefined || onUpgradePress !== undefined ? (
        <View style={styles.topBar}>
          {onOnboardingPress !== undefined ? (
            <TouchableOpacity
              onPress={onOnboardingPress}
              accessibilityRole="button"
              accessibilityLabel="Set up profile"
              testID="claims-onboarding-cta"
              style={styles.onboardingLink}
            >
              <Text style={styles.onboardingLinkText}>📋 Set up your profile</Text>
            </TouchableOpacity>
          ) : null}
          {onUpgradePress !== undefined ? (
            <TouchableOpacity
              onPress={onUpgradePress}
              accessibilityRole="button"
              accessibilityLabel="Upgrade"
              testID="claims-upgrade"
              style={styles.upgradeLink}
            >
              <Text style={styles.upgradeLinkText}>⭐ Upgrade</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <CategoryTabs selected={filter} onSelect={setFilter} />
      {state.loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        </View>
      ) : state.error !== null ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load claims.</Text>
          <TouchableOpacity onPress={retry} style={styles.retryButton} accessibilityRole="button">
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : state.claims.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No claims yet.</Text>
        </View>
      ) : (
        <FlatList
          data={state.claims}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const locked = isClaimLocked(item.trust_grade, tier);
            return (
              <ClaimCard
                claim={item}
                locked={locked}
                onPress={(id) => {
                  if (locked && onUpgradePress !== undefined) {
                    onUpgradePress();
                    return;
                  }
                  onClaimPress(id);
                }}
              />
            );
          }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            state.loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={resolveToken('light', '--cb-color-brand')} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingTop: px(tokens.light['--cb-space-2']),
  },
  onboardingLink: {
    paddingVertical: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-3']),
  },
  onboardingLinkText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '600',
  },
  upgradeLink: {
    paddingVertical: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-3']),
  },
  upgradeLinkText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-3']),
  },
  emptyText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
  },
  retryButton: {
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
    borderRadius: 8,
  },
  retryButtonText: {
    color: resolveToken('light', '--cb-color-on-brand'),
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
  },
  footer: {
    padding: px(tokens.light['--cb-space-4']),
  },
});
