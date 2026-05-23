// Celebrities 탭 root — 히어로형(Spotify/Netflix 스타일): 전면 히어로 1개 +
// 카테고리별(Women/Men) 가로 스와이프 rail. (사용자 선택 2026-05-22.)
//
// 셀럽 사진은 라이선스 hold → 사진 대신 결정적 accent 컬러 블록 타일 + 하단 scrim +
// Fraunces 이름 오버레이 + 카테고리 칩 (에디토리얼 매거진 커버 — 레퍼런스 CelebTile).
// 사진 시드 후 컬러 블록 → 풀블리드 이미지로 교체 (backlog). 탭 → CelebrityDetail.
// 데이터는 mock-data (content-service 실 셀럽 + 풍부 프로필 시드 후 교체 — backlog).

import { useMemo, useRef } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMockCelebritiesByGender, type MockCelebrity } from '../lib/mock-data';
import { monogramIndex, Text, useTheme, type Theme } from '../ui';

interface CelebritiesScreenProps {
  /** 카드/히어로 탭 시 — CelebrityDetail 로 이동. */
  onCelebPress: (slug: string) => void;
}

function usePressScale(): { scale: Animated.Value; onPressIn: () => void; onPressOut: () => void } {
  const scale = useRef(new Animated.Value(1)).current;
  return {
    scale,
    onPressIn: () => {
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
    },
    onPressOut: () => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
    },
  };
}

function accentFor(theme: Theme, name: string): string {
  return theme.accents[monogramIndex(name, theme.accents.length)];
}

function Hero({ celeb, onPress }: { celeb: MockCelebrity; onPress: () => void }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${celeb.name} — view profile`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.hero, { backgroundColor: accentFor(theme, celeb.name) }]}
      >
        <View style={styles.heroScrim} />
        {celeb.hashtags.length > 0 ? (
          <View style={styles.heroChip}>
            <Text variant="caption" style={[styles.heroChipText, { color: theme.color.onInk }]}>
              {celeb.hashtags[0].toUpperCase()}
            </Text>
          </View>
        ) : null}
        <View style={styles.heroTextWrap}>
          <Text variant="display" tone="onBrand" style={{ fontFamily: theme.font.display }}>
            {celeb.name}
          </Text>
          <View style={styles.heroTags}>
            {celeb.hashtags.slice(0, 3).map((tag) => (
              <Text key={tag} variant="caption" tone="onBrand" style={styles.heroTag}>
                #{tag}
              </Text>
            ))}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function RailCard({ celeb, onPress }: { celeb: MockCelebrity; onPress: () => void }): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${celeb.name} — view profile`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.railCard}
      >
        <View style={[styles.railPanel, { backgroundColor: accentFor(theme, celeb.name) }]}>
          <View style={styles.railScrim} />
          <View style={styles.railTextWrap}>
            <Text
              variant="bodySm"
              tone="onBrand"
              numberOfLines={1}
              style={[styles.railName, { fontFamily: theme.font.display }]}
            >
              {celeb.name}
            </Text>
            <Text variant="caption" tone="onBrand" numberOfLines={1} style={styles.railTag}>
              #{celeb.hashtags[0]}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Rail({
  title,
  celebs,
  onCelebPress,
}: {
  title: string;
  celebs: ReadonlyArray<MockCelebrity>;
  onCelebPress: (slug: string) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.rail}>
      <Text variant="h3" style={styles.railTitle}>
        {title}
      </Text>
      <FlatList
        horizontal
        data={celebs as MockCelebrity[]}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        renderItem={({ item }) => (
          <RailCard
            celeb={item}
            onPress={() => {
              onCelebPress(item.slug);
            }}
          />
        )}
      />
    </View>
  );
}

export function CelebritiesScreen({ onCelebPress }: CelebritiesScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const women = useMemo(() => getMockCelebritiesByGender('women'), []);
  const men = useMemo(() => getMockCelebritiesByGender('men'), []);
  const featured = women[0]; // mock always has Women entries

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="h1">Celebrities</Text>
          <Text variant="bodySm" tone="muted">
            좋아하는 셀럽을 골라 나만의 식단을 시작하세요.
          </Text>
        </View>

        <Hero
          celeb={featured}
          onPress={() => {
            onCelebPress(featured.slug);
          }}
        />

        <Rail title="Women" celebs={women} onCelebPress={onCelebPress} />
        <Rail title="Men" celebs={men} onCelebPress={onCelebPress} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scrollContent: { paddingBottom: theme.space(8) },
    header: {
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(4),
      gap: theme.space(1),
    },
    // Hero — full-bleed editorial color block (placeholder for licensed photo).
    hero: {
      height: 380,
      marginHorizontal: theme.space(4),
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
    },
    heroScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 190,
      backgroundColor: theme.color.text,
      opacity: 0.42,
    },
    heroChip: {
      position: 'absolute',
      top: theme.space(4),
      left: theme.space(4),
      backgroundColor: theme.color.ink,
      paddingVertical: 5,
      paddingHorizontal: theme.space(3),
      borderRadius: theme.radius.pill,
    },
    heroChipText: { fontWeight: '600', letterSpacing: 1 },
    heroTextWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: theme.space(5),
      gap: theme.space(2),
    },
    heroTags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(3) },
    heroTag: { opacity: 0.88 },
    // Rails — horizontal category carousels of overlaid color tiles.
    rail: { paddingTop: theme.space(5), gap: theme.space(3) },
    railTitle: { paddingHorizontal: theme.space(4) },
    railContent: { paddingHorizontal: theme.space(4), gap: theme.space(3) },
    railCard: { width: 140 },
    railPanel: {
      width: 140,
      height: 180,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    railScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 96,
      backgroundColor: theme.color.text,
      opacity: 0.4,
    },
    railTextWrap: { padding: theme.space(3), gap: 2 },
    railName: { fontSize: 16 },
    railTag: { opacity: 0.85 },
  });
}
