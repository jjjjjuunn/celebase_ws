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
//  - Health Disclaimer 반드시 노출 (role="alert" 접근성 보장).

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { ActivityLevel } from '@celebbase/shared-types';

import { Button, Text, useTheme, type Theme } from '../ui';
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | undefined>(
    initial?.activity_level,
  );
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [conditionsText, setConditionsText] = useState(initial?.medical_conditions.join(', ') ?? '');
  const [medicationsText, setMedicationsText] = useState(initial?.medications.join(', ') ?? '');
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
          <Text tone="brand" style={styles.navIcon}>
            ←
          </Text>
        </TouchableOpacity>
        <Text variant="bodySm" tone="muted" style={styles.stepLabel}>
          4 / 6
        </Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={theme.color.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h1">Activity &amp; health</Text>
        <View accessibilityRole="alert" accessibilityLabel="Health disclaimer" style={styles.disclaimer}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={theme.color.textMuted}
            style={styles.disclaimerIcon}
          />
          <Text variant="bodySm" style={styles.disclaimerText}>
            {HEALTH_DISCLAIMER}
          </Text>
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Daily activity level
          </Text>
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
                  <Text variant="body" tone={active ? 'brand' : 'default'} style={styles.activityLabel}>
                    {opt.label}
                  </Text>
                  <Text variant="caption" tone="muted" style={styles.activityDesc}>
                    {opt.desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Allergies{' '}
            <Text variant="bodySm" tone="muted" style={styles.optional}>
              · Select all that apply
            </Text>
          </Text>
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
                  <Text variant="bodySm" tone={active ? 'onBrand' : 'default'} style={styles.chipText}>
                    {allergy}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Medical conditions{' '}
            <Text variant="bodySm" tone="muted" style={styles.optional}>
              · Comma-separated, leave blank if none
            </Text>
          </Text>
          <TextInput
            value={conditionsText}
            onChangeText={setConditionsText}
            placeholder="e.g. hypertension, diabetes"
            placeholderTextColor={theme.color.textMuted}
            accessibilityLabel="Medical conditions"
            multiline
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Medications{' '}
            <Text variant="bodySm" tone="muted" style={styles.optional}>
              · Comma-separated, leave blank if none
            </Text>
          </Text>
          <TextInput
            value={medicationsText}
            onChangeText={setMedicationsText}
            placeholder="e.g. metformin, aspirin"
            placeholderTextColor={theme.color.textMuted}
            accessibilityLabel="Medications"
            multiline
            style={styles.input}
          />
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
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space(2),
      padding: theme.space(3),
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    disclaimerIcon: { marginTop: 1 },
    disclaimerText: { flex: 1, lineHeight: theme.type.bodySm + 6 },
    field: { gap: theme.space(2) },
    label: { fontWeight: theme.weight.semibold },
    optional: { fontWeight: theme.weight.regular },
    activityList: { gap: theme.space(2) },
    activityRow: {
      padding: theme.space(3),
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.surface,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    activityRowActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandSubtle },
    activityLabel: { fontWeight: theme.weight.semibold },
    activityDesc: { marginTop: 2 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
    chip: {
      paddingHorizontal: theme.space(3),
      paddingVertical: theme.space(2),
      borderRadius: theme.radius.pill,
    },
    chipActive: { backgroundColor: theme.color.brandBg },
    chipInactive: { backgroundColor: theme.color.surface },
    chipText: { fontWeight: theme.weight.semibold },
    input: {
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space(3),
      paddingVertical: theme.space(3),
      fontSize: theme.type.body,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
      minHeight: 48,
    },
    footer: {
      padding: theme.space(4),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
}
