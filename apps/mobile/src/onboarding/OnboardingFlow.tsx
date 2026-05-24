// Onboarding — linear one-question-per-screen wizard (premium health-app
// pattern: Noom / Oura / Cal AI). The orchestrator owns the step index and a
// single flat draft; each step renders one focused control inside the shared
// OnboardingScaffold (which draws the gold progress bar — there is no more
// per-screen "N / 3" counter to drift).
//
// PHI safety: the draft is in-memory only. The single bio-profile POST happens
// once, in RevealStep. medical_conditions is NOT collected (see types.ts);
// medications is reduced to a GLP-1 yes/no that the engine consumes.

import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import type { ActivityLevel, DietType, PrimaryGoal, Sex, schemas } from '@celebbase/shared-types';

import { DrumPicker } from '../components/DrumPicker';
import { OptionChips, type ChipOption } from '../components/OptionChips';
import { buildBioProfileBody } from '../services/bio-profile';
import { Text, useTheme, type Theme } from '../ui';
import { OnboardingScaffold } from './OnboardingScaffold';
import { RevealStep } from './RevealStep';
import { EMPTY_DRAFT, type OnboardingDraft } from './types';

interface OnboardingFlowProps {
  /** S10 reveal 의 "홈으로" 호출 시점 — 메인 탭으로 복귀. */
  onDone: () => void;
  /** 어느 단계든 ✕ 닫기 시 호출. */
  onClose: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = 1920;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 13; // 만 13세 이상 (COPPA)
const DEFAULT_BIRTH_YEAR = 1995;

const SEX_OPTIONS: ReadonlyArray<ChipOption<Sex>> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const ACTIVITY_OPTIONS: ReadonlyArray<{ value: ActivityLevel; label: string; desc: string }> = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Mostly sitting, little to no exercise' },
  { value: 'light', label: 'Light', desc: 'Light exercise 1–3 days/week' },
  { value: 'moderate', label: 'Moderate', desc: 'Moderate exercise 3–5 days/week' },
  { value: 'active', label: 'Active', desc: 'Hard exercise 6–7 days/week' },
  { value: 'very_active', label: 'Very active', desc: 'Intense daily training or physical labor' },
];

const COMMON_ALLERGIES: ReadonlyArray<string> = [
  'Peanuts',
  'Tree nuts',
  'Milk',
  'Eggs',
  'Wheat (gluten)',
  'Soy',
  'Shellfish',
  'Fish',
];

const GLP1_OPTIONS: ReadonlyArray<ChipOption<'yes' | 'no'>> = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes, I take one' },
];

