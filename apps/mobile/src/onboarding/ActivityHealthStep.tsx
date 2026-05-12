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
//  - console.log 등 PHI 값 출력 금지.
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
  '이 정보는 교육 목적으로 제공되며 의료 조언을 대체하지 않습니다. 의료 결정은 반드시 의사와 상의해주세요.';

const ACTIVITY_OPTIONS: ReadonlyArray<{ value: ActivityLevel; label: string; desc: string }> = [
  { value: 'sedentary', label: '거의 안 함', desc: '주로 앉아서 생활' },
  { value: 'light', label: '가벼움', desc: '주 1~3회 가벼운 운동' },
  { value: 'moderate', label: '보통', desc: '주 3~5회 적당한 운동' },
  { value: 'active', label: '활발', desc: '주 6~7회 활발한 운동' },
  { value: 'very_active', label: '매우 활발', desc: '매일 강한 운동 또는 육체 노동' },
];

const COMMON_ALLERGIES: ReadonlyArray<string> = [
  '땅콩', '견과류', '우유', '계란', '밀(글루텐)', '대두', '갑각류', '생선',
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
      setError('활동량을 선택해주세요.');
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="이전 단계">
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>4 / 6</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기">
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>활동량과 건강 정보</Text>
        <View
          accessibilityRole="alert"
          accessibilityLabel="건강 정보 면책 안내"
          style={styles.disclaimer}
        >
          <Text style={styles.disclaimerText}>⚠ {HEALTH_DISCLAIMER}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>일상 활동량</Text>
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
          <Text style={styles.label}>알러지 <Text style={styles.optional}>· 해당하는 것 모두</Text></Text>
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
          <Text style={styles.label}>의료 조건 <Text style={styles.optional}>· 콤마로 구분, 없으면 비워두세요</Text></Text>
          <TextInput
            value={conditionsText}
            onChangeText={setConditionsText}
            placeholder="예: 고혈압, 당뇨"
            accessibilityLabel="의료 조건"
            multiline
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>복용 중인 약 <Text style={styles.optional}>· 콤마로 구분, 없으면 비워두세요</Text></Text>
          <TextInput
            value={medicationsText}
            onChangeText={setMedicationsText}
            placeholder="예: 메트포민, 아스피린"
            accessibilityLabel="복용 중인 약"
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
