// S6 — Goals & Diet Prefs. 비-PHI.

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DietType, PrimaryGoal } from '@celebbase/shared-types';

import { Button, Text, useTheme, type Theme } from '../ui';
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

export function GoalsStep({ initial, onNext, onBack, onClose }: GoalsStepProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          <Text tone="brand" style={styles.navIcon}>
            ←
          </Text>
        </TouchableOpacity>
        <Text variant="bodySm" tone="muted" style={styles.stepLabel}>
          5 / 6
        </Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text tone="muted" style={styles.navIcon}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h1">Goals &amp; diet</Text>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Primary goal (pick one)
          </Text>
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
                  <Text variant="bodySm" tone={active ? 'onBrand' : 'default'} style={styles.chipText}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Other goals{' '}
            <Text variant="bodySm" tone="muted" style={styles.optional}>
              · Select any that apply
            </Text>
          </Text>
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
                  <Text variant="bodySm" tone={active ? 'onBrand' : 'default'} style={styles.chipText}>
                    {goal}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Diet type{' '}
            <Text variant="bodySm" tone="muted" style={styles.optional}>
              · Optional, leave blank if none
            </Text>
          </Text>
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
                  <Text variant="bodySm" tone={active ? 'onBrand' : 'default'} style={styles.chipText}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {error !== null ? (
          <Text variant="bodySm" tone="error">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Continue" onPress={validateAndNext} />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
    },
    navIcon: { fontSize: 24 },
    stepLabel: { fontWeight: theme.weight.semibold },
    body: {
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(4),
      gap: theme.space(4),
    },
    field: { gap: theme.space(2) },
    label: { fontWeight: theme.weight.semibold },
    optional: { fontWeight: theme.weight.regular },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
    chip: {
      paddingHorizontal: theme.space(3),
      paddingVertical: theme.space(2),
      borderRadius: theme.radius.pill,
    },
    chipActive: { backgroundColor: theme.color.brandBg },
    chipInactive: { backgroundColor: theme.color.surface },
    chipText: { fontWeight: theme.weight.semibold },
    footer: {
      padding: theme.space(4),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
}
