// S2 — Persona Select. 셀럽 그리드에서 하나를 선택해 onNext 호출.
//
// 데이터: GET /api/celebrities (public, M3 `authedFetch` 재사용).
// 본 task scope 는 selection 만 — PATCH /api/users/me { preferred_celebrity_slug }
// 호출은 S7 최종 confirm 시점 (후속 sub-task) 에 묶음.

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
import type { PersonaDraft } from './types';

interface PersonaSelectStepProps {
  initial?: PersonaDraft;
  onNext: (draft: PersonaDraft) => void;
  onClose: () => void;
}

type PageState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'loaded'; items: schemas.CelebrityWire[] };

export function PersonaSelectStep({
  initial,
  onNext,
  onClose,
}: PersonaSelectStepProps): React.JSX.Element {
  const [state, setState] = useState<PageState>({ phase: 'loading' });
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(
    initial?.preferred_celebrity_slug,
  );

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>1 / 3</Text>
      </View>

      <View style={styles.intro}>
        <Text style={styles.title}>닮고 싶은 셀럽을 골라주세요</Text>
        <Text style={styles.subtitle}>
          선택한 셀럽의 wellness 습관을 기반으로 식단을 추천해드려요.
        </Text>
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>셀럽 정보를 불러오지 못했습니다.</Text>
        </View>
      ) : (
        <FlatList
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
                setSelectedSlug(item.slug);
              }}
            />
          )}
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => {
            if (selectedSlug !== undefined && selectedSlug !== '') {
              onNext({ preferred_celebrity_slug: selectedSlug });
            }
          }}
          disabled={selectedSlug === undefined}
          accessibilityRole="button"
          accessibilityLabel="다음 단계로"
          accessibilityState={{ disabled: selectedSlug === undefined }}
          style={[
            styles.nextButton,
            selectedSlug === undefined ? styles.nextButtonDisabled : styles.nextButtonActive,
          ]}
        >
          <Text
            style={[
              styles.nextButtonText,
              selectedSlug === undefined
                ? styles.nextButtonTextDisabled
                : styles.nextButtonTextActive,
            ]}
          >
            다음
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
      accessibilityLabel={`${item.display_name} 선택`}
      accessibilityState={{ selected }}
      style={[styles.card, selected ? styles.cardSelected : styles.cardUnselected]}
    >
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>{item.display_name.slice(0, 1)}</Text>
      </View>
      <Text style={styles.cardName} numberOfLines={1}>{item.display_name}</Text>
      <Text style={styles.cardCategory}>{item.category}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  closeButton: {
    fontSize: 24,
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  stepLabel: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '600',
  },
  intro: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-3']),
    gap: px(tokens.light['--cb-space-2']),
  },
  title: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
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
  footer: {
    padding: px(tokens.light['--cb-space-4']),
    borderTopWidth: 1,
    borderTopColor: resolveToken('light', '--cb-color-border'),
  },
  nextButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonActive: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  nextButtonDisabled: {
    backgroundColor: resolveToken('light', '--cb-color-neutral-100'),
  },
  nextButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
  },
  nextButtonTextActive: {
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  nextButtonTextDisabled: {
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
