// S6 — Goals & Diet Prefs. 비-PHI.

import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  { value: 'weight_loss', label: 'Weight loss' },
  { value: 'muscle_gain', label: 'Muscle gain' },
  { value: 'maintenance', label: 'Maintain weight' },
  { value: 'longevity', label: 'Longevity & healthspan' },
  { value: 'energy', label: 'More energy' },
  { value: 'gut_health', label: 'Gut health' },
  { value: 'skin_health', label: 'Skin health' },
  { value: 'athletic_performance', label: 'Athletic performance' },
];

const SECONDARY_GOAL_OPTIONS: ReadonlyArray<string> = [
  'Better sleep',
  'Stress relief',
  'Focus',
  'Immunity',
  'Heart health',
];

const DIET_TYPE_OPTIONS: ReadonlyArray<{ value: DietType; label: string }> = [
  { value: 'omnivore', label: 'Omnivore (no restrictions)' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
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
      setError('Please choose your primary goal.');
      return;
    }
    setError(null);
    onNext({ primary_goal: primaryGoal, secondary_goals: secondaryGoals, diet_type: dietType });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>5 / 6</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Goals & diet</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Primary goal (pick one)</Text>
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
          <Text style={styles.label}>Other goals <Text style={styles.optional}>· Select any that apply</Text></Text>
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
          <Text style={styles.label}>Diet type <Text style={styles.optional}>· Optional, leave blank if none</Text></Text>
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
          accessibilityLabel="Continue"
          style={styles.nextButton}
        >
          <Text style={styles.nextButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
