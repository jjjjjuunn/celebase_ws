// S5 — Activity & Health. PHI 첫 도입.
//
// 필드:
//  - activity_level (radio) — 비-PHI
//  - allergies (chip multi + custom) — 비-PHI
//  - medical_conditions (chip multi + custom) — ⚠ PHI
//  - medications (chip multi + custom) — ⚠ PHI
//
// PHI 안전 의무:
//  - state 는 in-memory only (AsyncStorage 등 평문 영속화 금지).
//  - structured logger 포함 어떤 출력으로도 PHI 값을 흘리지 않는다.
//  - Health Disclaimer 반드시 노출 (role="note" 접근성 보장).

import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';
import type { ActivityLevel } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
import type { ActivityHealthDraft } from './types';

interface ActivityHealthStepProps {
  initial?: ActivityHealthDraft;
  onNext: (draft: ActivityHealthDraft) => void;
  onBack: () => void;
  onClose: () => void;
}

const HEALTH_DISCLAIMER =
  'This information is for educational purposes only and is not intended as medical advice. Always consult a physician for medical decisions.';

const ACTIVITY_OPTIONS: ReadonlyArray<{ value: ActivityLevel; label: string; desc: string }> = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Mostly sitting, little to no exercise' },
  { value: 'light', label: 'Light', desc: 'Light exercise 1–3 days/week' },
  { value: 'moderate', label: 'Moderate', desc: 'Moderate exercise 3–5 days/week' },
  { value: 'active', label: 'Active', desc: 'Hard exercise 6–7 days/week' },
  { value: 'very_active', label: 'Very active', desc: 'Intense daily training or physical labor' },
];

const COMMON_ALLERGIES: ReadonlyArray<string> = [
  'Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Wheat (gluten)', 'Soy', 'Shellfish', 'Fish',
];

export function ActivityHealthStep({
  initial,
  onNext,
  onBack,
  onClose,
}: ActivityHealthStepProps): React.JSX.Element {
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | undefined>(
    initial?.activity_level,
  );
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [conditionsText, setConditionsText] = useState(
    initial?.medical_conditions.join(', ') ?? '',
  );
  const [medicationsText, setMedicationsText] = useState(
    initial?.medications.join(', ') ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  function toggleAllergy(allergy: string): void {
    setAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy],
    );
  }

  function parseList(raw: string): string[] {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function validateAndNext(): void {
    if (activityLevel === undefined) {
      setError('Please select your activity level.');
      return;
    }
    setError(null);
    onNext({
      activity_level: activityLevel,
      allergies,
      medical_conditions: parseList(conditionsText),
      medications: parseList(medicationsText),
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>4 / 6</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Activity & health</Text>
        <View
          accessibilityRole="alert"
          accessibilityLabel="Health disclaimer"
          style={styles.disclaimer}
        >
          <Text style={styles.disclaimerText}>⚠ {HEALTH_DISCLAIMER}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Daily activity level</Text>
          <View style={styles.activityList}>
            {ACTIVITY_OPTIONS.map((opt) => {
              const active = activityLevel === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setActivityLevel(opt.value);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.activityRow, active ? styles.activityRowActive : null]}
                >
                  <Text
                    style={[styles.activityLabel, active ? styles.activityLabelActive : null]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={styles.activityDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Allergies <Text style={styles.optional}>· Select all that apply</Text></Text>
          <View style={styles.chipRow}>
            {COMMON_ALLERGIES.map((allergy) => {
              const active = allergies.includes(allergy);
              return (
                <TouchableOpacity
                  key={allergy}
                  onPress={() => {
                    toggleAllergy(allergy);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={allergy}
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                    {allergy}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Medical conditions <Text style={styles.optional}>· Comma-separated, leave blank if none</Text></Text>
          <TextInput
            value={conditionsText}
            onChangeText={setConditionsText}
            placeholder="e.g. hypertension, diabetes"
            accessibilityLabel="Medical conditions"
            multiline
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Medications <Text style={styles.optional}>· Comma-separated, leave blank if none</Text></Text>
          <TextInput
            value={medicationsText}
            onChangeText={setMedicationsText}
            placeholder="e.g. metformin, aspirin"
            accessibilityLabel="Medications"
            multiline
            style={styles.input}
          />
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
  disclaimer: {
    padding: px(tokens.light['--cb-space-3']),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
  },
  disclaimerText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text'),
    lineHeight: px(tokens.light['--cb-body-sm']) + 6,
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
  activityList: { gap: px(tokens.light['--cb-space-2']) },
  activityRow: {
    padding: px(tokens.light['--cb-space-3']),
    borderRadius: 8,
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activityRowActive: {
    borderColor: resolveToken('light', '--cb-color-brand'),
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
  },
  activityLabel: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  activityLabelActive: {
    color: resolveToken('light', '--cb-color-brand'),
  },
  activityDesc: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
    marginTop: 2,
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
  input: {
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
    borderRadius: 8,
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingVertical: px(tokens.light['--cb-space-3']),
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    minHeight: 48,
  },
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
