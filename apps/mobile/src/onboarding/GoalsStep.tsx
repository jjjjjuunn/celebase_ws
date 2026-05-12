// S6 — Goals & Diet Prefs. 비-PHI.

import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';
import type { PrimaryGoal, DietType } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
import type { GoalsDraft } from './types';

interface GoalsStepProps {
  initial?: GoalsDraft;
  onNext: (draft: GoalsDraft) => void;
  onBack: () => void;
  onClose: () => void;
}

const PRIMARY_GOAL_OPTIONS: ReadonlyArray<{ value: PrimaryGoal; label: string }> = [
  { value: 'weight_loss', label: '체중 감량' },
  { value: 'muscle_gain', label: '근육 증가' },
  { value: 'maintenance', label: '현재 상태 유지' },
  { value: 'longevity', label: '장수 / 건강 수명' },
  { value: 'energy', label: '에너지 향상' },
  { value: 'gut_health', label: '장 건강' },
  { value: 'skin_health', label: '피부 건강' },
  { value: 'athletic_performance', label: '운동 수행 능력' },
];

const SECONDARY_GOAL_OPTIONS: ReadonlyArray<string> = [
  '수면 개선',
  '스트레스 감소',
  '집중력',
  '면역력',
  '심혈관 건강',
];

const DIET_TYPE_OPTIONS: ReadonlyArray<{ value: DietType; label: string }> = [
  { value: 'omnivore', label: '잡식 (제한 없음)' },
  { value: 'pescatarian', label: '페스코 (생선만)' },
  { value: 'vegetarian', label: '베지테리안' },
  { value: 'vegan', label: '비건' },
  { value: 'keto', label: '키토' },
  { value: 'paleo', label: '팔레오' },
];

export function GoalsStep({
  initial,
  onNext,
  onBack,
  onClose,
}: GoalsStepProps): React.JSX.Element {
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | undefined>(initial?.primary_goal);
  const [secondaryGoals, setSecondaryGoals] = useState<string[]>(initial?.secondary_goals ?? []);
  const [dietType, setDietType] = useState<DietType | null>(initial?.diet_type ?? null);
  const [error, setError] = useState<string | null>(null);

  function toggleSecondary(goal: string): void {
    setSecondaryGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal],
    );
  }

  function validateAndNext(): void {
    if (primaryGoal === undefined) {
      setError('가장 중요한 목표 하나를 선택해주세요.');
      return;
    }
    setError(null);
    onNext({ primary_goal: primaryGoal, secondary_goals: secondaryGoals, diet_type: dietType });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="이전 단계">
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>5 / 6</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>목표와 식단 선호</Text>

        <View style={styles.field}>
          <Text style={styles.label}>가장 중요한 목표 (하나)</Text>
          <View style={styles.chipRow}>
            {PRIMARY_GOAL_OPTIONS.map((opt) => {
              const active = primaryGoal === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setPrimaryGoal(opt.value);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>관심 있는 부가 목표 <Text style={styles.optional}>· 여러 개 선택 가능</Text></Text>
          <View style={styles.chipRow}>
            {SECONDARY_GOAL_OPTIONS.map((goal) => {
              const active = secondaryGoals.includes(goal);
              return (
                <TouchableOpacity
                  key={goal}
                  onPress={() => {
                    toggleSecondary(goal);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={goal}
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                    {goal}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>식단 유형 <Text style={styles.optional}>· 선택, 없으면 비워두세요</Text></Text>
          <View style={styles.chipRow}>
            {DIET_TYPE_OPTIONS.map((opt) => {
              const active = dietType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setDietType(active ? null : opt.value);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {error !== null ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={validateAndNext}
          accessibilityRole="button"
          accessibilityLabel="다음 단계로"
          style={styles.nextButton}
        >
          <Text style={styles.nextButtonText}>다음</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: resolveToken('light', '--cb-color-bg') },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  backButton: { fontSize: 24, color: resolveToken('light', '--cb-color-brand') },
  closeButton: { fontSize: 24, color: resolveToken('light', '--cb-color-text-muted') },
  stepLabel: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-4']),
  },
  title: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  field: { gap: px(tokens.light['--cb-space-2']) },
  label: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  optional: {
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '400',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: px(tokens.light['--cb-space-2']),
  },
  chip: {
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    borderRadius: 16,
  },
  chipActive: { backgroundColor: resolveToken('light', '--cb-color-brand-bg') },
  chipInactive: { backgroundColor: resolveToken('light', '--cb-color-surface') },
  chipText: { fontSize: px(tokens.light['--cb-body-sm']), fontWeight: '600' },
  chipTextActive: { color: resolveToken('light', '--cb-color-on-brand') },
  chipTextInactive: { color: resolveToken('light', '--cb-color-text') },
  errorText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-error'),
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
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  nextButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
});
