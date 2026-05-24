// Wellness claim 카드 — feed list 와 detail header 에서 동일하게 재사용.
//
// 셀럽 이름 / thumbnail 표시는 BFF `/api/celebrities/by-id/:id` route 가 추가된
// 후 (fast-follow sub-task) 활성화. 현재는 claim_type + trust_grade + headline
// + 1차 source outlet · year 만 표시 — wire schema 만으로 렌더 가능한 범위.

import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { schemas } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';
import { TrustGradeBadge } from './TrustGradeBadge';

// ClaimType → en-US 라벨 (CategoryTabs 와 동일 매핑).
const CLAIM_TYPE_LABEL: Record<string, string> = {
  food: 'Food',
  workout: 'Fitness',
  sleep: 'Sleep',
  beauty: 'Beauty',
  brand: 'Brands',
  philosophy: 'Mindset',
  supplement: 'Supplements',
};

interface ClaimCardProps {
  claim: schemas.LifestyleClaimWire;
  /** 1차 source — feed list 시점에는 별도 fetch 안 했으므로 undefined. detail 시 prop 으로 주입. */
  primarySource?: schemas.ClaimSourceWire;
  /** list variant 에서만 TouchableOpacity. detail-header variant 는 plain View. */
  onPress?: (id: string) => void;
  /** Premium 잠금 상태. true 면 lock overlay + Premium 라벨 표시. tap 시 paywall trigger. */
  locked?: boolean;
}

export function ClaimCard({
  claim,
  primarySource,
  onPress,
  locked = false,
}: ClaimCardProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const body = (
    <>
      <View style={styles.headerRow}>
        <View style={styles.claimTypePill}>
          <Text variant="caption" tone="brand" style={styles.claimTypeText}>
            {CLAIM_TYPE_LABEL[claim.claim_type] ?? claim.claim_type}
          </Text>
        </View>
        <TrustGradeBadge grade={claim.trust_grade} />
      </View>
      <Text variant="body" tone={locked ? 'muted' : 'default'} numberOfLines={3} style={styles.headline}>
        {claim.headline}
      </Text>
      {primarySource !== undefined ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {primarySource.outlet}
          {primarySource.published_date !== null ? ` · ${primarySource.published_date.slice(0, 4)}` : ''}
        </Text>
      ) : null}
      {locked ? (
        <View style={styles.lockOverlay}>
          <Ionicons name="lock-closed" size={18} color={theme.color.brand} />
          <Text variant="bodySm" tone="brand" style={styles.lockLabel}>
            Premium · Tap to unlock
          </Text>
        </View>
      ) : null}
    </>
  );

  if (onPress === undefined) {
    return <View style={styles.card}>{body}</View>;
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={
        locked ? `Locked premium claim ${claim.headline}. Tap to upgrade.` : `claim ${claim.headline}`
      }
      onPress={() => {
        onPress(claim.id);
      }}
      style={[styles.card, locked ? styles.cardLocked : null]}
    >
      {body}
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.md,
      padding: theme.space(4),
      marginHorizontal: theme.space(4),
      marginVertical: theme.space(2),
      gap: theme.space(2),
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    claimTypePill: {
      paddingHorizontal: theme.space(3),
      paddingVertical: 4,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.brandSubtle,
    },
    claimTypeText: { fontWeight: theme.weight.semibold },
    headline: { fontWeight: theme.weight.semibold },
    cardLocked: { opacity: 0.85 },
    lockOverlay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      marginTop: theme.space(2),
      paddingTop: theme.space(2),
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    lockLabel: { fontWeight: theme.weight.bold, letterSpacing: 0.3 },
  });
}
