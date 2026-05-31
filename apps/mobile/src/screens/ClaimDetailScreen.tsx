// Wellness claim 스토리 — feed 카드 탭 시 진입. Design Canvas v1 카드뉴스 캐러셀(Lean v1,
// IMPL-MOBILE-CLAIM-STORY-CAROUSEL-001). State A pilot 내러티브를 가로 스와이프 슬라이드로:
//   decode → what they do(+출처) → [the catch → rescaled to you] → your turn(CTA).
// 슬라이드 콘텐츠는 기존 claim 데이터 + 정적 템플릿만 사용(신규 스키마/콘텐츠 의존 0).
//
// CTA wiring(IMPL-MOBILE-CLAIM-CTA-001) 보존: 마지막 슬라이드의 "Make my Plan" 게이트가
// claim.base_diet_id 를 MealPlanGenerateSheet 에 넘겨 셀럽 picker 를 스킵한다.
// 게스트 boot-kick 불변식(PR195) 보존: 게스트는 credits fetch skip + 시트 미렌더 + 로그인 게이트.
//
// 모든 슬라이드는 가로 ScrollView 에 동시 마운트된다(가상화 없음 — 슬라이드 수 ≤ 5).

import { Alert } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { schemas } from '@celebbase/shared-types';

import { MealPlanGenerateSheet } from '../components/MealPlanGenerateSheet';
import { TrustGradeBadge } from '../components/TrustGradeBadge';
import { signalLoginRequired } from '../lib/auth-events';
import { useIsGuest } from '../lib/guest-mode';
import { useMealPlanCredits } from '../lib/use-meal-plan-credits';
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

