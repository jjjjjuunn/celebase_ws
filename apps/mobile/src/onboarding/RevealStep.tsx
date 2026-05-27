// S7 — Reveal & 최종 POST. fail-closed.
//
// 단일 POST `/api/users/me/bio-profile` 로 모든 입력 (비-PHI + PHI) 전송.
// PHI 감사 로그도 한 번만 발생. 실패 시 (특히 audit log fail) 사용자에게
// 명확한 에러 + 재시도 — silent fallback 절대 금지 (spec.md §9.3).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { schemas } from '@celebbase/shared-types';

import { ApiError } from '../lib/api-client';
import { saveBioProfile } from '../services/bio-profile';
import { updateMe } from '../services/users';
import { Button, Text, useTheme, type Theme } from '../ui';

interface RevealStepProps {
  /** Prebuilt bio-profile body (stable reference — built once by the flow). */
  body: schemas.CreateBioProfileRequest;
  /** First name for the greeting; omitted → generic copy. */
  greetingName?: string;
  onDone: () => void;
  onBack: () => void;
}

type Phase = { state: 'saving' } | { state: 'success' } | { state: 'error'; message: string };

export function RevealStep({ body, greetingName, onDone, onBack }: RevealStepProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [phase, setPhase] = useState<Phase>({ state: 'saving' });

  // Persist the bio-profile (critical) then best-effort the onboarding-entered
  // name (IMPL-MOBILE-SIGNUP-DISPLAYNAME-001 — signup no longer collects it; the
  // "What should we call you?" step feeds `greetingName`). A failed name PATCH
  // must NOT block entry: the profile (the important write) already succeeded and
  // the user can set the name later in EditProfile.
  const persist = useCallback(async (): Promise<void> => {
    await saveBioProfile(body);
    const name = greetingName?.trim();
    if (name !== undefined && name !== '') {
      try {
        await updateMe({ display_name: name });
      } catch (e) {
        if (process.env['NODE_ENV'] !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[onboarding] display_name persist failed (non-fatal):', e);
        }
      }
    }
  }, [body, greetingName]);

  useEffect(() => {
    let cancelled = false;
    setPhase({ state: 'saving' });

    persist()
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
  }, [persist]);

  function retry(): void {
    setPhase({ state: 'saving' });
    persist()
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

  // Editorial completion moment — no celebratory glyph (sparkles/confetti read
  // as an AI cliché). A thin gold rule + small-caps kicker + Fraunces headline
  // carries the premium register of the rest of the app.
  const headline =
    greetingName !== undefined && greetingName.trim() !== ''
      ? `You're all set, ${greetingName.trim()}`
      : "You're all set";
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <View style={styles.rule} />
        <Text variant="label" tone="brand" center style={styles.kicker}>
          Welcome
        </Text>
        <Text variant="h1" center numberOfLines={2}>
          {headline}
        </Text>
        <Text variant="body" tone="muted" center style={styles.dek}>
          We&apos;re preparing your personalized, celebrity-inspired plan. See you on the inside.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Enter Celebase" onPress={onDone} />
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
    rule: { width: 48, height: 1, backgroundColor: theme.color.gold },
    kicker: { letterSpacing: 1.5 },
    dek: { paddingHorizontal: theme.space(4), lineHeight: theme.type.body * 1.6 },
    footer: { padding: theme.space(4), gap: theme.space(2) },
  });
}