const PRIMARY_GOAL_OPTIONS: ReadonlyArray<ChipOption<PrimaryGoal>> = [
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

const DIET_TYPE_OPTIONS: ReadonlyArray<ChipOption<DietType>> = [
  { value: 'omnivore', label: 'Omnivore (no restrictions)' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
];

const INPUT_STEP_COUNT = 10;

export function OnboardingFlow({ onDone, onClose }: OnboardingFlowProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [revealBody, setRevealBody] = useState<schemas.CreateBioProfileRequest | null>(null);

  function patch(p: Partial<OnboardingDraft>): void {
    setDraft((d) => ({ ...d, ...p }));
  }
  function toggleInArray(key: 'allergies' | 'secondary_goals', value: string): void {
    setDraft((d) => {
      const arr = d[key];
      return { ...d, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  }

  function goBack(): void {
    setStepIndex((i) => Math.max(0, i - 1));
  }
  function goNext(): void {
    if (stepIndex < INPUT_STEP_COUNT - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    // Last input step → build the body once and advance to reveal. A null result
    // means a required field is missing (should not happen — steps gate it); stay.
    const body = buildBioProfileBody(draft);
    if (body !== null) {
      setRevealBody(body);
      setStepIndex(INPUT_STEP_COUNT);
    }
  }

  // S10 — Reveal (single POST + editorial completion).
  if (stepIndex >= INPUT_STEP_COUNT && revealBody !== null) {
    return (
      <RevealStep
        body={revealBody}
        greetingName={draft.display_name}
        onDone={onDone}
        onBack={() => {
          setStepIndex(INPUT_STEP_COUNT - 1);
        }}
      />
    );
  }

  // Shared scaffold props. Back is hidden on the first step (only ✕ exits).
  const common = { stepIndex, totalSteps: INPUT_STEP_COUNT, onClose, onContinue: goNext };
  const backProps = stepIndex === 0 ? {} : { onBack: goBack };

  switch (stepIndex) {
    case 0:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          title="What should we call you?"
          subtitle="We'll use this to personalize your experience."
          continueDisabled={draft.display_name.trim() === ''}
        >
          <TextInput
            value={draft.display_name}
            onChangeText={(t) => {
              patch({ display_name: t });
            }}
            placeholder="e.g. Alex"
            placeholderTextColor={theme.color.textMuted}
            accessibilityLabel="Name"
            style={styles.input}
            returnKeyType="done"
          />
        </OnboardingScaffold>
      );

    case 1:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          title="When were you born?"
          subtitle="Used to tailor your nutrition targets."
          continueDisabled={draft.birth_year === undefined}
        >
          <View style={styles.pickerWrap}>
            <DrumPicker
              min={MIN_BIRTH_YEAR}
              max={MAX_BIRTH_YEAR}
              defaultValue={DEFAULT_BIRTH_YEAR}
              value={draft.birth_year}
              onChange={(v) => {
                patch({ birth_year: v });
              }}
              accessibilityLabel="Birth year"
            />
          </View>
        </OnboardingScaffold>
      );

    case 2:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          title="What's your sex?"
          subtitle="This affects your calorie and macro calculations."
          continueDisabled={draft.sex === undefined}
        >
          <OptionChips
            options={SEX_OPTIONS}
            selected={draft.sex !== undefined ? [draft.sex] : []}
            onToggle={(v) => {
              patch({ sex: v });
            }}
          />
        </OnboardingScaffold>
      );

    case 3:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          title="How tall are you?"
          continueDisabled={draft.height_ft === undefined || draft.height_in === undefined}
        >
          <View style={styles.dualPicker}>
            <View style={styles.pickerCol}>
              <Text variant="label" tone="muted" center style={styles.pickerLabel}>
                Feet
              </Text>
              <DrumPicker
                min={3}
                max={8}
                defaultValue={5}
                visibleCount={3}
                value={draft.height_ft}
                onChange={(v) => {
                  patch({ height_ft: v });
                }}
                accessibilityLabel="Height in feet"
              />
            </View>
            <View style={styles.pickerCol}>
              <Text variant="label" tone="muted" center style={styles.pickerLabel}>
                Inches
              </Text>
              <DrumPicker
                min={0}
                max={11}
                defaultValue={8}
                visibleCount={3}
                value={draft.height_in}
                onChange={(v) => {
                  patch({ height_in: v });
                }}
                accessibilityLabel="Height in inches"
              />
            </View>
          </View>
        </OnboardingScaffold>
      );

    case 4:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          title="What's your weight?"
          subtitle="In pounds (lb)."
          continueDisabled={draft.weight_lb === undefined}
        >
          <View style={styles.pickerWrap}>
            <DrumPicker
              min={66}
              max={660}
              defaultValue={150}
              value={draft.weight_lb}
              onChange={(v) => {
                patch({ weight_lb: v });
              }}
              accessibilityLabel="Weight in pounds"
            />
          </View>
        </OnboardingScaffold>
      );

    case 5:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          scroll
          title="How active are you?"
          continueDisabled={draft.activity_level === undefined}
        >
          <View style={styles.activityList}>
            {ACTIVITY_OPTIONS.map((opt) => {
              const active = draft.activity_level === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    patch({ activity_level: opt.value });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.activityRow, active ? styles.activityRowActive : null]}
                >
                  <Text variant="body" tone={active ? 'brand' : 'default'} style={styles.activityLabel}>
                    {opt.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {opt.desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </OnboardingScaffold>
      );

    case 6:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          scroll
          title="Any allergies?"
          subtitle="We'll never include these in your plans. Skip if none."
        >
          <OptionChips
            options={COMMON_ALLERGIES.map((a) => ({ value: a, label: a }))}
            selected={draft.allergies}
            onToggle={(v) => {
              toggleInArray('allergies', v);
            }}
          />
        </OnboardingScaffold>
      );

    case 7:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          title="GLP-1 medication?"
          subtitle="e.g. Ozempic, Wegovy, Mounjaro, Zepbound. If so, we raise your protein target to protect lean mass."
          continueDisabled={draft.has_glp1 === undefined}
        >
          <OptionChips
            options={GLP1_OPTIONS}
            selected={draft.has_glp1 === undefined ? [] : [draft.has_glp1 ? 'yes' : 'no']}
            onToggle={(v) => {
              patch({ has_glp1: v === 'yes' });
            }}
          />
        </OnboardingScaffold>
      );

    case 8:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          scroll
          title="What's your main goal?"
          continueDisabled={draft.primary_goal === undefined}
        >
          <OptionChips
            options={PRIMARY_GOAL_OPTIONS}
            selected={draft.primary_goal !== undefined ? [draft.primary_goal] : []}
            onToggle={(v) => {
              patch({ primary_goal: v });
            }}
          />
        </OnboardingScaffold>
      );

    case 9:
      return (
        <OnboardingScaffold
          {...common}
          {...backProps}
          scroll
          title="Any preferences?"
          subtitle="Optional — these fine-tune your plan."
          continueLabel="Finish"
        >
          <View style={styles.field}>
            <Text variant="label" tone="muted">
              Other goals
            </Text>
            <OptionChips
              options={SECONDARY_GOAL_OPTIONS.map((g) => ({ value: g, label: g }))}
              selected={draft.secondary_goals}
              onToggle={(v) => {
                toggleInArray('secondary_goals', v);
              }}
            />
          </View>
          <View style={styles.field}>
            <Text variant="label" tone="muted">
              Diet type
            </Text>
            <OptionChips
              options={DIET_TYPE_OPTIONS}
              selected={draft.diet_type !== null ? [draft.diet_type] : []}
              onToggle={(v) => {
                setDraft((d) => ({ ...d, diet_type: d.diet_type === v ? null : v }));
              }}
            />
          </View>
        </OnboardingScaffold>
      );

    default:
      return <></>;
  }
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    // Editorial input — borderless with a single gold underline + large type,
    // not a boxed field. Premium register matching the rest of onboarding.
    input: {
      paddingVertical: theme.space(3),
      fontSize: theme.type.h3,
      fontFamily: theme.font.body,
      color: theme.color.text,
      borderBottomWidth: 1.5,
      borderBottomColor: theme.color.gold,
    },
    pickerWrap: { paddingTop: theme.space(2) },
    dualPicker: { flexDirection: 'row', gap: theme.space(4), paddingTop: theme.space(2) },
    pickerCol: { flex: 1, gap: theme.space(2) },
    pickerLabel: { letterSpacing: 1 },
    activityList: { gap: theme.space(2) },
    activityRow: {
      padding: theme.space(3),
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      borderWidth: 2,
      borderColor: 'transparent',
      gap: 2,
    },
    activityRowActive: { borderColor: theme.color.brand, backgroundColor: theme.color.brandSubtle },
    activityLabel: { fontWeight: theme.weight.semibold },
    field: { gap: theme.space(2) },
  });
}
