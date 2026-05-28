// 식단 생성 시트 — 화면 내 RN Modal (bottom-sheet 라이브러리 없음).
//
// 흐름: 셀럽 선택(CelebrityPicker 재사용) → 기간(1~maxDays 일) 선택 →
//   getCelebrityDiets(slug) 로 base_diet_id 해석 → generateMealPlan → pollMealPlanUntilReady
//   → 완료 시 onGenerated(planId). 1 credit = 1 day.
//
// 게이트(MealPlanScreen)는 잔여 크레딧 > 0 일 때만 시트를 연다. maxDays = min(7, 잔여).
// unlimited admin override 는 maxDays=7 로 전달. 시트는 maxDays 를 [1,7] 로 방어 clamp.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ZodError } from 'zod';

import type { schemas } from '@celebbase/shared-types';

import { ApiError } from '../lib/api-client';
import { getCelebrityDiets } from '../services/celebrities';
import {
  generateMealPlan,
  MealPlanPollError,
  pollMealPlanUntilReady,
} from '../services/meal-plans';
import { Button, Text, useTheme, type Theme } from '../ui';
import { CelebrityPicker } from './CelebrityPicker';

interface MealPlanGenerateSheetProps {
  visible: boolean;
  /** 생성 가능한 최대 일수 = min(7, 잔여 크레딧). unlimited override 는 7. 시트가 [1,7] clamp. */
  maxDays: number;
  onClose: () => void;
  /** 생성+폴링 완료 후 호출 — 새 plan id. 게이트가 닫기 + credits refresh + 해당 plan 선택. */
  onGenerated: (mealPlanId: string) => void;
  /**
   * News claim 진입점: claim 의 `base_diet_id` 를 그대로 사용해 셀럽 picker 단계를
   * 스킵한다(claim 에서 셀럽 맥락은 이미 자명). 없으면 기본 picker 경로로 돌아간다.
   * IMPL-MOBILE-CLAIM-CTA-001 — News→meal-plan 척추 wiring.
   */
  initialBaseDietId?: string;
  /** initialBaseDietId 동반 — 시트 헤더/푸터에 "이 셀럽처럼" 표시용. UI only. */
  initialCelebrityName?: string;
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
  initialCelebrityName,
}: MealPlanGenerateSheetProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const effectiveMax = Math.max(1, Math.min(7, maxDays));
  // News-claim 경로: base_diet_id 가 주어지면 picker 를 숨기고 그 diet 로 직행한다.
  const presetMode = initialBaseDietId !== undefined;

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
    // 두 진입점 분기: News claim (initialBaseDietId 직행) vs picker (셀럽 → diet 해석).
    if (initialBaseDietId === undefined && selected === null) return;
    // 새 시도마다 runId 를 올려, 직전 in-flight 시도(빠른 더블탭 등)를 무효화한다.
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    setStatus('submitting');
    setErrorMsg(null);

    try {
      let baseDietId: string;
      if (initialBaseDietId !== undefined) {
        baseDietId = initialBaseDietId;
      } else if (selected !== null) {
        const { diets } = await getCelebrityDiets(selected.slug);
        if (runIdRef.current !== myRun) return;
        if (diets.length === 0) {
          setStatus('error');
          setErrorMsg('이 셀럽은 아직 식단 데이터가 없어요. 다른 셀럽을 골라주세요.');
          return;
        }
        baseDietId = diets[0].id;
      } else {
        return;
      }

      const accept = await generateMealPlan({ base_diet_id: baseDietId, duration_days: days });
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
  // preset 모드는 picker 없이도 즉시 submit 가능; picker 모드는 selected 필수.
  const canSubmit = (presetMode || selected !== null) && !submitting;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* RN core Modal 은 별도 네이티브 뷰 트리라 루트 SafeAreaProvider 의 inset 이
          닿지 않는다 → 안에서 다시 provider 를 깔아야 헤더가 상태바 밑으로 내려온다. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text variant="h1">식단 만들기</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={theme.color.textMuted} />
            </TouchableOpacity>
          </View>

          {presetMode ? (
            <View style={styles.presetArea}>
              <Text variant="label" tone="muted" style={styles.sectionLabel}>
                셀럽
              </Text>
              <Text variant="h3" style={styles.presetName}>
                {initialCelebrityName ?? '이 셀럽'}처럼 먹기
              </Text>
            </View>
          ) : (
            <>
              <Text variant="label" tone="muted" style={styles.sectionLabel}>
                셀럽 선택
              </Text>
              <View style={styles.pickerArea}>
                <CelebrityPicker
                  selectedSlug={selected?.slug}
                  onSelect={(celebrity) => {
                    setSelected(celebrity);
                  }}
                />
              </View>
            </>
          )}

          <View style={styles.footer}>
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
                    <Text variant="metricMd" tone={isSel ? 'brand' : 'default'} style={styles.dayPillText}>
                      {String(n)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text variant="bodySm" tone="muted">
              {String(days)}일 = {String(days)} 크레딧 사용
            </Text>

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
                disabled={!canSubmit}
                onPress={() => {
                  void handleGenerate();
                }}
              />
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
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
    sectionLabel: { paddingHorizontal: theme.space(4), paddingBottom: theme.space(2) },
    pickerArea: { flex: 1 },
    presetArea: { flex: 1, paddingHorizontal: theme.space(4), gap: theme.space(2) },
    presetName: { paddingTop: theme.space(1) },
    footer: {
      padding: theme.space(4),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      gap: theme.space(2),
    },
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
    generateWrap: { marginTop: theme.space(2) },
  });
}
