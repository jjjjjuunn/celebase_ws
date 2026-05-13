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
import { SafeAreaView } from 'react-native-safe-area-context';

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
          ? `Couldn't save your profile (${String(err.status)}).`
          : 'Network error. Please try again in a moment.';
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
          ? `Couldn't save your profile (${String(err.status)}).`
          : 'Network error.';
        setPhase({ state: 'error', message });
      });
  }

  if (phase.state === 'saving') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        <Text style={styles.savingText}>Saving your profile...</Text>
      </SafeAreaView>
    );
  }

  if (phase.state === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Save failed</Text>
          <Text style={styles.errorBody}>{phase.message}</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>You're all set!</Text>
        <Text style={styles.successBody}>
          We're preparing your personalized celebrity-inspired plan. See you on the inside.
        </Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Go to home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
