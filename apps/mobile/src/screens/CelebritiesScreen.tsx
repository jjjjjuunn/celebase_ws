// Celebrities 탭 root — 히어로형(Spotify/Netflix 스타일): 전면 히어로 1개 +
// 카테고리별(Women/Men) 가로 스와이프 rail. (사용자 선택 2026-05-22.)
//
// 셀럽 사진은 라이선스 hold → 사진 대신 결정적 accent 컬러 블록 타일 + 하단 scrim +
// Fraunces 이름 오버레이 + 카테고리 칩 (에디토리얼 매거진 커버 — 레퍼런스 CelebTile).
// 사진 시드 후 컬러 블록 → 풀블리드 이미지로 교체 (backlog). 탭 → CelebrityDetail.
// 데이터는 mock-data (content-service 실 셀럽 + 풍부 프로필 시드 후 교체 — backlog).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMockCelebritiesByGender, type MockCelebrity } from '../lib/mock-data';
import { resolveToken } from '../lib/tokens';
import { monogramIndex, Text, useTheme, type Theme } from '../ui';

// 히어로에 표시되는 featured 셀럽을 자동 순환시키는 주기 (ms).
const HERO_ROTATION_MS = 5000;
// 히어로 carousel 전환 애니메이션 (현재 카드 좌측 슬라이드아웃 → 새 카드 우측 슬라이드인).
const HERO_SLIDE_OUT_MS = 260;
const HERO_SLIDE_IN_MS = 320;
// 화면 높이 대비 섹션 비율 — 히어로 40%, Women/Men rail 각 25%.
// 히어로를 40% 로 줄여 Women rail 아래로 Men 섹션 일부가 fold 위에 peek 되도록 한다.
const HERO_HEIGHT_RATIO = 0.4;
const RAIL_HEIGHT_RATIO = 0.25;
// 가로 rail 에서 다음(3번째) 카드가 살짝 보이도록 남기는 폭(px) — "2개 full + peek".
const RAIL_CARD_PEEK = 44;

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

// Photo placeholder: warm-grey/taupe tile (a desaturated "dimmed portrait" until
// licensed celebrity photography lands). Deterministic shade per name → stable
// identity, cohesive monochrome that lets the gold brand read as the only colour.
const TILE_SHADES = ['--cb-neutral-400', '--cb-neutral-500', '--cb-neutral-600'] as const;
function tileShade(theme: Theme, name: string): string {
  return resolveToken(theme.mode, TILE_SHADES[monogramIndex(name, TILE_SHADES.length)]);
}

