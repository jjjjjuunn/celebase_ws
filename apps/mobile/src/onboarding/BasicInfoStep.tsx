// S3 — Basic Info. display_name, birth_year, sex 입력.
// 비-PHI (생년/성별 은 spec.md §9.3 PHI 정의 외).

import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@celebbase/design-tokens';
import type { Sex } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
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
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>2 / 3</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Tell us about yourself</Text>
        <Text style={styles.subtitle}>Basic details to personalize your recommendations.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Alex"
            accessibilityLabel="Name"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Birth year</Text>
          <TextInput
            value={birthYearText}
            onChangeText={setBirthYearText}
            placeholder="e.g. 1995"
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Birth year"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Sex</Text>
          <View style={styles.sexRow}>
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
                  style={[styles.sexChip, active ? styles.sexChipActive : styles.sexChipInactive]}
                >
                  <Text
                    style={[
                      styles.sexChipText,
                      active ? styles.sexChipTextActive : styles.sexChipTextInactive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {error !== null ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

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
  backButton: {
    fontSize: 24,
    color: resolveToken('light', '--cb-color-brand'),
  },
  stepLabel: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 24,
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  body: {
    flex: 1,
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-4']),
  },
  title: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  subtitle: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
    marginTop: -px(tokens.light['--cb-space-3']),
  },
  field: {
    gap: px(tokens.light['--cb-space-2']),
  },
  label: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  input: {
    borderWidth: 1,
    borderColor: resolveToken('light', '--cb-color-border'),
    borderRadius: 8,
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingVertical: px(tokens.light['--cb-space-3']),
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  sexRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: px(tokens.light['--cb-space-2']),
  },
  sexChip: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-2']),
    borderRadius: 20,
  },
  sexChipActive: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  sexChipInactive: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  sexChipText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
  },
  sexChipTextActive: {
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  sexChipTextInactive: {
    color: resolveToken('light', '--cb-color-text'),
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
