// S4 — Body Metrics. Height / weight / waist (optional).
// 비-PHI (spec.md §9.3 PHI 정의는 biomarkers / medical_conditions / medications).
// 단위: 입력은 imperial (ft+in, lb, in) — US 시장 default. BE 전송 전 metric (cm/kg) 변환.

import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text, useTheme, type Theme } from '../ui';
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          <Text tone="brand" style={styles.navIcon}>
            ←
          </Text>
        </TouchableOpacity>
        <Text variant="bodySm" tone="muted" style={styles.stepLabel}>
          3 / 3
        </Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text tone="muted" style={styles.navIcon}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text variant="h1">Your body metrics</Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          Used to calculate BMR / TDEE. We&apos;ll ask about medical info separately in the next
          step.
        </Text>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Height
          </Text>
          <View style={styles.heightRow}>
            <View style={styles.heightField}>
              <TextInput
                value={feetText}
                onChangeText={setFeetText}
                placeholder="5"
                placeholderTextColor={theme.color.textMuted}
                keyboardType="number-pad"
                accessibilityLabel="Height in feet"
                style={styles.input}
              />
              <Text variant="body" tone="muted" style={styles.unitSuffix}>
                ft
              </Text>
            </View>
            <View style={styles.heightField}>
              <TextInput
                value={inchesText}
                onChangeText={setInchesText}
                placeholder="10"
                placeholderTextColor={theme.color.textMuted}
                keyboardType="number-pad"
                accessibilityLabel="Height in inches"
                style={styles.input}
              />
              <Text variant="body" tone="muted" style={styles.unitSuffix}>
                in
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Weight (lb)
          </Text>
          <TextInput
            value={weightText}
            onChangeText={setWeightText}
            placeholder="e.g. 150"
            placeholderTextColor={theme.color.textMuted}
            keyboardType="number-pad"
            accessibilityLabel="Weight in pounds"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text variant="bodySm" style={styles.label}>
            Waist (in){' '}
            <Text variant="bodySm" tone="muted" style={styles.optional}>
              · Optional
            </Text>
          </Text>
          <TextInput
            value={waistText}
            onChangeText={setWaistText}
            placeholder="e.g. 32"
            placeholderTextColor={theme.color.textMuted}
            keyboardType="number-pad"
            accessibilityLabel="Waist in inches"
            style={styles.input}
          />
        </View>

        {error !== null ? (
          <Text variant="bodySm" tone="error">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button label="Continue" onPress={validateAndComplete} />
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
    subtitle: { marginTop: -theme.space(3), lineHeight: theme.type.body + 6 },
    field: { gap: theme.space(2) },
    label: { fontWeight: theme.weight.semibold },
    optional: { fontWeight: theme.weight.regular },
    input: {
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space(3),
      paddingVertical: theme.space(3),
      fontSize: theme.type.body,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
      flex: 1,
    },
    heightRow: { flexDirection: 'row', gap: theme.space(3) },
    heightField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    unitSuffix: { fontWeight: theme.weight.semibold, minWidth: 24 },
    footer: {
      padding: theme.space(4),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
}
