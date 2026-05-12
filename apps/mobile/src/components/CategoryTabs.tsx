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

// en-US labels — target market: US 20-30s (Apple App Store).
const TABS: ReadonlyArray<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'workout', label: 'Fitness' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'brand', label: 'Brands' },
  { key: 'philosophy', label: 'Mindset' },
  { key: 'supplement', label: 'Supplements' },
];

export function CategoryTabs({ selected, onSelect }: CategoryTabsProps): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
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
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  container: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    gap: px(tokens.light['--cb-space-2']),
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    borderRadius: 20,
    alignSelf: 'center',
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
