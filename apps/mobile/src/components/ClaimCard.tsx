// Wellness claim 카드 — Design Canvas v1 (IMPL-MOBILE-NEWS-CARD-CANVAS-001).
// Editorial · faceless · typography-led. feed list 와 detail header 에서 재사용.
//
// 레이아웃(Canvas v1): toprow(모노그램 + 이름/eyebrow + 카테고리 chip) · Fraunces 헤드라인 ·
// body · botrow(trust 배지 + "Source: {outlet} ↗" + per-card CTA) · 면책(D/health).
//
// 셀럽 사진 금지(법적 §3): avatar_url 이미지 미렌더 — 타이포 모노그램(이니셜·forest 원).
// 무셀럽 트렌드 카드는 lime 글리프(#). 셀럽 이름은 에디토리얼 슬롯(이름행/헤드라인/body)에만 —
// CTA 카피는 제네릭(셀럽 이름 미포함).
//
// CTA 는 시각 affordance — 카드 전체가 onPress 로 ClaimDetail 로 네비(피드에서 protected
// fetch 안 함 → 게스트 boot-kick 무위험; 실제 게이트된 "Make my Plan" 은 ClaimDetail, PR195).

import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { schemas } from '@celebbase/shared-types';

import { Text, useTheme, type Theme } from '../ui';
import { TrustGradeBadge } from './TrustGradeBadge';

// claim_type → News 버킷 chip 라벨 (NewsScreen CATEGORY_BY_CLAIM_TYPE 와 정합).
const BUCKET_LABEL: Record<string, string> = {
  food: 'Diet',
  beauty: 'Beauty',
  workout: 'Wellness',
  sleep: 'Wellness',
  supplement: 'Wellness',
  brand: 'Wellness',
  philosophy: 'Wellness',
};

