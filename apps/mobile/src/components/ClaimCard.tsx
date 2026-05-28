// Wellness claim 카드 — feed list 와 detail header 에서 동일하게 재사용.
//
// 셀럽 이름 / thumbnail 은 optional `celebrity` prop 으로 표시 — News 피드가
// client-side join (`listCelebrities()` → Map by celebrity_id) 으로 주입한다
// (별도 BFF by-id route 불필요). prop 미전달 시 (ClaimDetail/ClaimsFeed) 행 미렌더 —
// 하위호환. 그 외엔 claim_type + trust_grade + headline + 1차 source outlet · year.

import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { schemas } from '@celebbase/shared-types';

import { Avatar, Text, useTheme, type Theme } from '../ui';
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
  /** 셀럽 attribution — News 피드가 client-side join 으로 주입. 미전달 시 앵커 행 미렌더. */
  celebrity?: schemas.CelebrityWire;
  /** list variant 에서만 TouchableOpacity. detail-header variant 는 plain View. */
  onPress?: (id: string) => void;
  /** Premium 잠금 상태. true 면 lock overlay + Premium 라벨 표시. tap 시 paywall trigger. */
  locked?: boolean;
}

export function ClaimCard({
  claim,
  primarySource,
  celebrity,
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
      {celebrity !== undefined ? (
        // 앵커 행 전체를 단일 카드 focus stop 안으로 숨김 — Avatar 의 image role 이
        // 별도 focus node 가 되어 중복 announce 되는 것을 방지. 셀럽 이름은 카드
        // accessibilityLabel 에 합쳐서 announce 한다.
        <View
          style={styles.celebRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Avatar
            name={celebrity.display_name}
            uri={celebrity.cover_image_url ?? celebrity.avatar_url}
            size={28}
          />
          <Text variant="bodySm" style={styles.celebName} numberOfLines={1}>
            {celebrity.display_name}
          </Text>
        </View>
      ) : null}
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
        locked
          ? `Locked premium claim ${claim.headline}. Tap to upgrade.`
          : celebrity !== undefined
            ? `${celebrity.display_name}: ${claim.headline}`
            : `claim ${claim.headline}`
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
    celebRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
    celebName: { fontWeight: theme.weight.semibold },
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