// claim_type → 표시 버킷(ClaimCard BUCKET_LABEL 과 정합). decode eyebrow 에 사용.
const BUCKET_LABEL: Record<string, string> = {
  food: 'Diet',
  beauty: 'Beauty',
  workout: 'Wellness',
  sleep: 'Wellness',
  supplement: 'Wellness',
  brand: 'Wellness',
  philosophy: 'Wellness',
};

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.news.forest} />
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title="Couldn't load this claim."
            body="잠시 후 다시 시도해주세요."
          />
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
  const { width } = useWindowDimensions();
  const { claim, sources } = data;

  const showDisclaimer = claim.trust_grade === 'D' || claim.is_health_claim;
  // "Make my Plan" 루프는 food 카드 한정. food + 플랜 소스 = 활성(State A) /
  // food + 소스 없음 = "준비 중"(State B) / 비-food = CTA 미표시.
  const isFoodCard = claim.claim_type === 'food';
  const showInspiredCta = isFoodCard && claim.base_diet_id !== null;
  const showComingSoon = isFoodCard && claim.base_diet_id === null;

  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // 가로 페이저 안 세로 스크롤을 위해 캐러셀 영역 높이를 측정해 각 슬라이드에 바운드.
  const [areaH, setAreaH] = useState(0);
  // 게스트(무토큰): credits fetch skip(boot-kick 회피) + CTA 는 로그인 게이트로 분기.
  const isGuest = useIsGuest();
  const { credits, loading: creditsLoading } = useMealPlanCredits(isGuest);
  const maxDays =
    credits === null ? 0 : credits.credits_remaining === null ? 7 : credits.credits_remaining;
  const ctaDisabled = !creditsLoading && maxDays === 0;

  const bucket = (BUCKET_LABEL[claim.claim_type] ?? 'Wellness').toUpperCase();

  // ── 마지막 슬라이드 CTA(상태별) ───────────────────────────────
  const ctaNode = showInspiredCta ? (
    isGuest ? (
      // 게스트: 시트 미렌더(mount 시 protected fetch hazard 회피) — 로그인 게이트로.
      // 게스트 분기를 크레딧 분기보다 먼저 둬 "크레딧 부족" alert 오노출 방지.
      <TouchableOpacity
        onPress={() => {
          signalLoginRequired();
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign in to make your plan"
        style={styles.ctaLive}
      >
        <Text style={styles.ctaLiveText}>Sign in to make your plan</Text>
        <Ionicons name="arrow-forward" size={18} color={theme.news.ctaLive.fg} />
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        onPress={() => {
          if (ctaDisabled) {
            Alert.alert('크레딧 부족', '식단 생성에 사용할 크레딧이 없어요.');
            return;
          }
          setSheetVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Eat like this celebrity"
        disabled={creditsLoading}
        style={[styles.ctaLive, ctaDisabled ? styles.ctaDisabled : null]}
      >
        <Text style={styles.ctaLiveText}>Eat like this celebrity</Text>
        <Ionicons name="arrow-forward" size={18} color={theme.news.ctaLive.fg} />
      </TouchableOpacity>
    )
  ) : showComingSoon ? (
    <View style={styles.ctaComingSoon} accessibilityRole="text">
      <Ionicons name="time-outline" size={18} color={theme.news.lime} />
      <Text style={styles.ctaComingSoonText}>맞춤 식단 준비 중 — 곧 만나요</Text>
    </View>
  ) : null;

  // ── 슬라이드 구성 ─────────────────────────────────────────────
  const slides: Array<{ key: string; tone: 'light' | 'dark'; node: React.ReactNode }> = [];

  // 1) Decode — 후킹.
  slides.push({
    key: 'decode',
    tone: 'light',
    node: (
      <>
        <Text style={styles.eyebrow}>{`${bucket} · CELEBRITY DECODE`}</Text>
        <Text style={styles.headline}>{claim.headline}</Text>
        <Text style={styles.subtitle}>
          그들이 실제로 무엇을 하는지 — 그리고 당신에게 맞게 리스케일.
        </Text>
        <View style={styles.swipeHint}>
          <Text style={styles.swipeHintText}>넘기기</Text>
          <Ionicons name="arrow-forward" size={14} color={theme.news.muted} />
        </View>
      </>
    ),
  });

  // 2) What they do — 전문 + trust + 출처.
  slides.push({
    key: 'what',
    tone: 'light',
    node: (
      <>
        <Text style={styles.eyebrow}>WHAT THEY DO</Text>
        <Text style={styles.bodyText}>
          {claim.body !== null && claim.body !== ''
            ? claim.body
            : '출처를 기반으로 정리한 그들의 실제 루틴입니다.'}
        </Text>
        <View style={styles.trustRow}>
          <TrustGradeBadge grade={claim.trust_grade} />
        </View>
        <View style={styles.sourcesSection}>
          <Text style={styles.sectionTitle}>Sources</Text>
          {sources.length === 0 ? (
            <Text style={styles.bodyMuted}>No sources available.</Text>
          ) : (
            sources.map((source) => <SourceRow key={source.id} source={source} />)
          )}
        </View>
      </>
    ),
  });

  // 3·4) The catch / Rescaled to you — State A 한정(엔진-정직 약속).
  if (showInspiredCta) {
    slides.push({
      key: 'catch',
      tone: 'dark',
      node: (
        <>
          <Text style={styles.eyebrowOnDark}>BUT HERE&apos;S THE CATCH</Text>
          <Text style={styles.headlineOnDark}>그들의 몸·목표에 맞춰진 식단이에요.</Text>
          <Text style={styles.bodyOnDark}>
            그대로 복사하면 칼로리와 3대 매크로가 당신의 하루엔 맞지 않아요.
          </Text>
        </>
      ),
    });
    slides.push({
      key: 'rescale',
      tone: 'light',
      node: (
        <>
          <Text style={styles.eyebrow}>RESCALED TO YOU</Text>
          <Text style={styles.headline}>같은 베이스. 당신의 숫자.</Text>
          <View style={styles.rescaleRows}>
            <RescaleRow theme={theme} label="YOUR CALORIES" desc="퍼포머가 아니라 당신의 하루 목표로." />
            <RescaleRow theme={theme} label="YOUR MACROS" desc="단백질·탄수·지방을 당신 목표에 맞춰 분배." />
            <RescaleRow theme={theme} label="YOUR FOODS" desc="실제로 먹을 수 있는 재료로 치환." />
          </View>
        </>
      ),
    });
  }

  // 5) Your turn — CTA(상태별) + 면책.
  slides.push({
    key: 'cta',
    tone: 'dark',
    node: (
      <>
        <Text style={styles.eyebrowOnDark}>
          {showInspiredCta ? 'YOUR TURN' : showComingSoon ? 'COMING SOON' : 'MORE'}
        </Text>
        <Text style={styles.headlineOnDark}>
          {showInspiredCta
            ? '당신 버전으로 만들어요.'
            : showComingSoon
              ? '맞춤 식단을 만드는 중이에요.'
              : '출처에서 더 깊이 알아보세요.'}
        </Text>
        {showInspiredCta ? (
          <Text style={styles.bodyOnDark}>몇 가지 질문이면 끝 — 엔진이 칼로리·매크로·취향으로 리스케일.</Text>
        ) : null}
        {ctaNode}
        {showDisclaimer ? <Text style={styles.disclaimerOnDark}>{HEALTH_DISCLAIMER}</Text> : null}
      </>
    ),
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    const clamped = Math.max(0, Math.min(idx, slides.length - 1));
    setActiveIndex(clamped);
  };

  return (
    <View style={styles.bodyRoot}>
      <View
        style={styles.carouselArea}
        onLayout={(e) => {
          setAreaH(e.nativeEvent.layout.height);
        }}
      >
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
        >
          {slides.map((slide) => (
            <View key={slide.key} style={{ width, ...(areaH > 0 ? { height: areaH } : {}) }}>
              <ScrollView
                contentContainerStyle={styles.slideScroll}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={[styles.card, slide.tone === 'dark' ? styles.cardDark : styles.cardLight]}
                >
                  {slide.node}
                </View>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((slide, i) => (
            <View
              key={slide.key}
              style={[styles.dot, i === activeIndex ? styles.dotActive : null]}
            />
          ))}
        </View>
        <Text style={styles.counter}>
          {`${String(activeIndex + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`}
        </Text>
      </View>

      {showInspiredCta && !isGuest && claim.base_diet_id !== null ? (
        <MealPlanGenerateSheet
          visible={sheetVisible}
          maxDays={maxDays}
          initialBaseDietId={claim.base_diet_id}
          onClose={() => {
            setSheetVisible(false);
          }}
          onGenerated={() => {
            setSheetVisible(false);
            Alert.alert('생성 완료!', 'News 헤더의 My Plan 에서 확인하세요.');
          }}
        />
      ) : null}
    </View>
  );
}

interface RescaleRowProps {
  theme: Theme;
  label: string;
  desc: string;
}

function RescaleRow({ theme, label, desc }: RescaleRowProps): React.JSX.Element {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.rescaleRow}>
      <Text style={styles.rescaleLabel}>{label}</Text>
      <Text style={styles.rescaleDesc}>{desc}</Text>
    </View>
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
        <Text style={styles.sourceOutlet}>
          {source.outlet}
          {date !== null ? ` · ${date}` : ''}
        </Text>
        <Text style={styles.sourceUnavailable}>Source link unavailable</Text>
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
      <Ionicons name="open-outline" size={15} color={theme.news.forest} />
      <Text style={styles.sourceLink}>
        {source.outlet}
        {date !== null ? ` (${date})` : ''}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  const n = theme.news;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: n.paper },
    header: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(2) },
    backButton: { paddingVertical: theme.space(2), alignSelf: 'flex-start' },
    backButtonText: {
      fontFamily: theme.font.mono,
      fontSize: 13,
      fontWeight: theme.weight.semibold,
      color: n.forest,
      letterSpacing: 0.3,
    },
    centered: { flex: 1, justifyContent: 'center' },

    bodyRoot: { flex: 1 },
    carouselArea: { flex: 1 },
    slideScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      padding: theme.space(6),
      minHeight: 360,
      justifyContent: 'center',
      gap: theme.space(3),
    },
    cardLight: { backgroundColor: n.cream, borderColor: n.line },
    cardDark: { backgroundColor: n.forest, borderColor: n.forest },

    eyebrow: {
      fontFamily: theme.font.mono,
      fontSize: 11,
      fontWeight: theme.weight.semibold,
      color: n.clay,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    eyebrowOnDark: {
      fontFamily: theme.font.mono,
      fontSize: 11,
      fontWeight: theme.weight.semibold,
      color: n.lime,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    headline: {
      fontFamily: theme.font.display,
      fontSize: 30,
      fontWeight: theme.weight.medium,
      color: n.ink,
      lineHeight: 36,
      letterSpacing: -0.4,
    },
    headlineOnDark: {
      fontFamily: theme.font.display,
      fontSize: 30,
      fontWeight: theme.weight.medium,
      color: n.cream,
      lineHeight: 36,
      letterSpacing: -0.4,
    },
    subtitle: { fontFamily: theme.font.body, fontSize: 15, color: n.inkSoft, lineHeight: 22 },
    bodyText: { fontFamily: theme.font.body, fontSize: 15, color: n.inkSoft, lineHeight: 23 },
    bodyMuted: { fontFamily: theme.font.body, fontSize: 14, color: n.muted },
    bodyOnDark: { fontFamily: theme.font.body, fontSize: 15, color: n.cream2, lineHeight: 23 },

    swipeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.space(2) },
    swipeHintText: {
      fontFamily: theme.font.mono,
      fontSize: 11,
      color: n.muted,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    trustRow: { flexDirection: 'row' },
    sourcesSection: { gap: theme.space(2), marginTop: theme.space(1) },
    sectionTitle: {
      fontFamily: theme.font.mono,
      fontSize: 10.5,
      fontWeight: theme.weight.bold,
      color: n.muted,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2), paddingVertical: theme.space(1) },
    sourceRowDisabled: { paddingVertical: theme.space(1), gap: 2 },
    sourceLink: { fontFamily: theme.font.body, fontSize: 14, color: n.forest, textDecorationLine: 'underline' },
    sourceOutlet: { fontFamily: theme.font.body, fontSize: 14, color: n.muted },
    sourceUnavailable: { fontFamily: theme.font.mono, fontSize: 11, color: n.clay },

    rescaleRows: { gap: theme.space(3), marginTop: theme.space(2) },
    rescaleRow: { borderTopWidth: 1, borderTopColor: n.line, paddingTop: theme.space(2), gap: 3 },
    rescaleLabel: {
      fontFamily: theme.font.mono,
      fontSize: 10.5,
      fontWeight: theme.weight.semibold,
      color: n.clay,
      letterSpacing: 1,
    },
    rescaleDesc: { fontFamily: theme.font.body, fontSize: 14, color: n.inkSoft, lineHeight: 20 },

    ctaLive: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.space(2),
      marginTop: theme.space(3),
      paddingVertical: theme.space(4),
      paddingHorizontal: theme.space(5),
      backgroundColor: n.ctaLive.bg,
      borderRadius: theme.radius.pill,
    },
    ctaDisabled: { opacity: 0.55 },
    ctaLiveText: { fontFamily: theme.font.body, fontSize: 15, fontWeight: theme.weight.bold, color: n.ctaLive.fg },
    ctaComingSoon: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.space(2),
      marginTop: theme.space(3),
      paddingVertical: theme.space(4),
      paddingHorizontal: theme.space(5),
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: n.lime,
    },
    ctaComingSoonText: { fontFamily: theme.font.body, fontSize: 14, fontWeight: theme.weight.bold, color: n.lime },
    disclaimerOnDark: { fontFamily: theme.font.mono, fontSize: 10, color: n.cream2, lineHeight: 15, marginTop: theme.space(2), opacity: 0.85 },

    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space(5),
      paddingVertical: theme.space(3),
    },
    dots: { flexDirection: 'row', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: n.line },
    dotActive: { backgroundColor: n.forest, width: 20 },
    counter: { fontFamily: theme.font.mono, fontSize: 11, color: n.muted, letterSpacing: 1 },
  });
}
