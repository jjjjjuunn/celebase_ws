// S4 — Body Metrics. 키 / 몸무게 / 허리둘레 (optional).
// 비-PHI (spec.md §9.3 PHI 정의는 biomarkers / medical_conditions / medications).
// 단위: metric 만 (kg / cm). imperial 토글은 후속 chore.

import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';
import type { BodyMetricsDraft } from './types';

interface BodyMetricsStepProps {
  initial?: BodyMetricsDraft;
  onComplete: (draft: BodyMetricsDraft) => void;
  onBack: () => void;
  onClose: () => void;
}

export function BodyMetricsStep({
  initial,
  onComplete,
  onBack,
  onClose,
}: BodyMetricsStepProps): React.JSX.Element {
  const [heightText, setHeightText] = useState(
    initial?.height_cm !== undefined ? String(initial.height_cm) : '',
  );
  const [weightText, setWeightText] = useState(
    initial?.weight_kg !== undefined ? String(initial.weight_kg) : '',
  );
  const [waistText, setWaistText] = useState(
    initial?.waist_cm !== undefined ? String(initial.waist_cm) : '',
  );
  const [error, setError] = useState<string | null>(null);

  function validateAndComplete(): void {
    const height = Number.parseFloat(heightText);
    if (Number.isNaN(height) || height < 100 || height > 250) {
      setError('키는 100–250cm 사이여야 합니다.');
      return;
    }
    const weight = Number.parseFloat(weightText);
    if (Number.isNaN(weight) || weight < 30 || weight > 300) {
      setError('몸무게는 30–300kg 사이여야 합니다.');
      return;
    }
    let waistValue: number | undefined;
    if (waistText.trim() !== '') {
      const waist = Number.parseFloat(waistText);
      if (Number.isNaN(waist) || waist < 40 || waist > 200) {
        setError('허리둘레는 40–200cm 사이여야 합니다.');
        return;
      }
      waistValue = waist;
    }
    setError(null);
    const draft: BodyMetricsDraft = { height_cm: height, weight_kg: weight };
    if (waistValue !== undefined) draft.waist_cm = waistValue;
    onComplete(draft);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="이전 단계">
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>3 / 3</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>신체 정보를 알려주세요</Text>
        <Text style={styles.subtitle}>
          BMR / TDEE 계산에 사용됩니다. 의료 정보는 다음 단계에서 별도로 묻습니다.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>키 (cm)</Text>
          <TextInput
            value={heightText}
            onChangeText={setHeightText}
            placeholder="예: 170"
            keyboardType="decimal-pad"
            accessibilityLabel="키"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>몸무게 (kg)</Text>
          <TextInput
            value={weightText}
            onChangeText={setWeightText}
            placeholder="예: 65"
            keyboardType="decimal-pad"
            accessibilityLabel="몸무게"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>허리둘레 (cm) <Text style={styles.optional}>· 선택</Text></Text>
          <TextInput
            value={waistText}
            onChangeText={setWaistText}
            placeholder="예: 80"
            keyboardType="decimal-pad"
            accessibilityLabel="허리둘레"
            style={styles.input}
          />
        </View>

        {error !== null ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={validateAndComplete}
          accessibilityRole="button"
          accessibilityLabel="입력 완료"
          style={styles.nextButton}
        >
          <Text style={styles.nextButtonText}>완료</Text>
        </TouchableOpacity>
      </View>
    </View>
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
