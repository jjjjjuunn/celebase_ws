// News 탭 root — 아티클 피드 (디자인 ref: 4번 사진 / Medium-style feed).
//
// 스펙 (사용자 2026-05-14):
//   3.   뉴스는 4번 사진 참고.
//   3-1. 카테고리는 Beauty / Diet / Wellness & Fitness.
//
// 현재는 mock 아티클 — content-service 의 trend intelligence (spec.md) 연결 시 교체.
// content.md "자동 게시 금지: 편집팀 수동 승인 후에만 노출" — 실 연결 시 published 만.
// ui/ primitive 레이어로 재작성 (design system rollout).

import { useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { monogramInitials, Text, useTheme, type Theme } from '../ui';

type NewsCategory = 'beauty' | 'diet' | 'wellness';

interface NewsArticle {
  id: string;
  category: NewsCategory;
  title: string;
  source: string;
  /** 발행 표시용 상대 시간 — mock. */
  postedAt: string;
  readMinutes: number;
}

const CATEGORIES: ReadonlyArray<{ key: NewsCategory; label: string }> = [
  { key: 'beauty', label: 'Beauty' },
  { key: 'diet', label: 'Diet' },
  { key: 'wellness', label: 'Wellness & Fitness' },
];

const MOCK_ARTICLES: ReadonlyArray<NewsArticle> = [
  { id: 'n1', category: 'diet', title: 'Why high-protein breakfasts are having a moment', source: 'The Wellness Edit', postedAt: '2h ago', readMinutes: 4 },
  { id: 'n2', category: 'wellness', title: 'Cold plunges, explained: what the science actually says', source: 'Recovery Lab', postedAt: '5h ago', readMinutes: 6 },
  { id: 'n3', category: 'beauty', title: 'The skin-barrier routine dermatologists keep recommending', source: 'Glow Journal', postedAt: '1d ago', readMinutes: 5 },
  { id: 'n4', category: 'diet', title: 'Mediterranean vs. plant-based: how the celebrity plates compare', source: 'Plate & Performance', postedAt: '1d ago', readMinutes: 8 },
  { id: 'n5', category: 'wellness', title: 'Sleep is the new supplement: routines from elite athletes', source: 'Recovery Lab', postedAt: '2d ago', readMinutes: 7 },
  { id: 'n6', category: 'beauty', title: 'Inside the 5-step morning routine that took over your feed', source: 'Glow Journal', postedAt: '3d ago', readMinutes: 4 },
];

// category → token accent index (beauty=terracotta, diet=gold, wellness=teal).
const CATEGORY_ACCENT: Record<NewsCategory, number> = { beauty: 0, diet: 4, wellness: 1 };

function ArticleCard({ article }: { article: NewsArticle }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeCardStyles(theme), [theme]);
  const scale = useRef(new Animated.Value(1)).current;
  const thumbColor = theme.accents[CATEGORY_ACCENT[article.category]];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={article.title}
        onPressIn={() => {
          Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50 }).start();
        }}
        onPressOut={() => {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
        }}
        style={styles.articleCard}
      >
        <View style={styles.articleBody}>
          <Text variant="label" tone="brand">
            {article.source}
          </Text>
          <Text variant="h4" numberOfLines={3} style={styles.articleTitle}>
            {article.title}
          </Text>
          <Text variant="caption" tone="muted">
            {article.postedAt} · {String(article.readMinutes)} min read
          </Text>
        </View>
        <View style={[styles.articleThumb, { backgroundColor: thumbColor }]}>
          <Text style={[styles.thumbInitial, { fontFamily: theme.font.display }]} tone="onBrand">
            {monogramInitials(article.source)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function NewsScreen(): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const [category, setCategory] = useState<NewsCategory>('beauty');

  const data = useMemo(() => MOCK_ARTICLES.filter((a) => a.category === category), [category]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text variant="h1">News</Text>
        <Text variant="bodySm" tone="muted">
          웰니스 트렌드를 한눈에.
        </Text>
      </View>

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => {
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

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <ArticleCard article={item} />}
      />
    </SafeAreaView>
  );
}

function makeScreenStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(3),
      gap: theme.space(1),
    },
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
    listContent: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(8) },
    separator: { height: 1, backgroundColor: theme.color.border, marginVertical: theme.space(4) },
  });
}

function makeCardStyles(theme: Theme) {
  return StyleSheet.create({
    articleCard: { flexDirection: 'row', gap: theme.space(3), alignItems: 'center' },
    articleBody: { flex: 1, gap: theme.space(1) },
    articleTitle: { fontWeight: '700' },
    articleThumb: {
      width: 88,
      height: 88,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbInitial: { fontSize: 28, fontWeight: '700' },
  });
}
