// Wellness claim 카드 — feed list 와 detail header 에서 동일하게 재사용.
//
// 셀럽 이름 / thumbnail 표시는 BFF `/api/celebrities/by-id/:id` route 가 추가된
// 후 (fast-follow sub-task) 활성화. 현재는 claim_type + trust_grade + headline
// + 1차 source outlet · year 만 표시 — wire schema 만으로 렌더 가능한 범위.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokens } from '@celebbase/design-tokens';
import type { schemas } from '@celebbase/shared-types';

import { px, resolveToken } from '../lib/tokens';
import { TrustGradeBadge } from './TrustGradeBadge';

// ClaimType → 한국어 라벨 (CategoryTabs 와 동일 매핑).
const CLAIM_TYPE_LABEL: Record<string, string> = {
  food: '음식',
  workout: '운동',
  sleep: '수면',
  beauty: '뷰티',
  brand: '브랜드',
  philosophy: '철학',
  supplement: '보충제',
};

interface ClaimCardProps {
  claim: schemas.LifestyleClaimWire;
  /** 1차 source — feed list 시점에는 별도 fetch 안 했으므로 undefined. detail 시 prop 으로 주입. */
  primarySource?: schemas.ClaimSourceWire;
  /** list variant 에서만 TouchableOpacity. detail-header variant 는 plain View. */
  onPress?: (id: string) => void;
}

export function ClaimCard({ claim, primarySource, onPress }: ClaimCardProps): React.JSX.Element {
  const body = (
    <>
      <View style={styles.headerRow}>
        <View style={styles.claimTypePill}>
          <Text style={styles.claimTypeText}>{CLAIM_TYPE_LABEL[claim.claim_type] ?? claim.claim_type}</Text>
        </View>
        <TrustGradeBadge grade={claim.trust_grade} />
      </View>
      <Text style={styles.headline} numberOfLines={3}>{claim.headline}</Text>
      {primarySource !== undefined ? (
        <Text style={styles.sourceMeta} numberOfLines={1}>
          {primarySource.outlet}
          {primarySource.published_date !== null ? ` · ${primarySource.published_date.slice(0, 4)}` : ''}
        </Text>
      ) : null}
    </>
  );

  if (onPress === undefined) {
    return <View style={styles.card}>{body}</View>;
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`claim ${claim.headline}`}
      onPress={() => {
        onPress(claim.id);
      }}
      style={styles.card}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: resolveToken('light', '--cb-color-surface'),
    borderRadius: 12,
    padding: px(tokens.light['--cb-space-4']),
    marginHorizontal: px(tokens.light['--cb-space-4']),
    marginVertical: px(tokens.light['--cb-space-2']),
    gap: px(tokens.light['--cb-space-2']),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(tokens.light['--cb-space-2']),
  },
  claimTypePill: {
    paddingHorizontal: px(tokens.light['--cb-space-3']),
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: resolveToken('light', '--cb-color-brand-subtle'),
  },
  claimTypeText: {
    fontSize: px(tokens.light['--cb-caption']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-brand'),
  },
  headline: {
    fontSize: px(tokens.light['--cb-body-md']),
    fontWeight: '600',
    color: resolveToken('light', '--cb-color-text'),
    lineHeight: px(tokens.light['--cb-body-md']) + 6,
  },
  sourceMeta: {
    fontSize: px(tokens.light['--cb-caption']),
    color: resolveToken('light', '--cb-color-text-muted'),
  },
});