// 알려진 출처 host → 표시 이름. 미등록 host 는 host 그대로(여전히 출처 표기).
const OUTLET_LABEL: Record<string, string> = {
  'youtube.com': 'YouTube',
  'forksoverknives.com': 'Forks Over Knives',
  'people.com': 'People',
  'elle.com': 'Elle',
  'marieclaire.com': 'Marie Claire',
  'womenshealthmag.com': "Women's Health",
  'vogue.com': 'Vogue',
  'allure.com': 'Allure',
  'harpersbazaar.com': "Harper's Bazaar",
  'about.underarmour.com': 'Under Armour',
  'underarmour.com': 'Under Armour',
  'healthline.com': 'Healthline',
  'mayoclinic.org': 'Mayo Clinic',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '·';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function outletFromUrl(url: string | null | undefined): string | null {
  if (url == null || url === '') return null;
  const m = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  if (m === null) return null;
  const host = m[1].toLowerCase();
  return OUTLET_LABEL[host] ?? host;
}

type CtaState = 'live' | 'soon' | 'none';

function ctaStateFor(claim: schemas.LifestyleClaimWire, hasCelebrity: boolean): CtaState {
  // food + base_diet 연결 → "Make my Plan"(State A live).
  if (claim.claim_type === 'food' && claim.base_diet_id != null) return 'live';
  // 무셀럽 트렌드 카드 또는 base_diet 없는 food → "준비중·알림"(State B demand-capture).
  if (!hasCelebrity || claim.claim_type === 'food') return 'soon';
  // 그 외(non-food) → meal-plan CTA 없음.
  return 'none';
}

interface ClaimCardProps {
  claim: schemas.LifestyleClaimWire;
  /** 1차 source — detail 시 prop 으로 주입(outlet 직접). feed 에선 primary_source_url 에서 유도. */
  primarySource?: schemas.ClaimSourceWire;
  /** 셀럽 attribution — News 피드가 client-side join 으로 주입. 미전달 시 트렌드 카드(글리프). */
  celebrity?: schemas.CelebrityWire;
  /** list variant 에서만 TouchableOpacity. detail-header variant 는 plain View. */
  onPress?: (id: string) => void;
  /** Premium 잠금 상태. true 면 lock overlay + Premium 라벨. tap 시 paywall trigger. */
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

  const hasCelebrity = celebrity !== undefined;
  // feed variant(onPress 있음) 만 body/CTA/면책을 렌더. detail-header variant(onPress 없음)는
  // compact — ClaimDetailScreen 이 full body/면책/게이트된 CTA 를 아래에 렌더하므로 중복 방지.
  const isFeed = onPress !== undefined;
  const cta = ctaStateFor(claim, hasCelebrity);
  const outlet = primarySource?.outlet ?? outletFromUrl(claim.primary_source_url);
  const chipLabel = BUCKET_LABEL[claim.claim_type] ?? 'Wellness';
  const eyebrow = hasCelebrity ? 'EATS LIKE' : 'TREND';
  const monoText = hasCelebrity ? initials(celebrity.display_name) : '#';
  // 이름 행: 셀럽 → 이름 / 무셀럽 트렌드 → 토픽(tags[0]). 헤드라인은 절대 재사용 안 함(h3 와 중복 방지).
  const whoName = hasCelebrity
    ? celebrity.display_name
    : claim.tags.length > 0
      ? capitalize(claim.tags[0])
      : null;
  const showDisclaimer = claim.is_health_claim || claim.trust_grade === 'D';

  const body = (
    <>
      <View style={styles.topRow}>
        <View
          style={[styles.monogram, hasCelebrity ? styles.monogramCeleb : styles.monogramTrend]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.monogramText, hasCelebrity ? styles.monogramTextCeleb : styles.monogramTextTrend]}>
            {monoText}
          </Text>
        </View>
        <View style={styles.whoCol}>
          {whoName != null ? (
            <Text style={styles.whoName} numberOfLines={1}>
              {whoName}
            </Text>
          ) : null}
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{chipLabel}</Text>
        </View>
      </View>

      <Text style={[styles.headline, locked ? styles.dimmed : null]} numberOfLines={3}>
        {claim.headline}
      </Text>

      {isFeed && claim.body != null && claim.body !== '' ? (
        <Text style={styles.bodyText} numberOfLines={2}>
          {claim.body}
        </Text>
      ) : null}

      <View style={styles.botRow}>
        <TrustGradeBadge grade={claim.trust_grade} />
        {outlet != null ? (
          <Text style={styles.source} numberOfLines={1}>
            {`Source: ${outlet} ↗`}
          </Text>
        ) : null}
        {isFeed && cta === 'live' ? (
          <View style={[styles.ctaLive, styles.ctaSpacer]}>
            <Text style={styles.ctaLiveText}>Make my Plan →</Text>
          </View>
        ) : isFeed && cta === 'soon' ? (
          <View style={[styles.ctaSoon, styles.ctaSpacer]}>
            <Text style={styles.ctaSoonText}>준비 중 · 알림</Text>
          </View>
        ) : null}
      </View>

      {isFeed && showDisclaimer ? (
        <Text style={styles.disclaimer} numberOfLines={2}>
          For educational purposes only — not medical advice.
        </Text>
      ) : null}

      {locked ? (
        <View style={styles.lockOverlay}>
          <Ionicons name="lock-closed" size={16} color={theme.news.forest} />
          <Text style={styles.lockLabel}>Premium · Tap to unlock</Text>
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
          : hasCelebrity
            ? `${celebrity.display_name}: ${claim.headline}`
            : `claim ${claim.headline}`
      }
      activeOpacity={0.85}
      onPress={() => {
        onPress(claim.id);
      }}
      style={styles.card}
    >
      {body}
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  const n = theme.news;
  return StyleSheet.create({
    card: {
      backgroundColor: n.cream,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: n.line,
      padding: 15,
      marginHorizontal: theme.space(4),
      marginVertical: theme.space(2),
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 11 },
    monogram: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    monogramCeleb: { backgroundColor: n.forest },
    monogramTrend: { backgroundColor: n.trend.bg },
    monogramText: { fontFamily: theme.font.display, fontSize: 13.5, fontWeight: theme.weight.semibold },
    monogramTextCeleb: { color: n.cream },
    monogramTextTrend: { color: n.trend.fg },
    whoCol: { flex: 1 },
    whoName: { fontFamily: theme.font.body, fontSize: 13.5, fontWeight: theme.weight.bold, color: n.ink, lineHeight: 16 },
    eyebrow: {
      fontFamily: theme.font.mono,
      fontSize: 10,
      fontWeight: theme.weight.medium,
      color: n.muted,
      letterSpacing: 0.4,
      marginTop: 2,
    },
    chip: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: n.chip.border,
      backgroundColor: n.chip.bg,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    chipText: {
      fontFamily: theme.font.mono,
      fontSize: 9.5,
      fontWeight: theme.weight.semibold,
      color: n.chip.fg,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    headline: {
      fontFamily: theme.font.display,
      fontSize: 20,
      fontWeight: theme.weight.medium,
      color: n.ink,
      lineHeight: 23,
      letterSpacing: -0.2,
    },
    dimmed: { color: n.muted },
    bodyText: { fontFamily: theme.font.body, fontSize: 13, color: n.inkSoft, lineHeight: 18, marginTop: 6 },
    botRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13, flexWrap: 'wrap' },
    source: {
      fontFamily: theme.font.mono,
      fontSize: 10.5,
      color: n.muted,
      textDecorationLine: 'underline',
    },
    ctaSpacer: { marginLeft: 'auto' },
    ctaLive: { backgroundColor: n.ctaLive.bg, borderRadius: theme.radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
    ctaLiveText: { fontFamily: theme.font.body, fontSize: 12.5, fontWeight: theme.weight.bold, color: n.ctaLive.fg },
    ctaSoon: {
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: n.ctaSoonFg,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    ctaSoonText: { fontFamily: theme.font.body, fontSize: 12, fontWeight: theme.weight.bold, color: n.ctaSoonFg },
    disclaimer: { fontFamily: theme.font.mono, fontSize: 9, color: n.muted, lineHeight: 13, marginTop: 8 },
    lockOverlay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      marginTop: theme.space(2),
      paddingTop: theme.space(2),
      borderTopWidth: 1,
      borderTopColor: n.line,
    },
    lockLabel: { fontFamily: theme.font.body, fontWeight: theme.weight.bold, color: n.forest, fontSize: 13 },
  });
}
