// S7 — Reveal & 최종 POST. fail-closed.
//
// 단일 POST `/api/users/me/bio-profile` 로 모든 입력 (비-PHI + PHI) 전송.
// PHI 감사 로그도 한 번만 발생. 실패 시 (특히 audit log fail) 사용자에게
// 명확한 에러 + 재시도 — silent fallback 절대 금지 (spec.md §9.3).

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ApiError } from '../lib/api-client';
import { draftToBioProfileBody, saveBioProfile } from '../services/bio-profile';
import { Button, Text, useTheme, type Theme } from '../ui';
import type { OnboardingDraftComplete } from './types';

interface RevealStepProps {
  draft: OnboardingDraftComplete;
  onDone: () => void;
  onBack: () => void;
}

type Phase = { state: 'saving' } | { state: 'success' } | { state: 'error'; message: string };

export function RevealStep({ draft, onDone, onBack }: RevealStepProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        const message =
          err instanceof ApiError
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
        const message =
          err instanceof ApiError ? `Couldn't save your profile (${String(err.status)}).` : 'Network error.';
        setPhase({ state: 'error', message });
      });
  }

  if (phase.state === 'saving') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.color.brand} />
        <Text variant="body" tone="muted">
          Saving your profile...
        </Text>
      </SafeAreaView>
    );
  }

  if (phase.state === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text variant="h2" tone="error">
            Save failed
          </Text>
          <Text variant="body" center>
            {phase.message}
          </Text>
        </View>
        <View style={styles.footer}>
          <Button label="Try again" onPress={retry} />
          <Button label="Go back" variant="secondary" onPress={onBack} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <Ionicons name="sparkles" size={56} color={theme.color.gold} />
        <Text variant="h1" tone="brand" center>
          You&apos;re all set!
        </Text>
        <Text variant="body" center>
          We&apos;re preparing your personalized celebrity-inspired plan. See you on the inside.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Go to home" onPress={onDone} />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space(4),
      gap: theme.space(3),
    },
    footer: { padding: theme.space(4), gap: theme.space(2) },
  });
}
