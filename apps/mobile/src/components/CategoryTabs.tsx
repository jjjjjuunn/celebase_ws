// Wellness claims feed 의 카테고리 필터 — 가로 스크롤 chip group.
// 'all' + ClaimType 7종 = 8 탭. spec.md §7.2 Tab 1 Discover 의 카테고리 정의와 정합.

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { tokens } from '@celebbase/design-tokens';
import type { ClaimType } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';

export type CategoryFilter = ClaimType | 'all';

interface CategoryTabsProps {
  selected: CategoryFilter;
  onSelect: (next: CategoryFilter) => void;
}

// spec.md §3.4 Enum Glossary 의 한국어 라벨.
const TABS: ReadonlyArray<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'food', label: '음식' },
  { key: 'workout', label: '운동' },
  { key: 'sleep', label: '수면' },
  { key: 'beauty', label: '뷰티' },
  { key: 'brand', label: '브랜드' },
  { key: 'philosophy', label: '철학' },
  { key: 'supplement', label: '보충제' },
];

export function CategoryTabs({ selected, onSelect }: CategoryTabsProps): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TABS.map((tab) => {
        const active = tab.key === selected;
        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onSelect(tab.key);
            }}
            style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    gap: px(tokens.light['--cb-space-2']),
  },
  chip: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  chipInactive: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  label: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
  },
  labelActive: {
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  labelInactive: {
    color: resolveToken('light', '--cb-color-text'),
  },
});
