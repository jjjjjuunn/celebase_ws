// News 탭 root — 아티클 피드 (디자인 ref: 4번 사진 / Medium-style feed).
//
// 스펙 (사용자 2026-05-14):
//   3.   뉴스는 4번 사진 참고.
//   3-1. 카테고리는 Beauty / Diet / Wellness & Fitness.
//
// mock 아티클(src/lib/news-mock.ts) — 카드 탭 시 NewsDetail 로 이동. content-service
// trend intelligence 연결 시 교체. ui/ primitive 레이어 사용.

import { useMemo, useRef, useState, type ComponentProps } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  getNewsArticlesByCategory,
  NEWS_CATEGORIES,
  type NewsArticle,
  type NewsCategory,
} from '../lib/news-mock';
import { resolveToken } from '../lib/tokens';
import { Text, useTheme, type Theme } from '../ui';

interface NewsScreenProps {
  /** 카드 탭 시 — NewsDetail 로 이동. */
  onArticlePress: (id: string) => void;
}

// category → line icon (thumbnail is a neutral taupe placeholder until article
// imagery lands; the icon signals the category without a muddy colour block).
type IoniconName = ComponentProps<typeof Ionicons>['name'];
const CATEGORY_ICON: Record<NewsCategory, IoniconName> = {
  beauty: 'sparkles-outline',
  diet: 'nutrition-outline',
  wellness: 'barbell-outline',
};

function ArticleCard({
  article,
  onPress,
}: {
  article: NewsArticle;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeCardStyles(theme), [theme]);
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={article.title}
        onPress={onPress}
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
          <Text variant="metricSm" tone="muted">
            {article.postedAt} · {String(article.readMinutes)} min read
          </Text>
        </View>
        <View style={styles.articleThumb}>
          <Ionicons name={CATEGORY_ICON[article.category]} size={30} color={theme.color.onInk} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function NewsScreen({ onArticlePress }: NewsScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const [category, setCategory] = useState<NewsCategory>('beauty');

  const data = useMemo(() => getNewsArticlesByCategory(category), [category]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text variant="h1">News</Text>
        <Text variant="bodySm" tone="muted">
          웰니스 트렌드를 한눈에.
        </Text>
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

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <ArticleCard
            article={item}
            onPress={() => {
              onArticlePress(item.id);
            }}
          />
        )}
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
      backgroundColor: resolveToken(theme.mode, '--cb-neutral-400'),
    },
  });
}
