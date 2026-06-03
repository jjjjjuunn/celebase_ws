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
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

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

// 표지 hook 은 plain 렌더(ClaimCard 에 RichText 없음) — `**bold**`/`*accent*` 마커 제거.
function stripMarkup(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
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
  /** feed 레이아웃 변형 — 'lead'(첫 카드 풀사진 표지) | 'row'(나머지 컴팩트 균일). detail-header 는 미전달. */
  feedVariant?: 'lead' | 'row';
}

export function ClaimCard({
  claim,
  primarySource,
  celebrity,
  onPress,
  locked = false,
  feedVariant = 'lead',
}: ClaimCardProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const hasCelebrity = celebrity !== undefined;
  // feed variant(onPress 있음) 만 body/CTA/면책을 렌더. detail-header variant(onPress 없음)는
  // compact — ClaimDetailScreen 이 full body/면책/게이트된 CTA 를 아래에 렌더하므로 중복 방지.
  const isFeed = onPress !== undefined;
  // row = 피드의 비-리드 카드(컴팩트 균일). body 텍스트/면책 생략, 헤드라인 2줄.
  const isRow = isFeed && feedVariant === 'row';
  const cta = ctaStateFor(claim, hasCelebrity);
  const outlet = primarySource?.outlet ?? outletFromUrl(claim.primary_source_url);
  const chipLabel = BUCKET_LABEL[claim.claim_type] ?? 'Wellness';
  const eyebrow = hasCelebrity ? 'EATS LIKE' : 'TREND';
  // 카테고리 accent — Diet/Beauty=clay, Wellness=forest-2 (상세 화면과 정합).
  const isWellnessCat =
    claim.claim_type === 'workout' || claim.claim_type === 'sleep' || claim.claim_type === 'supplement';
  const catAccent = isWellnessCat ? theme.news.forest2 : theme.news.clay;
  const monoText = hasCelebrity ? initials(celebrity.display_name) : '#';
  // 이름 행: 셀럽 → 이름 / 무셀럽 트렌드 → 토픽(tags[0]). 헤드라인은 절대 재사용 안 함(h3 와 중복 방지).
  const whoName = hasCelebrity
    ? celebrity.display_name
    : claim.tags.length > 0
      ? capitalize(claim.tags[0])
      : null;
  const showDisclaimer = claim.is_health_claim || claim.trust_grade === 'D';
  // row/lead-no-cover 카드의 좌측 썸네일 — story.hook.image(cover_image_url) 있으면 음식 사진,
  // 없으면 브랜드 컬러 블록 + 큰 Fraunces 이니셜(plain 회피, faceless·합법). 리드 풀커버는 아래 별도 분기.
  const thumbUrl = claim.cover_image_url;
  const hasThumb = typeof thumbUrl === 'string' && thumbUrl !== '';

  const body = (
    <>
      <View style={styles.rowTop}>
        <View
          style={[styles.thumb, hasThumb ? null : hasCelebrity ? styles.thumbCeleb : styles.thumbTrend]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {hasThumb ? (
            <Image source={{ uri: thumbUrl }} style={styles.thumbImg} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Text style={[styles.thumbMono, hasCelebrity ? styles.thumbMonoCeleb : styles.thumbMonoTrend]}>
              {monoText}
            </Text>
          )}
        </View>
        <View style={styles.rowContent}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerDot, { backgroundColor: catAccent }]} />
            <Text style={[styles.kicker, { color: catAccent }]} numberOfLines={1}>
              {`${chipLabel.toUpperCase()} · ${eyebrow}`}
            </Text>
          </View>
          {whoName != null ? (
            <Text style={styles.whoName} numberOfLines={1}>
              {whoName}
            </Text>
          ) : null}
          <Text style={[styles.headline, locked ? styles.dimmed : null]} numberOfLines={2}>
            {claim.headline}
          </Text>
        </View>
      </View>

      {isFeed && !isRow && claim.body != null && claim.body !== '' ? (
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

      {isFeed && !isRow && showDisclaimer ? (
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

  // 피드 카드 = 표지(cover). lead = 큰 표지, row = 작은 표지. 사진 있으면 풀배경 photo,
  // 없으면 진초록 + 큰 이니셜 워터마크(의도된 그래픽). 텍스트는 scrim 위에 녹임.
  // row 는 'Make my Plan' pill 제거 — 카드 전체가 탭(어포던스 거짓 방지). (IMPL-MOBILE-NEWS-COVER-001)
  if (isFeed) {
    const isLead = feedVariant === 'lead';
    const coverHook = stripMarkup(claim.cover_hook ?? claim.headline);
    const coverEyebrow = hasCelebrity
      ? `${chipLabel.toUpperCase()} · ${celebrity.display_name.toUpperCase()}`
      : chipLabel.toUpperCase();
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
        activeOpacity={0.9}
        onPress={() => {
          onPress(claim.id);
        }}
        style={[styles.coverCard, isLead ? styles.coverLead : styles.coverRow]}
      >
        {hasThumb ? (
          <Image source={{ uri: thumbUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          // 사진 없을 때 — 진초록 위 큰 이니셜 워터마크(plain 회피, faceless·합법).
          <Text
            style={styles.coverWatermark}
            numberOfLines={1}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {monoText}
          </Text>
        )}
        {/* canonical scrim — 최종 stop 동일 hue alpha-0(transparent 금지: RN=검정 hue-shift) */}
        <LinearGradient
          colors={['rgba(18,28,20,0.92)', 'rgba(18,28,20,0.55)', 'rgba(18,28,20,0.12)', 'rgba(18,28,20,0)']}
          locations={[0, 0.42, 0.72, 1]}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.coverFooter}>
          <View style={styles.coverEyebrowRow}>
            <View style={styles.coverDot} />
            <Text style={styles.coverEyebrow} numberOfLines={1}>
              {coverEyebrow}
            </Text>
          </View>
          <Text style={isLead ? styles.coverHook : styles.coverHookRow} numberOfLines={isLead ? 3 : 2}>
            {coverHook}
          </Text>
          {isLead ? (
            <View style={styles.coverBotRow}>
              <View style={styles.coverRule} />
              <Text style={styles.coverCta}>{cta === 'live' ? 'Make my Plan →' : 'Read →'}</Text>
            </View>
          ) : null}
        </View>
        {locked ? (
          <View style={styles.coverLock}>
            <Ionicons name="lock-closed" size={16} color={theme.news.cream} />
            <Text style={styles.coverLockLabel}>Premium · Tap to unlock</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  // detail-header (onPress 미전달, 현재 미사용) — legacy cream body.
  return <View style={styles.card}>{body}</View>;
}

function makeStyles(theme: Theme) {
  const n = theme.news;
  const f = theme.news.font; // News-scoped 브랜드 폰트(Fraunces / Hanken Grotesk / Spline Sans Mono)
  return StyleSheet.create({
    card: {
      backgroundColor: n.cream,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: n.line,
      padding: 18,
      marginHorizontal: theme.space(4),
      marginVertical: theme.space(2),
    },
    // 좌측 정사각 썸네일 + 우측 콘텐츠(kicker→이름→헤드라인) → 헤어라인 footer.
    rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
    thumb: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    thumbCeleb: { backgroundColor: n.forest },
    thumbTrend: { backgroundColor: n.trend.bg },
    thumbImg: { width: '100%', height: '100%' },
    // 사진 없을 때 fallback — 컬러 블록 위 큰 Fraunces 이니셜(plain 회피).
    thumbMono: { fontFamily: f.display, fontWeight: theme.weight.semibold },
    thumbMonoCeleb: { color: n.cream, fontSize: 30 },
    thumbMonoTrend: { color: n.trend.fg, fontSize: 30 },
    rowContent: { flex: 1 },
    kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
    kickerDot: { width: 7, height: 7, borderRadius: 4 },
    kicker: { fontFamily: f.mono, fontSize: 11, fontWeight: theme.weight.semibold, letterSpacing: 1.2, flexShrink: 1 },
    whoName: { fontFamily: f.display, fontSize: 16, fontWeight: theme.weight.medium, color: n.ink, lineHeight: 20, letterSpacing: -0.2, marginBottom: 3 },
    headline: {
      fontFamily: f.display,
      fontSize: 20,
      fontWeight: theme.weight.medium,
      color: n.ink,
      lineHeight: 24,
      letterSpacing: -0.2,
    },
    dimmed: { color: n.muted },
    bodyText: { fontFamily: f.body, fontSize: 13, color: n.inkSoft, lineHeight: 18, marginTop: 6 },
    botRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: n.line, flexWrap: 'wrap' },
    source: {
      fontFamily: f.mono,
      fontSize: 10.5,
      color: n.muted,
      textDecorationLine: 'underline',
    },
    ctaSpacer: { marginLeft: 'auto' },
    ctaLive: { backgroundColor: n.ctaLive.bg, borderRadius: theme.radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
    ctaLiveText: { fontFamily: f.body, fontSize: 12.5, fontWeight: theme.weight.bold, color: n.ctaLive.fg },
    ctaSoon: {
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: n.ctaSoonFg,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    ctaSoonText: { fontFamily: f.body, fontSize: 12, fontWeight: theme.weight.bold, color: n.ctaSoonFg },
    disclaimer: { fontFamily: f.mono, fontSize: 9, color: n.muted, lineHeight: 13, marginTop: 8 },
    lockOverlay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      marginTop: theme.space(2),
      paddingTop: theme.space(2),
      borderTopWidth: 1,
      borderTopColor: n.line,
    },
    lockLabel: { fontFamily: f.body, fontWeight: theme.weight.bold, color: n.forest, fontSize: 13 },

    // ── 표지(cover) — lead 큰 표지 / row 작은 표지, 사진 또는 진초록+워터마크 ──
    coverCard: {
      borderRadius: 18,
      overflow: 'hidden',
      marginHorizontal: theme.space(4),
      marginVertical: theme.space(2),
      backgroundColor: n.forest,
    },
    coverLead: { height: 460 },
    coverRow: { height: 212 },
    coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    // 사진 없을 때 fallback — 큰 Fraunces 이니셜 워터마크(은은, 상단). scrim 이 하단을 어둡게 → 텍스트 가독.
    coverWatermark: {
      position: 'absolute',
      top: -6,
      right: 14,
      fontFamily: f.display,
      fontSize: 104,
      fontWeight: theme.weight.bold,
      color: n.cream,
      opacity: 0.13,
      letterSpacing: -3,
    },
    coverFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20 },
    coverEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
    coverDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: n.lime },
    coverEyebrow: {
      fontFamily: f.mono,
      fontSize: 11,
      fontWeight: theme.weight.semibold,
      color: n.lime,
      letterSpacing: 1,
      flexShrink: 1,
    },
    coverHook: {
      fontFamily: f.display,
      fontSize: 27,
      fontWeight: theme.weight.medium,
      color: n.cream,
      lineHeight: 31,
      letterSpacing: -0.4,
    },
    coverHookRow: {
      fontFamily: f.display,
      fontSize: 21,
      fontWeight: theme.weight.medium,
      color: n.cream,
      lineHeight: 25,
      letterSpacing: -0.3,
    },
    coverBotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
    coverRule: { flex: 1, height: 1, backgroundColor: n.cream, opacity: 0.3 },
    coverCta: { fontFamily: f.body, fontSize: 13.5, fontWeight: theme.weight.bold, color: n.lime },
    coverLock: {
      position: 'absolute',
      top: 14,
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(32,35,28,0.55)',
      borderRadius: theme.radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    coverLockLabel: { fontFamily: f.body, fontWeight: theme.weight.bold, color: n.cream, fontSize: 12 },
  });
}
