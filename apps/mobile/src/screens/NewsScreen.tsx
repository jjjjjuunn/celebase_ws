// News 탭 root — 아티클 피드 (디자인 ref: 4번 사진 / Medium-style feed).
//
// 스펙 (사용자 2026-05-14):
//   3.   뉴스는 4번 사진 참고.
//   3-1. 카테고리는 Beauty / Diet / Wellness & Fitness.
//
// 현재는 mock 아티클 — content-service 의 trend intelligence (spec.md) 연결 시 교체.
// content.md "자동 게시 금지: 편집팀 수동 승인 후에만 노출" — 실 연결 시 published 만.

import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';

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
  {
    id: 'n1',
    category: 'diet',
    title: 'Why high-protein breakfasts are having a moment',
    source: 'The Wellness Edit',
    postedAt: '2h ago',
    readMinutes: 4,
  },
  {
    id: 'n2',
    category: 'wellness',
    title: 'Cold plunges, explained: what the science actually says',
    source: 'Recovery Lab',
    postedAt: '5h ago',
    readMinutes: 6,
  },
  {
    id: 'n3',
    category: 'beauty',
    title: 'The skin-barrier routine dermatologists keep recommending',
    source: 'Glow Journal',
    postedAt: '1d ago',
    readMinutes: 5,
  },
  {
    id: 'n4',
    category: 'diet',
    title: 'Mediterranean vs. plant-based: how the celebrity plates compare',
    source: 'Plate & Performance',
    postedAt: '1d ago',
    readMinutes: 8,
  },
  {
    id: 'n5',
    category: 'wellness',
    title: 'Sleep is the new supplement: routines from elite athletes',
    source: 'Recovery Lab',
    postedAt: '2d ago',
    readMinutes: 7,
  },
  {
    id: 'n6',
    category: 'beauty',
    title: 'Inside the 5-step morning routine that took over your feed',
    source: 'Glow Journal',
    postedAt: '3d ago',
    readMinutes: 4,
  },
];

function ArticleCard({ article }: { article: NewsArticle }): React.JSX.Element {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={article.title}
      activeOpacity={0.85}
      style={styles.articleCard}
    >
      <View style={styles.articleBody}>
        <Text style={styles.articleSource}>{article.source}</Text>
        <Text numberOfLines={3} style={styles.articleTitle}>
          {article.title}
        </Text>
        <Text style={styles.articleMeta}>
          {article.postedAt} · {String(article.readMinutes)} min read
        </Text>
      </View>
      <View
        style={[styles.articleThumb, { backgroundColor: thumbColor(article.category) }]}
      />
    </TouchableOpacity>
  );
}

function thumbColor(category: NewsCategory): string {
  if (category === 'beauty') return resolveToken('light', '--cb-accent-aspirational');
  if (category === 'diet') return resolveToken('light', '--cb-brand-500');
  return resolveToken('light', '--cb-accent-biohacker');
}

export function NewsScreen(): React.JSX.Element {
  const [category, setCategory] = useState<NewsCategory>('beauty');

  const data = useMemo(
    () => MOCK_ARTICLES.filter((a) => a.category === category),
    [category],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Text style={styles.title}>News</Text>

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => {
          const active = cat.key === category;
          return (
            <TouchableOpacity
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setCategory(cat.key);
              }}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  active ? styles.chipLabelActive : styles.chipLabelInactive,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  title: {
    fontSize: px(tokens.light['--cb-h1']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingTop: px(tokens.light['--cb-space-2']),
    paddingBottom: px(tokens.light['--cb-space-3']),
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-3']),
  },
  chip: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    borderRadius: px(tokens.light['--cb-radius-pill']),
  },
  chipActive: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  chipInactive: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  chipLabel: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
  },
  chipLabelActive: {
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  chipLabelInactive: {
    color: resolveToken('light', '--cb-color-text'),
  },
  listContent: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-8']),
  },
  separator: {
    height: 1,
    backgroundColor: resolveToken('light', '--cb-color-border'),
    marginVertical: px(tokens.light['--cb-space-4']),
  },
  articleCard: {
    flexDirection: 'row',
    gap: px(tokens.light['--cb-space-3']),
    alignItems: 'center',
  },
  articleBody: {
    flex: 1,
    gap: px(tokens.light['--cb-space-1']),
  },
  articleSource: {
    fontSize: px(tokens.light['--cb-label-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-brand'),
  },
  articleTitle: {
    fontSize: px(tokens.light['--cb-h4']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  articleMeta: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  articleThumb: {
    width: 88,
    height: 88,
    borderRadius: px(tokens.light['--cb-radius-sm']),
  },
});
