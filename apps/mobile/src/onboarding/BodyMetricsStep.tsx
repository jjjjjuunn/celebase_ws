// S4 — Body Metrics. Height / weight / waist (optional).
// 비-PHI (spec.md §9.3 PHI 정의는 biomarkers / medical_conditions / medications).
// 단위: 입력은 imperial (ft+in, lb, in) — US 시장 default. BE 전송 전 metric (cm/kg) 변환.

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

import { px, resolveToken } from '../lib/tokens';
import {
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  inchesToCm,
  kgToLb,
  lbToKg,
} from '../lib/units';
import type { BodyMetricsDraft } from './types';

interface BodyMetricsStepProps {
  initial?: BodyMetricsDraft;
  onComplete: (draft: BodyMetricsDraft) => void;
  onBack: () => void;
  onClose: () => void;
}

// Imperial 검증 범위 (인간 한계 안에서 넉넉히):
//   height: 3'0"~8'2" (36~98 inches) — metric 100~250 cm 와 대응
//   weight: 66~660 lb — metric 30~300 kg 와 대응
//   waist:  16~79 in — metric 40~200 cm 와 대응

export function BodyMetricsStep({
  initial,
  onComplete,
  onBack,
  onClose,
}: BodyMetricsStepProps): React.JSX.Element {
  const initialFeetInches =
    initial?.height_cm !== undefined ? cmToFeetInches(initial.height_cm) : null;

  const [feetText, setFeetText] = useState(
    initialFeetInches !== null ? String(initialFeetInches.feet) : '',
  );
  const [inchesText, setInchesText] = useState(
    initialFeetInches !== null ? String(initialFeetInches.inches) : '',
  );
  const [weightText, setWeightText] = useState(
    initial?.weight_kg !== undefined ? String(kgToLb(initial.weight_kg)) : '',
  );
  const [waistText, setWaistText] = useState(
    initial?.waist_cm !== undefined ? String(cmToInches(initial.waist_cm)) : '',
  );
  const [error, setError] = useState<string | null>(null);

  function validateAndComplete(): void {
    const ft = Number.parseFloat(feetText);
    const inches = inchesText.trim() === '' ? 0 : Number.parseFloat(inchesText);
    if (Number.isNaN(ft) || ft < 3 || ft > 8) {
      setError('Height must be between 3 and 8 feet.');
      return;
    }
    if (Number.isNaN(inches) || inches < 0 || inches >= 12) {
      setError('Inches must be between 0 and 11.');
      return;
    }
    const heightCm = feetInchesToCm(ft, inches);
    if (heightCm < 100 || heightCm > 250) {
      setError('Height seems out of range. Please double-check.');
      return;
    }

    const lb = Number.parseFloat(weightText);
    if (Number.isNaN(lb) || lb < 66 || lb > 660) {
      setError('Weight must be between 66 and 660 lb.');
      return;
    }
    const weightKg = lbToKg(lb);

    let waistCm: number | undefined;
    if (waistText.trim() !== '') {
      const waistIn = Number.parseFloat(waistText);
      if (Number.isNaN(waistIn) || waistIn < 16 || waistIn > 79) {
        setError('Waist must be between 16 and 79 inches.');
        return;
      }
      waistCm = inchesToCm(waistIn);
    }

    setError(null);
    const draft: BodyMetricsDraft = { height_cm: heightCm, weight_kg: weightKg };
    if (waistCm !== undefined) draft.waist_cm = waistCm;
    onComplete(draft);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>3 / 3</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Your body metrics</Text>
        <Text style={styles.subtitle}>
          Used to calculate BMR / TDEE. We'll ask about medical info separately in the next step.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Height</Text>
          <View style={styles.heightRow}>
            <View style={styles.heightField}>
              <TextInput
                value={feetText}
                onChangeText={setFeetText}
                placeholder="5"
                keyboardType="number-pad"
                accessibilityLabel="Height in feet"
                style={styles.input}
              />
              <Text style={styles.unitSuffix}>ft</Text>
            </View>
            <View style={styles.heightField}>
              <TextInput
                value={inchesText}
                onChangeText={setInchesText}
                placeholder="10"
                keyboardType="number-pad"
                accessibilityLabel="Height in inches"
                style={styles.input}
              />
              <Text style={styles.unitSuffix}>in</Text>
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Weight (lb)</Text>
          <TextInput
            value={weightText}
            onChangeText={setWeightText}
            placeholder="e.g. 150"
            keyboardType="number-pad"
            accessibilityLabel="Weight in pounds"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Waist (in) <Text style={styles.optional}>· Optional</Text></Text>
          <TextInput
            value={waistText}
            onChangeText={setWaistText}
            placeholder="e.g. 32"
            keyboardType="number-pad"
            accessibilityLabel="Waist in inches"
            style={styles.input}
          />
        </View>

        {error !== null ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={validateAndComplete}
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
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  field: {
    gap: px(tokens.light['--cb-space-2']),
  },
  label: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  optional: {
    color: resolveToken('light', '--cb-color-text-muted'),
    fontWeight: '400',
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
    flex: 1,
  },
  heightRow: {
    flexDirection: 'row',
    gap: px(tokens.light['--cb-space-3']),
  },
  heightField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(tokens.light['--cb-space-2']),
  },
  unitSuffix: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text-muted'),
    minWidth: 24,
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
