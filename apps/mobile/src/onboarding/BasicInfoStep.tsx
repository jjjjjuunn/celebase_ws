// S3 — Basic Info. display_name, birth_year, sex 입력.
// 비-PHI (생년/성별 은 spec.md §9.3 PHI 정의 외).

import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Sex } from '@celebbase/shared-types';

import { Button, Text, useTheme, type Theme } from '../ui';
import type { BasicInfoDraft } from './types';

interface BasicInfoStepProps {
  initial?: BasicInfoDraft;
  onNext: (draft: BasicInfoDraft) => void;
  onBack: () => void;
  onClose: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1920;
const MAX_YEAR = CURRENT_YEAR - 13; // 만 13세 이상

const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function BasicInfoStep({
  initial,
  onNext,
  onBack,
  onClose,
}: BasicInfoStepProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [birthYearText, setBirthYearText] = useState(
    initial?.birth_year !== undefined ? String(initial.birth_year) : '',
  );
  const [sex, setSex] = useState<Sex | undefined>(initial?.sex);
  const [error, setError] = useState<string | null>(null);

  function validateAndNext(): void {
    if (displayName.trim() === '') {
      setError('Please enter your name.');
      return;
    }
    const year = Number.parseInt(birthYearText, 10);
    if (Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) {
      setError(`Birth year must be a 4-digit number between ${String(MIN_YEAR)} and ${String(MAX_YEAR)}.`);
      return;
    }
    if (sex === undefined) {
      setError('Please select an option.');
      return;
    }
    setError(null);
    onNext({ display_name: displayName.trim(), birth_year: year, sex });
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
          2 / 3
        </Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text tone="muted" style={styles.navIcon}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text variant="h1">Tell us about yourself</Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          Basic details to personalize your recommendations.
        </Text>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Name
          </Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Alex"
            placeholderTextColor={theme.color.textMuted}
            accessibilityLabel="Name"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Birth year
          </Text>
          <TextInput
            value={birthYearText}
            onChangeText={setBirthYearText}
            placeholder="e.g. 1995"
            placeholderTextColor={theme.color.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Birth year"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Sex
          </Text>
          <View style={styles.chipRow}>
            {SEX_OPTIONS.map((opt) => {
              const active = sex === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setSex(opt.value);
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
      </View>

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
    body: { flex: 1, paddingHorizontal: theme.space(4), gap: theme.space(4) },
    subtitle: { marginTop: -theme.space(3) },
    field: { gap: theme.space(2) },
    label: { fontWeight: theme.weight.semibold },
    input: {
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space(3),
      paddingVertical: theme.space(3),
      fontSize: theme.type.body,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
    chip: {
      paddingHorizontal: theme.space(4),
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
