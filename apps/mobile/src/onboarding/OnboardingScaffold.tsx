// Shared chrome for every onboarding question screen.
//
// Centralizes the step indicator as a gold progress bar driven by the
// orchestrator — this is what fixes the old hardcoded "N / 3" counter bug
// structurally: screens no longer carry their own step number.
//
// One question per screen (premium health-app pattern): a focused title +
// optional subtitle + a single control + one primary action.

import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button, Text, useTheme, type Theme } from '../ui';

interface OnboardingScaffoldProps {
  /** 0-based index of the current step. */
  stepIndex: number;
  /** Total input steps (excludes the final reveal). */
  totalSteps: number;
  title: string;
  subtitle?: string;
  /** Omit to hide the back affordance (first step). */
  onBack?: () => void;
  onClose: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  /** Long content (chip grids, activity cards) scrolls; pickers stay static. */
  scroll?: boolean;
  /** Vertically center the control (tall pickers fill the space). Chips/inputs
   *  stay top-aligned by default so small clusters don't float mid-screen. */
  centerContent?: boolean;
  children: React.ReactNode;
}

export function OnboardingScaffold({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  onBack,
  onClose,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  scroll = false,
  centerContent = false,
  children,
}: OnboardingScaffoldProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const progressPct = Math.round((Math.min(stepIndex + 1, totalSteps) / totalSteps) * 100);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {onBack !== undefined ? (
              <TouchableOpacity
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={24} color={theme.color.text} />
              </TouchableOpacity>
            ) : null}
          </View>
          <View
            style={styles.progressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: totalSteps, now: Math.min(stepIndex + 1, totalSteps) }}
          >
            <View style={[styles.progressFill, { flex: progressPct }]} />
            <View style={{ flex: 100 - progressPct }} />
          </View>
          <View style={[styles.headerSide, styles.headerSideRight]}>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={theme.color.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.intro}>
          <Text variant="h1">{title}</Text>
          {subtitle !== undefined ? (
            <Text variant="body" tone="muted" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.staticBody, centerContent ? styles.staticBodyCenter : null]}>
            {children}
          </View>
        )}

        <View style={styles.footer}>
          <Button label={continueLabel} onPress={onContinue} disabled={continueDisabled} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(3),
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
    },
    headerSide: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
    headerSideRight: { alignItems: 'flex-end' },
    progressTrack: {
      flex: 1,
      flexDirection: 'row',
      height: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.border,
      overflow: 'hidden',
    },
    progressFill: { borderRadius: theme.radius.pill, backgroundColor: theme.color.gold },
    intro: {
      paddingHorizontal: theme.space(4),
      paddingTop: theme.space(2),
      paddingBottom: theme.space(4),
      gap: theme.space(2),
    },
    subtitle: { lineHeight: theme.type.body * 1.5 },
    // Default: content flows from just under the question (premium one-question
    // pattern — Noom/Cal AI), CTA anchored at the bottom. Small chip clusters no
    // longer float dead-center. Tall controls (pickers) opt into centering.
    staticBody: { flex: 1, paddingTop: theme.space(2), paddingHorizontal: theme.space(4) },
    staticBodyCenter: { justifyContent: 'center', paddingTop: 0 },
    scrollBody: {
      flexGrow: 1,
      paddingTop: theme.space(2),
      paddingHorizontal: theme.space(4),
      paddingBottom: theme.space(6),
      gap: theme.space(4),
    },
    footer: {
      padding: theme.space(4),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
}
