// 셀럽 그리드 picker — 온보딩 S2(PersonaSelectStep) + 식단 생성 시트(C3)가 공유.
//
// 책임: listCelebrities 로드 + loading/error/loaded 상태머신 + 2-column 그리드 + 카드.
// 선택 상태는 호출자가 소유한다 (selectedSlug prop) — picker 는 표시 + onSelect 통지만 한다.
// 호출자는 본 컴포넌트를 flex:1 영역으로 감싸 그리드가 남은 공간을 채우게 한다.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { listCelebrities } from '../services/celebrities';
import { px, resolveToken } from '../lib/tokens';

interface CelebrityPickerProps {
  /** 현재 선택된 셀럽 slug — 카드 하이라이트용. 미선택이면 undefined. */
  selectedSlug?: string;
  /** 카드 탭 시 호출 — 선택된 celebrity 전체를 통지 (호출자가 slug/id 추출). */
  onSelect: (celebrity: schemas.CelebrityWire) => void;
}

type PickerState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'loaded'; items: schemas.CelebrityWire[] };

export function CelebrityPicker({
  selectedSlug,
  onSelect,
}: CelebrityPickerProps): React.JSX.Element {
  const [state, setState] = useState<PickerState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });

    listCelebrities()
      .then((res) => {
        if (cancelled) return;
        setState({ phase: 'loaded', items: res.items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown';
        setState({ phase: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load celebrities.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={state.items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <CelebrityCard
          item={item}
          selected={item.slug === selectedSlug}
          onPress={() => {
            onSelect(item);
          }}
        />
      )}
    />
  );
}

interface CelebrityCardProps {
  item: schemas.CelebrityWire;
  selected: boolean;
  onPress: () => void;
}

function CelebrityCard({ item, selected, onPress }: CelebrityCardProps): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.display_name}`}
      accessibilityState={{ selected }}
      style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
    >
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>{item.display_name.slice(0, 1)}</Text>
      </View>
      <Text style={styles.cardName} numberOfLines={1}>
        {item.display_name}
      </Text>
      <Text style={styles.cardCategory}>{item.category}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
  },
  grid: {
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingBottom: px(tokens.light['--cb-space-4']),
  },
  row: {
    gap: px(tokens.light['--cb-space-3']),
    marginBottom: px(tokens.light['--cb-space-3']),
  },
  card: {
    flex: 1,
    padding: px(tokens.light['--cb-space-3']),
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
  },
  cardSelected: {
    borderColor: resolveToken('light', '--cb-color-brand'),
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
  },
  cardUnselected: {
    borderColor: 'transparent',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  cardName: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
  cardCategory: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
