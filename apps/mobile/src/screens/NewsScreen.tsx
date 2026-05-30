// News 탭 root — 셀럽 wellness claim 피드 (News-first 퍼널 입구).
//
// 스펙 (사용자 2026-05-14): 카테고리는 Beauty / Diet / Wellness & Fitness.
// IMPL-MOBILE-NEWS-FEED-001: 실제 published `lifestyle_claims` 를 셀럽 attribution 과
// 함께 ClaimCard 로 렌더 → 카드 탭 시 ClaimDetail ("Eat like this celebrity" CTA).
// 데이터는 client-side join — listClaims() + listCelebrities() Map by celebrity_id.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ClaimType, schemas } from '@celebbase/shared-types';

import { ClaimCard } from '../components/ClaimCard';
import { signalLoginRequired } from '../lib/auth-events';
import { useIsGuest } from '../lib/guest-mode';
import { listClaims } from '../services/claims';
import { listCelebrities } from '../services/celebrities';
import { EmptyState, Text, useTheme, type Theme } from '../ui';

// News 카테고리 = claim_type 그룹. brand · philosophy 는 제외(undefined → 필터 아웃).
type NewsCategory = 'diet' | 'beauty' | 'wellness';

const NEWS_CATEGORIES: ReadonlyArray<{ key: NewsCategory; label: string }> = [
  { key: 'diet', label: 'Diet' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'wellness', label: 'Wellness' },
];

const CATEGORY_BY_CLAIM_TYPE: Partial<Record<ClaimType, NewsCategory>> = {
  food: 'diet',
  beauty: 'beauty',
  workout: 'wellness',
  sleep: 'wellness',
  supplement: 'wellness',
  // brand · philosophy 는 의도적으로 미매핑 → 피드에서 제외.
};

interface NewsScreenProps {
  /** 카드 탭 시 — ClaimDetail 로 이동. */
  onClaimPress: (claimId: string) => void;
}

// claim + (joined) celebrity + 매핑된 News 카테고리.
type EnrichedClaim = {
  claim: schemas.LifestyleClaimWire;
  category: NewsCategory;
  celebrity: schemas.CelebrityWire | undefined;
};

type FeedState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'loaded'; items: EnrichedClaim[] };

export function NewsScreen({ onClaimPress }: NewsScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isGuest = useIsGuest();
  const [category, setCategory] = useState<NewsCategory>('diet');
  const [state, setState] = useState<FeedState>({ phase: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  // mount(및 retry) 시 broad fetch — claim + celebrity 를 client-side join.
  // ⚠️ ceiling: limit:100 은 현 카탈로그(≤10 셀럽 / 50 claim)를 전량 cover. 카탈로그가
  //    100+ claim·celeb 으로 커지면 일부 attribution 누락 가능 → cursor 페이지네이션 fast-follow.
  // ⚠️ useCurrentTier 호출 금지 — 무토큰 게스트의 401→logout boot-kick 회피(News 는 무료 퍼널).
  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });

    Promise.all([
      listClaims({ limit: 100 }),
      // best-effort: 셀럽은 optional attribution — celeb fetch 실패가 무셀럽 카드 피드까지
      // error state 로 떨구면 안 됨(claims 실패만 error). (IMPL-MOBILE-TREND-CARD-CELEB-OPTIONAL-001)
      listCelebrities({ limit: 100 }).catch(() => ({
        items: [] as schemas.CelebrityWire[],
        next_cursor: null,
        has_next: false,
      })),
    ])
      .then(([claimsRes, celebsRes]) => {
        if (cancelled) return;
        const celebById = new Map(celebsRes.items.map((c) => [c.id, c]));
        const items: EnrichedClaim[] = [];
        for (const claim of claimsRes.claims) {
          const cat = CATEGORY_BY_CLAIM_TYPE[claim.claim_type];
          if (cat === undefined) continue; // brand · philosophy drop
          // celebrity_id 는 optional(셀럽 없는 트렌드 카드) — null 이면 attribution 없이 렌더.
          const celebrity =
            claim.celebrity_id !== null ? celebById.get(claim.celebrity_id) : undefined;
          items.push({ claim, category: cat, celebrity });
        }
        setState({ phase: 'loaded', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 메시지는 state 에 캡처(silent ignore 금지) — feed UX 는 generic 카피 + retry 로 회복.
        const message = err instanceof Error ? err.message : 'unknown';
        setState({ phase: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, [reloadKey]);

  const visible = useMemo(
    () => (state.phase === 'loaded' ? state.items.filter((e) => e.category === category) : []),
    [state, category],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text variant="h1">News</Text>
          <Text variant="bodySm" tone="muted">
            셀럽들의 웰니스를 한눈에.
          </Text>
        </View>
        {isGuest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={() => {
              signalLoginRequired();
            }}
            style={styles.signInBtn}
          >
            <Text variant="label" tone="brand">
              Sign in
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.categoryRow}>
        {NEWS_CATEGORIES.map((cat) => {
          const active = cat.key === category;
          return (
            <Pressable
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setCategory(cat.key);
              }}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <Text variant="label" tone={active ? 'onBrand' : 'muted'}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.color.brand} />
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title="Couldn't load news."
            ctaLabel="Try again"
            onPressCta={() => {
              setReloadKey((k) => k + 1);
            }}
          />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon="file-tray-outline"
            title="No stories yet."
            body="새 소식이 곧 추가됩니다."
          />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.claim.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ClaimCard
              claim={item.claim}
              onPress={onClaimPress}
              {...(item.celebrity !== undefined ? { celebrity: item.celebrity } : {})}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(3),
    },
    headerTextCol: { flex: 1, gap: theme.space(1) },
    signInBtn: { paddingVertical: theme.space(1), paddingHorizontal: theme.space(2) },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space(2),
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(3),
    },
    chip: {
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(2),
      borderRadius: theme.radius.pill,
    },
    chipActive: { backgroundColor: theme.color.brand },
    chipInactive: { backgroundColor: theme.color.surface },
    // ClaimCard 가 자체 marginHorizontal(space(4)) 을 가지므로 listContent 는 수직 여백만.
    listContent: { paddingVertical: theme.space(2), paddingBottom: theme.space(8) },
    centered: { flex: 1, justifyContent: 'center' },
  });
}
