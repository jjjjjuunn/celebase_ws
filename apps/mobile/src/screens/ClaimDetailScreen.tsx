// Wellness claim 상세 — feed 카드 탭 시 진입. 전문 + 출처 목록 + 면책 + CTA.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { ClaimCard } from '../components/ClaimCard';
import { px, resolveToken } from '../lib/tokens';
import { getClaim } from '../services/claims';
import { isAllowedSourceUrl } from '../lib/url-allowlist';

interface ClaimDetailScreenProps {
  claimId: string;
  onBack: () => void;
}

type DetailState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'loaded'; data: schemas.LifestyleClaimDetailResponse };

const HEALTH_DISCLAIMER =
  '본 정보는 교육 목적으로 제공되며 의료 조언을 대체하지 않습니다. 의료 결정은 의사와 상의하세요.';

export function ClaimDetailScreen({ claimId, onBack }: ClaimDetailScreenProps): React.JSX.Element {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← 뒤로</Text>
        </TouchableOpacity>
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={resolveToken('light', '--cb-color-brand')} />
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>불러오기에 실패했습니다.</Text>
        </View>
      ) : (
        <DetailBody data={state.data} />
      )}
    </View>
  );
}

interface DetailBodyProps {
  data: schemas.LifestyleClaimDetailResponse;
}

function DetailBody({ data }: DetailBodyProps): React.JSX.Element {
  const { claim, sources } = data;
  const primarySource = sources.find((s) => s.is_primary);
  const showDisclaimer = claim.trust_grade === 'D' || claim.is_health_claim;
  const showInspiredCta = claim.base_diet_id !== null;

  return (
    <ScrollView contentContainerStyle={styles.bodyScroll}>
      <ClaimCard claim={claim} primarySource={primarySource} />

      {claim.body !== null && claim.body !== '' ? (
        <Text style={styles.bodyText}>{claim.body}</Text>
      ) : null}

      <View style={styles.sourcesSection}>
        <Text style={styles.sectionTitle}>출처</Text>
        {sources.length === 0 ? (
          <Text style={styles.bodyText}>등록된 출처가 없습니다.</Text>
        ) : (
          sources.map((source) => <SourceRow key={source.id} source={source} />)
        )}
      </View>

      {showDisclaimer ? (
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>⚠ {HEALTH_DISCLAIMER}</Text>
        </View>
      ) : null}

      {showInspiredCta ? (
        <View style={styles.ctaDisabled}>
          <Text style={styles.ctaDisabledText}>이 셀럽처럼 먹어보기</Text>
          <Text style={styles.ctaCaption}>곧 제공됩니다</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

interface SourceRowProps {
  source: schemas.ClaimSourceWire;
}

function SourceRow({ source }: SourceRowProps): React.JSX.Element {
  const allowed = isAllowedSourceUrl(source.url);
  const date = source.published_date !== null ? source.published_date.slice(0, 4) : null;

  if (!allowed || source.url === null) {
    return (
      <View style={styles.sourceRowDisabled}>
        <Text style={styles.sourceOutletDisabled}>
          {source.outlet}{date !== null ? ` · ${date}` : ''}
        </Text>
        <Text style={styles.sourceWarning}>출처 링크 검증 실패</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => {
        void Linking.openURL(source.url ?? '');
      }}
      accessibilityRole="link"
      accessibilityLabel={`${source.outlet} 외부 링크 열기`}
      style={styles.sourceRow}
    >
      <Text style={styles.sourceOutlet}>
        → {source.outlet}{date !== null ? ` (${date})` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: resolveToken('light', '--cb-color-bg'),
  },
  header: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-space-3']),
  },
  backButton: {
    paddingVertical: px(tokens.light['--cb-space-2']),
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-brand'),
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: px(tokens.light['--cb-space-4']),
  },
  errorText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-error'),
  },
  bodyScroll: {
    paddingBottom: px(tokens.light['--cb-space-4']),
    gap: px(tokens.light['--cb-space-2']),
  },
  bodyText: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text'),
    lineHeight: px(tokens.light['--cb-body-md']) + 8,
    paddingHorizontal: px(tokens.light['--cb-space-4']),
  },
  sourcesSection: {
    paddingHorizontal: px(tokens.light['--cb-space-4']),
    marginTop: px(tokens.light['--cb-space-3']),
    gap: px(tokens.light['--cb-space-2']),
  },
  sectionTitle: {
    fontSize: px(tokens.light['--cb-body-sm']),
    fontWeight: '700',
    color: resolveToken('light', '--cb-color-text-muted'),
    marginBottom: px(tokens.light['--cb-space-2']),
    textTransform: 'uppercase',
  },
  sourceRow: {
    paddingVertical: px(tokens.light['--cb-space-2']),
  },
  sourceOutlet: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-brand'),
  },
  sourceRowDisabled: {
    paddingVertical: px(tokens.light['--cb-space-2']),
    gap: 2,
  },
  sourceOutletDisabled: {
    fontSize: px(tokens.light['--cb-body-md']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  sourceWarning: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-error'),
  },
  disclaimer: {
    marginHorizontal: px(tokens.light['--cb-space-4']),
    marginTop: px(tokens.light['--cb-space-3']),
    padding: px(tokens.light['--cb-space-3']),
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderRadius: 8,
  },
  disclaimerText: {
    fontSize: px(tokens.light['--cb-body-sm']),
    color: resolveToken('light', '--cb-color-text'),
    lineHeight: px(tokens.light['--cb-body-sm']) + 6,
  },
  ctaDisabled: {
    marginHorizontal: px(tokens.light['--cb-space-4']),
    marginTop: px(tokens.light['--cb-space-4']),
    paddingVertical: px(tokens.light['--cb-button-pad-y']),
    paddingHorizontal: px(tokens.light['--cb-button-pad-x']),
    backgroundColor: resolveToken('light', '--cb-color-neutral-100'),
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  ctaDisabledText: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text-muted'),
  },
  ctaCaption: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
