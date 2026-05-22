// Wellness claim 상세 — feed 카드 탭 시 진입. 전문 + 출처 목록 + 면책 + CTA.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { schemas } from '@celebbase/shared-types';

import { ClaimCard } from '../components/ClaimCard';
import { isAllowedSourceUrl } from '../lib/url-allowlist';
import { getClaim } from '../services/claims';
import { EmptyState, Text, useTheme, type Theme } from '../ui';

interface ClaimDetailScreenProps {
  claimId: string;
  onBack: () => void;
}

type DetailState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'loaded'; data: schemas.LifestyleClaimDetailResponse };

const HEALTH_DISCLAIMER =
  'This information is for educational purposes only and is not intended as medical advice. Consult a physician for medical decisions.';

export function ClaimDetailScreen({ claimId, onBack }: ClaimDetailScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [state, setState] = useState<DetailState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });

    getClaim(claimId)
      .then((data) => {
        if (cancelled) return;
        setState({ phase: 'loaded', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown';
        setState({ phase: 'error', message });
      });

    return (): void => {
      cancelled = true;
    };
  }, [claimId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}
        >
          <Text variant="body" tone="brand" style={styles.backButtonText}>
            ← Back
          </Text>
        </TouchableOpacity>
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.color.brand} />
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.centered}>
          <EmptyState glyph="⚠️" title="Couldn't load this claim." body="잠시 후 다시 시도해주세요." />
        </View>
      ) : (
        <DetailBody data={state.data} />
      )}
    </SafeAreaView>
  );
}

interface DetailBodyProps {
  data: schemas.LifestyleClaimDetailResponse;
}

function DetailBody({ data }: DetailBodyProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { claim, sources } = data;
  const primarySource = sources.find((s) => s.is_primary);
  const showDisclaimer = claim.trust_grade === 'D' || claim.is_health_claim;
  const showInspiredCta = claim.base_diet_id !== null;

  return (
    <ScrollView contentContainerStyle={styles.bodyScroll}>
      <ClaimCard claim={claim} primarySource={primarySource} />

      {claim.body !== null && claim.body !== '' ? (
        <Text variant="body" style={styles.bodyText}>
          {claim.body}
        </Text>
      ) : null}

      <View style={styles.sourcesSection}>
        <Text variant="bodySm" tone="muted" style={styles.sectionTitle}>
          Sources
        </Text>
        {sources.length === 0 ? (
          <Text variant="body" tone="muted">
            No sources available.
          </Text>
        ) : (
          sources.map((source) => <SourceRow key={source.id} source={source} />)
        )}
      </View>

      {showDisclaimer ? (
        <View style={styles.disclaimer}>
          <Text variant="bodySm" style={styles.disclaimerText}>
            ⚠ {HEALTH_DISCLAIMER}
          </Text>
        </View>
      ) : null}

      {showInspiredCta ? (
        <View style={styles.ctaDisabled}>
          <Text variant="body" tone="muted" style={styles.ctaDisabledText}>
            Eat like this celebrity
          </Text>
          <Text variant="caption" tone="muted">
            Coming soon
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

interface SourceRowProps {
  source: schemas.ClaimSourceWire;
}

function SourceRow({ source }: SourceRowProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const allowed = isAllowedSourceUrl(source.url);
  const date = source.published_date !== null ? source.published_date.slice(0, 4) : null;

  if (!allowed || source.url === null) {
    return (
      <View style={styles.sourceRowDisabled}>
        <Text variant="body" tone="muted">
          {source.outlet}
          {date !== null ? ` · ${date}` : ''}
        </Text>
        <Text variant="caption" tone="error">
          Source link unavailable
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => {
        void Linking.openURL(source.url ?? '');
      }}
      accessibilityRole="link"
      accessibilityLabel={`Open ${source.outlet} link`}
      style={styles.sourceRow}
    >
      <Text variant="body" tone="brand">
        → {source.outlet}
        {date !== null ? ` (${date})` : ''}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) },
    backButton: { paddingVertical: theme.space(2), alignSelf: 'flex-start' },
    backButtonText: { fontWeight: theme.weight.semibold },
    centered: { flex: 1, justifyContent: 'center' },
    bodyScroll: { paddingBottom: theme.space(4), gap: theme.space(2) },
    bodyText: { paddingHorizontal: theme.space(4), lineHeight: theme.type.body + 8 },
    sourcesSection: {
      paddingHorizontal: theme.space(4),
      marginTop: theme.space(3),
      gap: theme.space(2),
    },
    sectionTitle: { fontWeight: theme.weight.bold, textTransform: 'uppercase', marginBottom: theme.space(2) },
    sourceRow: { paddingVertical: theme.space(2) },
    sourceRowDisabled: { paddingVertical: theme.space(2), gap: 2 },
    disclaimer: {
      marginHorizontal: theme.space(4),
      marginTop: theme.space(3),
      padding: theme.space(3),
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.sm,
    },
    disclaimerText: { lineHeight: theme.type.bodySm + 6 },
    ctaDisabled: {
      marginHorizontal: theme.space(4),
      marginTop: theme.space(4),
      paddingVertical: theme.space(4),
      paddingHorizontal: theme.space(6),
      backgroundColor: theme.color.border,
      borderRadius: theme.radius.sm,
      alignItems: 'center',
      gap: 4,
    },
    ctaDisabledText: { fontWeight: theme.weight.semibold },
  });
}
