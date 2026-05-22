// NewsDetail — 단일 아티클 본문 (mock). NewsFeed 카드 탭 → 이동.
// content-service trend intelligence 연결 시 실 본문으로 교체 (IMPL-MOBILE-NEWS-DETAIL-001).

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getNewsArticle } from '../lib/news-mock';
import { EmptyState, Text, useTheme, type Theme } from '../ui';

interface NewsDetailScreenProps {
  id: string;
  onBack: () => void;
}

export function NewsDetailScreen({ id, onBack }: NewsDetailScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const article = getNewsArticle(id);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" testID="news-detail-back">
          <Text variant="body" tone="brand" style={styles.bold}>
            ← Back
          </Text>
        </Pressable>
      </View>

      {article === undefined ? (
        <EmptyState glyph="📰" title="Article not found" body="We couldn't find this article." />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text variant="label" tone="brand">
            {article.source}
          </Text>
          <Text variant="h1" style={styles.title}>
            {article.title}
          </Text>
          <Text variant="caption" tone="muted">
            {article.postedAt} · {String(article.readMinutes)} min read
          </Text>
          {article.body.map((para, i) => (
            <Text key={`p-${String(i)}`} variant="bodyLg" style={styles.para}>
              {para}
            </Text>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) },
    bold: { fontWeight: '600' },
    body: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(8), gap: theme.space(3) },
    title: { marginTop: theme.space(2) },
    para: { lineHeight: theme.type.bodyLg * 1.6 },
  });
}
