// Wellness claims feed 의 카테고리 필터 — 가로 스크롤 chip group.
// 'all' + ClaimType 7종 = 8 탭. spec.md §7.2 Tab 1 Discover 의 카테고리 정의와 정합.

import { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import type { ClaimType } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
            <Text variant="bodySm" tone={active ? 'onBrand' : 'default'} style={styles.label}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: { flexGrow: 0, flexShrink: 0 },
    container: {
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(2),
      gap: theme.space(2),
      alignItems: 'center',
    },
    chip: {
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(2),
      borderRadius: theme.radius.pill,
      alignSelf: 'center',
    },
    chipActive: { backgroundColor: theme.color.brandBg },
    chipInactive: { backgroundColor: theme.color.surface },
    label: { fontWeight: theme.weight.semibold },
  });
}
