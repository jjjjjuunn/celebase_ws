// 식단 생성 시트 — 화면 내 RN Modal (bottom-sheet 라이브러리 없음).
//
// 흐름: 셀럽 선택(CelebrityPicker 재사용) → 기간(1~maxDays 일) 선택 →
//   getCelebrityDiets(slug) 로 base_diet_id 해석 → generateMealPlan → pollMealPlanUntilReady
//   → 완료 시 onGenerated(planId). 1 credit = 1 day.
//
// 게이트(MealPlanScreen)는 잔여 크레딧 > 0 일 때만 시트를 연다. maxDays = min(7, 잔여).
// unlimited admin override 는 maxDays=7 로 전달. 시트는 maxDays 를 [1,7] 로 방어 clamp.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ZodError } from 'zod';

import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { CelebrityPicker } from './CelebrityPicker';
import { ApiError } from '../lib/api-client';
import { px, resolveToken } from '../lib/tokens';
import { getCelebrityDiets } from '../services/celebrities';
import {
  generateMealPlan,
  MealPlanPollError,
  pollMealPlanUntilReady,
} from '../services/meal-plans';

interface MealPlanGenerateSheetProps {
  visible: boolean;
  /** 생성 가능한 최대 일수 = min(7, 잔여 크레딧). unlimited override 는 7. 시트가 [1,7] clamp. */
  maxDays: number;
  onClose: () => void;
  /** 생성+폴링 완료 후 호출 — 새 plan id. 게이트가 닫기 + credits refresh + 해당 plan 선택. */
  onGenerated: (mealPlanId: string) => void;
}

type SheetStatus = 'idle' | 'submitting' | 'error';

function toGenerateErrorMessage(err: unknown): string {
  if (err instanceof MealPlanPollError) {
    return err.reason === 'failed'
      ? '생성에 실패했어요. 사용한 크레딧은 환불됩니다.'
      : '생성이 예상보다 오래 걸려요. 잠시 후 목록에서 확인해주세요.';
  }
  if (err instanceof ApiError) {
    return err.status === 429
      ? '크레딧이 부족해요. 다시 확인해주세요.'
      : '식단 생성 요청이 실패했어요. 잠시 후 다시 시도해주세요.';
  }
  if (err instanceof ZodError) {
    return '서버 응답 형식이 올바르지 않아요. 잠시 후 다시 시도해주세요.';
  }
  return '알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
}

export function MealPlanGenerateSheet({
  visible,
  maxDays,
  onClose,
  onGenerated,
}: MealPlanGenerateSheetProps): React.JSX.Element {
  const effectiveMax = Math.max(1, Math.min(7, maxDays));

  const [selected, setSelected] = useState<schemas.CelebrityWire | null>(null);
  const [days, setDays] = useState(1);
  const [status, setStatus] = useState<SheetStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // visibility 가 바뀔 때마다 in-flight run 을 무효화(runId 증가)하고, 열릴 때 상태 리셋.
  // 생성 중 닫기→재오픈 시 stale promise 의 setState/onGenerated 가 적용되지 않도록 한다.
  const runIdRef = useRef(0);
  useEffect(() => {
    runIdRef.current += 1;
    if (visible) {
      setSelected(null);
      setDays(1);
      setStatus('idle');
      setErrorMsg(null);
    }
  }, [visible]);

  // maxDays(잔여 크레딧) 가 시트 오픈 중 줄어들면 선택된 days 를 clamp — stale days 로
  // effectiveMax 초과 생성을 막는다(서버 429 방어와 별개의 클라 측 안전장치).
  useEffect(() => {
    setDays((d) => Math.min(d, effectiveMax));
  }, [effectiveMax]);

  async function handleGenerate(): Promise<void> {
    if (selected === null) return;
    // 새 시도마다 runId 를 올려, 직전 in-flight 시도(빠른 더블탭 등)를 무효화한다.
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    setStatus('submitting');
    setErrorMsg(null);

    try {
      const { diets } = await getCelebrityDiets(selected.slug);
      if (runIdRef.current !== myRun) return;
      if (diets.length === 0) {
        setStatus('error');
        setErrorMsg('이 셀럽은 아직 식단 데이터가 없어요. 다른 셀럽을 골라주세요.');
        return;
      }
      const baseDiet = diets[0];

      const accept = await generateMealPlan({ base_diet_id: baseDiet.id, duration_days: days });
      if (runIdRef.current !== myRun) return;

      const plan = await pollMealPlanUntilReady(accept.id);
      if (runIdRef.current !== myRun) return;

      onGenerated(plan.id);
    } catch (err: unknown) {
      if (runIdRef.current !== myRun) return;
      setStatus('error');
      setErrorMsg(toGenerateErrorMessage(err));
    }
  }

  const dayOptions = Array.from({ length: effectiveMax }, (_, i) => i + 1);
  const submitting = status === 'submitting';
  const canSubmit = selected !== null && !submitting;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>식단 만들기</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>셀럽 선택</Text>
        <View style={styles.pickerArea}>
          <CelebrityPicker
            selectedSlug={selected?.slug}
            onSelect={(celebrity) => {
              setSelected(celebrity);
            }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.sectionLabel}>기간</Text>
          <View style={styles.dayRow}>
            {dayOptions.map((n) => {
              const isSel = days === n;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => {
                    setDays(n);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${String(n)}일`}
                  accessibilityState={{ selected: isSel }}
                  style={[styles.dayPill, isSel ? styles.dayPillSelected : styles.dayPillUnselected]}
                >
                  <Text style={isSel ? styles.dayPillTextSelected : styles.dayPillText}>
                    {String(n)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.creditNote}>
            {String(days)}일 = {String(days)} 크레딧 사용
          </Text>

          {errorMsg !== null ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity
            onPress={() => {
              void handleGenerate();
            }}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Generate plan"
            accessibilityState={{ disabled: !canSubmit }}
            style={[styles.generateButton, canSubmit ? styles.generateActive : styles.generateDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color={resolveToken('light', '--cb-color-on-brand')} />
            ) : (
              <Text style={styles.generateText}>생성하기</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
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
  title: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text'),
  },
  closeButton: {
    fontSize: 24,
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  sectionLabel: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text-muted'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingBottom: px(tokens.light['--cb-space-2']),
  },
  pickerArea: {
    flex: 1,
  },
  footer: {
    padding: px(tokens.light['--cb-space-4']),
    borderTopWidth: 1,
    borderTopColor: resolveToken('light', '--cb-color-border'),
    gap: px(tokens.light['--cb-space-2']),
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: px(tokens.light['--cb-space-2']),
  },
  dayPill: {
    minWidth: 44,
    paddingVertical: px(tokens.light['--cb-space-2']),
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
  },
  dayPillSelected: {
    borderColor: resolveToken('light', '--cb-color-brand'),
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
  },
  dayPillUnselected: {
    borderColor: 'transparent',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  dayPillText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
  dayPillTextSelected: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
  },
  creditNote: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-error'),
  },
  generateButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    marginTop: px(tokens.light['--cb-space-2']),
  },
  generateActive: {
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  generateDisabled: {
    backgroundColor: resolveToken('light', '--cb-color-neutral-100'),
  },
  generateText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
});