function Hero({
  celeb,
  height,
  onPress,
}: {
  celeb: MockCelebrity;
  height: number;
  onPress: (slug: string) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const press = usePressScale();
  const { width: screenW } = useWindowDimensions();
  // 슬라이드 거리 — 화면 폭의 절반 이상만큼 좌측으로 빠지고 우측 밖에서 들어온다.
  const slide = Math.round(screenW * 0.55);

  // 실제로 그려지는 셀럽. featured(prop)가 바뀌면 좌→우 carousel 전환 뒤 갱신한다.
  const [displayed, setDisplayed] = useState(celeb);
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (celeb.id === displayed.id) {
      return;
    }
    // 1) 현재 카드를 왼쪽으로 밀어내며 페이드아웃 →
    // 2) 새 카드를 오른쪽 밖에서 제자리로 슬라이드인.
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -slide,
        duration: HERO_SLIDE_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: HERO_SLIDE_OUT_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setDisplayed(celeb);
      translateX.setValue(slide);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: HERO_SLIDE_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: HERO_SLIDE_IN_MS,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [celeb, displayed.id, slide, translateX, opacity]);

  return (
    <Animated.View style={{ transform: [{ translateX }, { scale: press.scale }], opacity }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${displayed.name} — view profile`}
        onPress={() => {
          onPress(displayed.slug);
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.hero, { height, backgroundColor: tileShade(theme, displayed.name) }]}
      >
        <View style={styles.heroScrim} />
        {displayed.hashtags.length > 0 ? (
          <View style={styles.heroChip}>
            <Text variant="caption" style={[styles.heroChipText, { color: theme.color.onInk }]}>
              {displayed.hashtags[0].toUpperCase()}
            </Text>
          </View>
        ) : null}
        <View style={styles.heroTextWrap}>
          <Text variant="display" tone="onBrand" style={{ fontFamily: theme.font.display }}>
            {displayed.name}
          </Text>
          <View style={styles.heroTags}>
            {displayed.hashtags.slice(0, 3).map((tag) => (
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

function RailCard({
  celeb,
  width,
  height,
  onPress,
}: {
  celeb: MockCelebrity;
  width: number;
  height: number;
  onPress: () => void;
}): React.JSX.Element {
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
        style={[styles.railCard, { width }]}
      >
        <View style={[styles.railPanel, { width, height, backgroundColor: tileShade(theme, celeb.name) }]}>
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
  sectionHeight,
  cardWidth,
  onCelebPress,
}: {
  title: string;
  celebs: ReadonlyArray<MockCelebrity>;
  /** rail 섹션 전체 높이 — 화면의 25% (제목 + 카드 포함). */
  sectionHeight: number;
  /** rail 카드 1장의 폭 — 2장 full + 다음 카드 peek 가 보이도록 계산됨. */
  cardWidth: number;
  onCelebPress: (slug: string) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // 카드 높이 = 섹션 높이 − (상단 패딩 + 제목줄 + 제목/카드 간격).
  const titleBlock = theme.space(5) + Math.round(theme.type.h3 * 1.4) + theme.space(3);
  const cardHeight = Math.max(120, sectionHeight - titleBlock);
  return (
    <View style={[styles.rail, { height: sectionHeight }]}>
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
            width={cardWidth}
            height={cardHeight}
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
  const { width: screenW, height: screenH } = useWindowDimensions();

  // 화면 높이 기준 섹션 크기 — 히어로 40%, 각 rail 25%.
  const heroHeight = Math.round(screenH * HERO_HEIGHT_RATIO);
  const railSectionHeight = Math.round(screenH * RAIL_HEIGHT_RATIO);
  // rail 카드 폭 — 좌측 패딩 + 카드 2장 + 간격 2개 + peek 가 화면 폭에 맞도록 역산.
  const railGutter = theme.space(4);
  const railGap = theme.space(3);
  const railCardWidth = Math.round((screenW - railGutter - railGap * 2 - RAIL_CARD_PEEK) / 2);

  const women = useMemo(() => getMockCelebritiesByGender('women'), []);
  const men = useMemo(() => getMockCelebritiesByGender('men'), []);

  // 히어로는 전체 셀럽(여성+남성)을 HERO_ROTATION_MS 주기로 순환 노출한다.
  const heroPool = useMemo(() => [...women, ...men], [women, men]);
  const [heroIndex, setHeroIndex] = useState(0);
  useEffect(() => {
    if (heroPool.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroPool.length);
    }, HERO_ROTATION_MS);
    return () => {
      clearInterval(timer);
    };
  }, [heroPool.length]);
  const featured = heroPool[heroIndex] ?? heroPool[0]; // mock always has entries

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="h1">Celebrities</Text>
          <Text variant="bodySm" tone="muted">
            좋아하는 셀럽을 골라 나만의 식단을 시작하세요.
          </Text>
        </View>

        <Hero celeb={featured} height={heroHeight} onPress={onCelebPress} />

        <Rail
          title="Women"
          celebs={women}
          sectionHeight={railSectionHeight}
          cardWidth={railCardWidth}
          onCelebPress={onCelebPress}
        />
        <Rail
          title="Men"
          celebs={men}
          sectionHeight={railSectionHeight}
          cardWidth={railCardWidth}
          onCelebPress={onCelebPress}
        />
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
    // height 는 화면의 40% 로 런타임 주입 (CelebritiesScreen).
    hero: {
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
    // height (섹션) · card width/height 는 화면 비율로 런타임 주입.
    rail: { paddingTop: theme.space(5), gap: theme.space(3) },
    railTitle: { paddingHorizontal: theme.space(4) },
    railContent: { paddingHorizontal: theme.space(4), gap: theme.space(3) },
    railCard: {},
    railPanel: {
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
