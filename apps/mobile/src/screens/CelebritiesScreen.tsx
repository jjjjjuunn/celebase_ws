// Celebrities 탭 root — 3열 카드 그리드 (디자인 ref: 1번 사진 / Etsy-style grid).
//
// 스펙 (사용자 2026-05-14):
//   1.   가로 3열 카드 그리드. 카테고리는 여성 / 남성 2개.
//   1-1. 카드 = 셀럽 사진 + 이름 + 식단/루틴 해시태그 2-3개.
//   1-5. 카드 좌측 상단 빈 동그라미 — 체크하면 personalize 대상으로 표시.
//
// 사진은 라이선스 hold → 디자인 시스템의 결정적 monogram 패널(토큰 accent 팔레트 +
// Fraunces serif 이니셜)이 placeholder 가 아니라 의도된 비주얼이 되도록 한다.
// (IMPL-MOBILE-CELEB-REDESIGN-001 — ui/ primitive 레이어 위에 재작성.)

import { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Text, monogramIndex, monogramInitials, useTheme, type Theme } from '../ui';
import { getMockCelebritiesByGender, type CelebGender, type MockCelebrity } from '../lib/mock-data';

interface CelebritiesScreenProps {
  /** 카드 탭 시 — CelebrityDetail 로 이동. */
  onCelebPress: (slug: string) => void;
}

const NUM_COLS = 3;
const H_PADDING = 16;
const COL_GAP = 8;
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = (SCREEN_W - H_PADDING * 2 - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
const PANEL_H = (CARD_W * 4) / 3;

const CATEGORIES: ReadonlyArray<{ key: CelebGender; label: string }> = [
  { key: 'women', label: 'Women' },
  { key: 'men', label: 'Men' },
];

interface CelebCardProps {
  celeb: MockCelebrity;
  selected: boolean;
  onPress: () => void;
  onToggleSelect: () => void;
}

function CelebCard({ celeb, selected, onPress, onToggleSelect }: CelebCardProps): React.JSX.Element {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const styles = useMemo(() => makeCardStyles(theme), [theme]);

  const panelColor = theme.accents[monogramIndex(celeb.name, theme.accents.length)];

  return (
    <Animated.View style={{ width: CARD_W, transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${celeb.name} — view profile`}
        onPress={onPress}
        onPressIn={() => {
          Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
        }}
        onPressOut={() => {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
        }}
        style={styles.card}
      >
        <View style={[styles.panel, { backgroundColor: panelColor }]}>
          <Text
            style={[styles.monogram, { fontFamily: theme.font.display }]}
            tone="onBrand"
          >
            {monogramInitials(celeb.name)}
          </Text>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`Personalize with ${celeb.name}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onToggleSelect}
            style={[styles.checkbox, selected ? styles.checkboxOn : styles.checkboxOff]}
          >
            {selected ? (
              <Text style={styles.checkboxMark} tone="onBrand">
                ✓
              </Text>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.cardBody}>
          <Text variant="bodySm" numberOfLines={1} style={styles.name}>
            {celeb.name}
          </Text>
          <View style={styles.tagRow}>
            {celeb.hashtags.slice(0, 2).map((tag) => (
              <Text key={tag} variant="caption" tone="muted" numberOfLines={1}>
                #{tag}
              </Text>
            ))}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function CelebritiesScreen({ onCelebPress }: CelebritiesScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const [gender, setGender] = useState<CelebGender>('women');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const data = useMemo(() => getMockCelebritiesByGender(gender), [gender]);

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h1">Celebrities</Text>
        <Text variant="bodySm" tone="muted">
          좋아하는 셀럽을 골라 나만의 식단을 시작하세요.
        </Text>
      </View>

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => {
          const active = cat.key === gender;
          return (
            <Pressable
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setGender(cat.key);
              }}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <Text variant="label" tone={active ? 'onBrand' : 'muted'}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
        {selectedIds.size > 0 ? (
          <Text variant="label" tone="brand" style={styles.selectedCount}>
            {String(selectedIds.size)} selected
          </Text>
        ) : null}
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CelebCard
            celeb={item}
            selected={selectedIds.has(item.id)}
            onPress={() => {
              onCelebPress(item.slug);
            }}
            onToggleSelect={() => {
              toggleSelect(item.id);
            }}
          />
        )}
      />
    </View>
  );
}

function makeScreenStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg, paddingTop: theme.space(6) },
    header: { paddingHorizontal: H_PADDING, paddingBottom: theme.space(3), gap: theme.space(1) },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      paddingHorizontal: H_PADDING,
      paddingBottom: theme.space(3),
    },
    chip: {
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(2),
      borderRadius: theme.radius.pill,
    },
    chipActive: { backgroundColor: theme.color.brand },
    chipInactive: { backgroundColor: theme.color.surface },
    selectedCount: { marginLeft: 'auto' },
    listContent: { paddingHorizontal: H_PADDING, paddingBottom: theme.space(8) },
    columnWrapper: { gap: COL_GAP, marginBottom: theme.space(4) },
  });
}

function makeCardStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      shadowColor: theme.color.text,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === 'dark' ? 0.3 : 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    panel: { width: '100%', height: PANEL_H, alignItems: 'center', justifyContent: 'center' },
    monogram: { fontSize: CARD_W * 0.42, lineHeight: CARD_W * 0.5, fontWeight: '700' },
    checkbox: {
      position: 'absolute',
      top: theme.space(2),
      left: theme.space(2),
      width: 24,
      height: 24,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOff: { backgroundColor: theme.color.bg, borderWidth: 1.5, borderColor: theme.color.border },
    checkboxOn: { backgroundColor: theme.color.brand },
    checkboxMark: { fontSize: 14, fontWeight: '700' },
    cardBody: {
      paddingHorizontal: theme.space(2),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(3),
      gap: 2,
    },
    name: { fontWeight: '700' },
    tagRow: { gap: 1 },
  });
}
