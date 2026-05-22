// CelebrityDetail — 셀럽 프로필 (avatar + 해시태그 + 매크로/신체/운동/철학).
//
// 데이터 출처: 현재는 mock-data (getMockCelebrityBySlug). content-service 에 셀럽
// claims 가 시드되면(현 staging 0건) 실 API + claims 리스트로 확장한다 (backlog).
// 그리드(CelebritiesScreen)도 동일 mock 을 쓰므로 slug 가 항상 매칭된다 — 이전의
// 실 API 호출 → 404 ("Couldn't load") 미스매치를 해소 (IMPL-MOBILE-CELEB-DETAIL-FIX-001).

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMockCelebrityBySlug } from '../lib/mock-data';
import { Avatar, Badge, Card, EmptyState, Text, useTheme, type Theme } from '../ui';

interface CelebrityDetailScreenProps {
  slug: string;
  onBack: () => void;
}

const DISCLAIMER =
  'This information is for educational purposes only and is not intended as medical advice.';

export function CelebrityDetailScreen({
  slug,
  onBack,
}: CelebrityDetailScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const celeb = getMockCelebrityBySlug(slug);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" testID="celebrity-detail-back">
          <Text variant="body" tone="brand" style={styles.bold}>
            ← Back
          </Text>
        </Pressable>
      </View>

      {celeb === undefined ? (
        <EmptyState glyph="🔍" title="Celebrity not found" body="We couldn't find this profile." />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.heroSection}>
            <Avatar name={celeb.name} size={104} />
            <Text variant="h2" center>
              {celeb.name}
            </Text>
            <View style={styles.tagRow}>
              {celeb.hashtags.map((tag) => (
                <Badge key={tag} label={`#${tag}`} tone="subtle" />
              ))}
            </View>
          </View>

          <Card style={styles.card}>
            <Text variant="label" tone="muted">
              Daily macros
            </Text>
            <View style={styles.statRow}>
              <Stat value={`${String(celeb.macros.carbsG)}g`} label="Carbs" />
              <Stat value={`${String(celeb.macros.proteinG)}g`} label="Protein" />
              <Stat value={`${String(celeb.macros.fatG)}g`} label="Fat" />
            </View>
          </Card>

          <Card style={styles.card}>
            <Text variant="label" tone="muted">
              Profile
            </Text>
            <View style={styles.statRow}>
              <Stat value={`${String(celeb.bio.heightCm)}cm`} label="Height" />
              <Stat value={`${String(celeb.bio.weightKg)}kg`} label="Weight" />
              <Stat value={String(celeb.bio.age)} label="Age" />
            </View>
          </Card>

          {celeb.bio.workout !== undefined ? (
            <Card style={styles.card}>
              <Text variant="label" tone="muted">
                Training
              </Text>
              <Text variant="h4">{celeb.bio.workout.type}</Text>
              <Text variant="bodySm" tone="muted">
                {celeb.bio.workout.frequency} · {celeb.bio.workout.duration}
              </Text>
            </Card>
          ) : null}

          <Card style={styles.card}>
            <Text variant="label" tone="muted">
              Philosophy
            </Text>
            <Text variant="body" style={styles.philosophy}>
              {celeb.philosophy}
            </Text>
          </Card>

          <Text variant="caption" tone="muted" style={styles.disclaimer}>
            {DISCLAIMER}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.statBox}>
      <Text variant="h3">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) },
    bold: { fontWeight: '600' },
    body: { paddingBottom: theme.space(8) },
    heroSection: {
      alignItems: 'center',
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(4),
      gap: theme.space(2),
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: theme.space(2),
      marginTop: theme.space(1),
    },
    card: { marginHorizontal: theme.space(4), marginBottom: theme.space(3), gap: theme.space(2) },
    statRow: { flexDirection: 'row', gap: theme.space(3) },
    statBox: {
      flex: 1,
      backgroundColor: theme.color.bg,
      borderRadius: theme.radius.md,
      paddingVertical: theme.space(3),
      alignItems: 'center',
      gap: 2,
    },
    philosophy: { lineHeight: theme.type.body * 1.6 },
    disclaimer: {
      paddingHorizontal: theme.space(4),
      marginTop: theme.space(2),
      fontStyle: 'italic',
    },
  });
}
