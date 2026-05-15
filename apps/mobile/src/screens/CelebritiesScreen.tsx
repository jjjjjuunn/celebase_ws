// Celebrities 탭 root — 3열 카드 그리드 (디자인 ref: 1번 사진 / Etsy-style grid).
//
// 스펙 (사용자 2026-05-14):
//   1.   가로 3열 카드 그리드. 카테고리는 여성 / 남성 2개.
//   1-1. 카드 = 셀럽 사진 + 이름 + 식단/루틴 해시태그 2-3개.
//   1-5. 카드 좌측 상단 빈 동그라미 — 체크하면 personalize 대상으로 표시.
//
// 사진은 라이선스 이슈로 accent placeholder + 이니셜 (mock-data.ts 참조).
// personalize 선택은 현재 화면 로컬 state — 영속화는 BE 연결 시 후속.

import { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';
import {
  getMockCelebritiesByGender,
  type CelebGender,
  type MockCelebrity,
} from '../lib/mock-data';

interface CelebritiesScreenProps {
  /** 카드 탭 시 — CelebrityDetail 로 이동. */
  onCelebPress: (slug: string) => void;
}

const NUM_COLS = 3;
const H_PADDING = px(tokens.light['--cb-space-4']); // 16
const COL_GAP = px(tokens.light['--cb-space-2']); // 8
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = (SCREEN_W - H_PADDING * 2 - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;

const CATEGORIES: ReadonlyArray<{ key: CelebGender; label: string }> = [
  { key: 'women', label: 'Women' },
  { key: 'men', label: 'Men' },
];

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface CelebCardProps {
  celeb: MockCelebrity;
  selected: boolean;
  onPress: () => void;
  onToggleSelect: () => void;
}

function CelebCard({
  celeb,
  selected,
  onPress,
  onToggleSelect,
}: CelebCardProps): React.JSX.Element {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${celeb.name} — view profile`}
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.card}
    >
      <View style={[styles.photo, { backgroundColor: resolveToken('light', celeb.accent) }]}>
        <Text style={styles.photoInitials}>{initialsOf(celeb.name)}</Text>

        {/* 1-5. personalize 체크 동그라미 */}
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`Personalize with ${celeb.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onToggleSelect}
          style={[styles.checkbox, selected ? styles.checkboxOn : styles.checkboxOff]}
        >
          {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </TouchableOpacity>
      </View>

      <View style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.name}>
          {celeb.name}
        </Text>
        <View style={styles.tagRow}>
          {celeb.hashtags.slice(0, 3).map((tag) => (
            <Text key={tag} numberOfLines={1} style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function CelebritiesScreen({
  onCelebPress,
}: CelebritiesScreenProps): React.JSX.Element {
  const [gender, setGender] = useState<CelebGender>('women');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const data = useMemo(() => getMockCelebritiesByGender(gender), [gender]);

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Text style={styles.title}>Celebrities</Text>

      {/* 1. 카테고리 — 여성 / 남성 */}
      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => {
          const active = cat.key === gender;
          return (
            <TouchableOpacity
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setGender(cat.key);
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

        {selectedIds.size > 0 ? (
          <Text style={styles.selectedCount}>
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
    paddingHorizontal: H_PADDING,
    paddingTop: px(tokens.light['--cb-space-2']),
    paddingBottom: px(tokens.light['--cb-space-3']),
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(tokens.light['--cb-space-2']),
    paddingHorizontal: H_PADDING,
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
  selectedCount: {
    marginLeft: 'auto',
    fontSize: px(tokens.light['--cb-label-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-brand'),
  },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: px(tokens.light['--cb-space-8']),
  },
  columnWrapper: {
    gap: COL_GAP,
    marginBottom: px(tokens.light['--cb-space-4']),
  },
  // 웹 ui-kit CelebrityCard 와 정렬 — radius-lg, shadow, 흰 본문, 4:3 photo.
  card: {
    width: CARD_W,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    borderRadius: px(tokens.light['--cb-radius-lg']),
    overflow: 'hidden',
    // --cb-shadow-2 근사 (iOS) + Android elevation.
    shadowColor: resolveToken('light', '--cb-neutral-900'),
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  photo: {
    width: '100%',
    height: (CARD_W * 3) / 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontSize: px(tokens.light['--cb-h2']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  checkbox: {
    position: 'absolute',
    top: px(tokens.light['--cb-space-2']),
    left: px(tokens.light['--cb-space-2']),
    width: 22,
    height: 22,
    borderRadius: px(tokens.light['--cb-radius-pill']),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOff: {
    backgroundColor: resolveToken('light', '--cb-color-bg'),
    borderWidth: 1.5,
    borderColor: resolveToken('light', '--cb-color-border'),
    opacity: 0.9,
  },
  checkboxOn: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  checkboxMark: {
    fontSize: 13,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  cardBody: {
    paddingHorizontal: px(tokens.light['--cb-space-2']),
    paddingTop: px(tokens.light['--cb-space-2']),
    paddingBottom: px(tokens.light['--cb-space-3']),
    gap: px(tokens.light['--cb-space-1']),
  },
  name: {
    fontSize: px(tokens.light['--cb-label-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  tagRow: {
    gap: 2,
  },
  tag: {
    fontSize: px(tokens.light['--cb-label-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
