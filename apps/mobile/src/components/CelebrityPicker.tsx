// 셀럽 그리드 picker — 온보딩 S2(PersonaSelectStep) + 식단 생성 시트(C3)가 공유.
//
// 책임: listCelebrities 로드 + loading/error/loaded 상태머신 + 2-column 그리드 + 카드.
// 선택 상태는 호출자가 소유한다 (selectedSlug prop) — picker 는 표시 + onSelect 통지만 한다.
// 호출자는 본 컴포넌트를 flex:1 영역으로 감싸 그리드가 남은 공간을 채우게 한다.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

import type { schemas } from '@celebbase/shared-types';

import { listCelebrities } from '../services/celebrities';
import { Avatar, Text, useTheme, type Theme } from '../ui';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={styles.centered}>
        <Text variant="body" tone="error">
          Couldn&apos;t load celebrities.
        </Text>
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.display_name}`}
      accessibilityState={{ selected }}
      style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
    >
      <Avatar name={item.display_name} uri={item.avatar_url} size={64} />
      <Text variant="bodySm" numberOfLines={1} center style={styles.cardName}>
        {item.display_name}
      </Text>
      <Text variant="caption" tone="muted">
        {item.category}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { flex: 1 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space(4),
    },
    grid: { paddingHorizontal: theme.space(3), paddingBottom: theme.space(4) },
    row: { gap: theme.space(3), marginBottom: theme.space(3) },
    card: {
      flex: 1,
      padding: theme.space(3),
      borderRadius: theme.radius.md,
      alignItems: 'center',
      gap: theme.space(2),
      borderWidth: 2,
    },
    cardSelected: { borderColor: theme.color.brand, backgroundColor: theme.color.brandSubtle },
    cardUnselected: { borderColor: 'transparent', backgroundColor: theme.color.surface },
    cardName: { fontWeight: theme.weight.semibold },
  });
}
