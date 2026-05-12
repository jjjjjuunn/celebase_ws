// S7 — Reveal & 최종 POST. fail-closed.
//
// 단일 POST `/api/users/me/bio-profile` 로 모든 입력 (비-PHI + PHI) 전송.
// PHI 감사 로그도 한 번만 발생. 실패 시 (특히 audit log fail) 사용자에게
// 명확한 에러 + 재시도 — silent fallback 절대 금지 (spec.md §9.3).

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';

import { ApiError } from '../lib/api-client';
import { px, resolveToken } from '../lib/tokens';
import { draftToBioProfileBody, saveBioProfile } from '../services/bio-profile';
import type { OnboardingDraftComplete } from './types';

interface RevealStepProps {
  draft: OnboardingDraftComplete;
  onDone: () => void;
  onBack: () => void;
}

type Phase =
  | { state: 'saving' }
  | { state: 'success' }
  | { state: 'error'; message: string };

export function RevealStep({ draft, onDone, onBack }: RevealStepProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ state: 'saving' });

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'saving' });

    const body = draftToBioProfileBody(draft);
    saveBioProfile(body)
      .then(() => {
        if (cancelled) return;
        setPhase({ state: 'success' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // PHI 안전: err.message 만 노출 (PHI 입력값은 절대 메시지에 포함 X).
        const message = err instanceof ApiError
          ? `저장에 실패했습니다 (${String(err.status)}).`
          : '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        setPhase({ state: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, [draft]);

  function retry(): void {
    setPhase({ state: 'saving' });
    const body = draftToBioProfileBody(draft);
    saveBioProfile(body)
      .then(() => {
        setPhase({ state: 'success' });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError
          ? `저장에 실패했습니다 (${String(err.status)}).`
          : '네트워크 오류가 발생했습니다.';
        setPhase({ state: 'error', message });
      });
  }

  if (phase.state === 'saving') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        <Text style={styles.savingText}>프로필을 저장하는 중...</Text>
      </View>
    );
  }

  if (phase.state === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>저장 실패</Text>
          <Text style={styles.errorBody}>{phase.message}</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>다시 시도</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="이전 단계로 돌아가기"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>이전 단계로</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.centered}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>설정 완료!</Text>
        <Text style={styles.successBody}>
          입력하신 정보로 셀럽 맞춤 식단을 준비합니다. 곧 만나보세요.
        </Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="홈으로"
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>홈으로</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: resolveToken('light', '--cb-color-bg') },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-3']),
  },
  savingText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  successEmoji: { fontSize: 64 },
  successTitle: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-brand'),
  },
  successBody: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  errorTitle: {
    fontSize: px(tokens.light['--cb-display-md']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-error'),
  },
  errorBody: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    textAlign: 'center',
  },
  footer: {
    padding: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-2']),
  },
  primaryButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-brand-bg'),
  },
  primaryButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-on-brand'),
  },
  secondaryButton: {
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: resolveToken('light', '--cb-color-surface'),
  },
  secondaryButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
  },
});
