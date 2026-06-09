// 식단 생성 시트 — claim "Make my Plan" 전용 preset 컴팩트 바텀시트.
//
// 뉴스-우선 퍼널: 셀럽/다이어트 맥락은 claim 에서 이미 확정됐으므로 picker 없음 — 기간만 고른다.
// 흐름: getBaseDiet(initialBaseDietId)로 다이어트 맥락 표시 → 기간(1~maxDays) → generateMealPlan
//   → pollMealPlanUntilReady → onGenerated(planId). 1 credit = 1 day.
// 게이트(ClaimDetailScreen)는 잔여 크레딧 > 0 일 때만 시트를 연다. maxDays = min(7, 잔여).

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ZodError } from 'zod';

import type { schemas } from '@celebbase/shared-types';

import { ApiError } from '../lib/api-client';
import { getBaseDiet } from '../services/celebrities';
import {
  generateMealPlan,
  MealPlanPollError,
  pollMealPlanUntilReady,
} from '../services/meal-plans';
import { Button, Text, useTheme, type Theme } from '../ui';

interface MealPlanGenerateSheetProps {
  visible: boolean;
  /** 생성 가능한 최대 일수 = min(7, 잔여 크레딧). unlimited override 는 7. 시트가 [1,7] clamp. */
  maxDays: number;
  onClose: () => void;
  /** 생성+폴링 완료 후 호출 — 새 plan id. ClaimDetail 이 Plan 으로 착지시킨다. */
  onGenerated: (mealPlanId: string) => void;
  /**
   * claim 의 `base_diet_id`. 셀럽 맥락은 claim 에서 이미 자명 → picker 없이 이 diet 로 직행.
   * 시트는 이 id 로 base_diet 를 조회해 다이어트명/철학을 맥락으로 보여준다.
   */
  initialBaseDietId: string;
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
  initialBaseDietId,
}: MealPlanGenerateSheetProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const effectiveMax = Math.max(1, Math.min(7, maxDays));

  const [days, setDays] = useState(1);
  const [status, setStatus] = useState<SheetStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diet, setDiet] = useState<schemas.BaseDietWire | null>(null);

  // visibility 가 바뀔 때마다 in-flight run 을 무효화(runId 증가)하고, 열릴 때 상태 리셋.
  // 생성 중 닫기→재오픈 시 stale promise 의 setState/onGenerated 가 적용되지 않도록 한다.
  const runIdRef = useRef(0);
  useEffect(() => {
    runIdRef.current += 1;
    if (visible) {
      setDays(1);
      setStatus('idle');
      setErrorMsg(null);
    }
  }, [visible]);

  // 다이어트 맥락(best-effort 조인): 표시용이라 실패해도 생성은 base_diet_id 로 진행 → null 유지.
  // (MealPlanScreen.resolveBaseDietInfo 와 동일한 의도적 graceful degrade 패턴.)
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setDiet(null);
    getBaseDiet(initialBaseDietId)
      .then((res) => {
        if (!cancelled) setDiet(res.base_diet);
      })
      .catch(() => {
        /* 맥락 표시용 fetch — 실패 시 맥락만 생략(생성 경로엔 영향 없음). */
      });
    return (): void => {
      cancelled = true;
    };
  }, [visible, initialBaseDietId]);

  // maxDays(잔여 크레딧)가 시트 오픈 중 줄어들면 선택 days 를 clamp(서버 429 방어와 별개의 클라 안전장치).
  useEffect(() => {
    setDays((d) => Math.min(d, effectiveMax));
  }, [effectiveMax]);

  async function handleGenerate(): Promise<void> {
    // 새 시도마다 runId 를 올려, 직전 in-flight 시도(빠른 더블탭 등)를 무효화한다.
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    setStatus('submitting');
    setErrorMsg(null);

    try {
      const accept = await generateMealPlan({ base_diet_id: initialBaseDietId, duration_days: days });
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
  const dietContext = diet?.philosophy ?? diet?.description ?? null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* RN core Modal 은 별도 네이티브 뷰 트리라 루트 SafeAreaProvider inset 이 닿지 않는다 → 재선언. */}
      <SafeAreaProvider>
        <View style={styles.backdrop}>
          {/* scrim 탭 → 닫기. 생성 중에는 무시(실수 닫기 방지). */}
          <Pressable style={styles.scrim} onPress={submitting ? undefined : onClose} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text variant="h2">식단 만들기</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                disabled={submitting}
              >
                <Ionicons name="close" size={24} color={theme.color.textMuted} />
              </TouchableOpacity>
            </View>

            {/* claim 에서 온 base_diet 맥락 */}
            <View style={styles.dietCard}>
              {diet === null ? (
                <ActivityIndicator color={theme.color.brand} />
              ) : (
                <>
                  <Text variant="label" tone="brand">
                    이 식단으로
                  </Text>
                  <Text variant="h3" style={styles.dietName}>
                    {diet.name}
                  </Text>
                  {dietContext !== null ? (
                    <Text variant="bodySm" tone="muted" numberOfLines={2}>
                      {dietContext}
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            {/* 기간 */}
            <View style={styles.section}>
              <Text variant="label" tone="muted">
                기간
              </Text>
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
                      <Text
                        variant="metricMd"
                        tone={isSel ? 'brand' : 'default'}
                        style={styles.dayPillText}
                      >
                        {String(n)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text variant="bodySm" tone="muted">
                {String(days)}일 = {String(days)} 크레딧 사용
              </Text>
            </View>

            {errorMsg !== null ? (
              <Text variant="bodySm" tone="error">
                {errorMsg}
              </Text>
            ) : null}

            <View style={styles.generateWrap}>
              <Button
                label="생성하기"
                accessibilityLabel="Generate plan"
                loading={submitting}
                disabled={submitting}
                onPress={() => {
                  void handleGenerate();
                }}
              />
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    scrim: { flex: 1 },
    sheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(3),
      gap: theme.space(3),
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.border,
      marginBottom: theme.space(1),
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dietCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.md,
      padding: theme.space(3),
      gap: theme.space(1),
      minHeight: 84,
      justifyContent: 'center',
    },
    dietName: { fontFamily: theme.font.display },
    section: { gap: theme.space(2) },
    dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
    dayPill: {
      minWidth: 44,
      paddingVertical: theme.space(2),
      paddingHorizontal: theme.space(3),
      borderRadius: theme.radius.md,
      alignItems: 'center',
      borderWidth: 2,
    },
    dayPillSelected: { borderColor: theme.color.brand, backgroundColor: theme.color.brandSubtle },
    dayPillUnselected: { borderColor: 'transparent', backgroundColor: theme.color.surface },
    dayPillText: { fontWeight: theme.weight.semibold },
    generateWrap: { marginTop: theme.space(1), marginBottom: theme.space(2) },
  });
}
