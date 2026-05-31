// Wellness claim 스토리 — feed 카드 탭 시 진입. Design Canvas v1 카드뉴스 캐러셀.
// 가로 스와이프: decode → what they do(+출처) → [science] → [the catch → rescaled to you] → your turn(CTA).
//
// 콘텐츠 원본: claim.story(JSONB, IMPL-MOBILE-CLAIM-STORY-SCHEMA-001) 가 있으면 6슬라이드 리치
// 카피를, 없으면(NULL) 영어 정적 템플릿 fallback 을 렌더한다. story 텍스트는 `**bold**`/`*accent*`
// 인라인 마크업을 RichText 로 렌더(리터럴 마커 노출 없음).
//
// CTA wiring(IMPL-MOBILE-CLAIM-CTA-001) 보존: 마지막 슬라이드의 "Make my Plan" 게이트가
// claim.base_diet_id 를 MealPlanGenerateSheet 에 넘겨 셀럽 picker 를 스킵한다.
// 게스트 boot-kick 불변식(PR195) 보존: 게스트는 credits fetch skip + 시트 미렌더 + 로그인 게이트.
//
// 모든 슬라이드는 가로 ScrollView 에 동시 마운트된다(가상화 없음 — 슬라이드 수 ≤ 6).

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
  type StyleProp,
  type TextStyle,
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

// claim_type → 표시 버킷(ClaimCard BUCKET_LABEL 과 정합). decode eyebrow fallback 에 사용.
const BUCKET_LABEL: Record<string, string> = {
  food: 'Diet',
  beauty: 'Beauty',
  workout: 'Wellness',
  sleep: 'Wellness',
  supplement: 'Wellness',
  brand: 'Wellness',
  philosophy: 'Wellness',
};

// ── 인라인 마크업: `**bold**` / `*accent*` → 스타일된 Text span ─────────
export type RichToken = { t: string; kind: 'bold' | 'accent' | 'normal' };

// exported for unit test (IMPL-MOBILE-CLAIM-STORY-SCHEMA-001).
export function parseRich(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  const re = /\*\*[^*]+\*\*|\*[^*]+\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: text.slice(last, m.index), kind: 'normal' });
    const matched = m[0];
    const isBold = matched.startsWith('**');
    tokens.push({ t: isBold ? matched.slice(2, -2) : matched.slice(1, -1), kind: isBold ? 'bold' : 'accent' });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ t: text.slice(last), kind: 'normal' });
  return tokens;
}

function RichText({
  text,
  style,
}: {
  text: string;
  style: StyleProp<TextStyle>;
}): React.JSX.Element {
  const theme = useTheme();
  const tokens = parseRich(text);
  return (
    <Text style={style}>
      {tokens.map((tok, i) => (
        <Text
          key={`${tok.kind}-${String(i)}-${tok.t.slice(0, 6)}`}
          style={
            tok.kind === 'bold'
              ? { fontWeight: theme.weight.bold }
              : tok.kind === 'accent'
                ? { fontStyle: 'italic' }
                : undefined
          }
        >
          {tok.t}
        </Text>
      ))}
    </Text>
  );
}

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
            body="Please try again in a moment."
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
  const s = claim.story; // ClaimStory | null — 있으면 리치 카피, 없으면 영어 템플릿 fallback.

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
  // CTA 라벨 통일: story 의 button 우선, 없으면 "Make my Plan"(피드 ClaimCard 와 일치).
  const liveButtonLabel = s?.cta.button ?? 'Make my Plan';

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
            Alert.alert('No credits left', 'You have no meal-plan credits remaining.');
            return;
          }
          setSheetVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={liveButtonLabel}
        disabled={creditsLoading}
        style={[styles.ctaLive, ctaDisabled ? styles.ctaDisabled : null]}
      >
        <Text style={styles.ctaLiveText}>{liveButtonLabel}</Text>
        <Ionicons name="arrow-forward" size={18} color={theme.news.ctaLive.fg} />
      </TouchableOpacity>
    )
  ) : showComingSoon ? (
    <View style={styles.ctaComingSoon} accessibilityRole="text">
      <Ionicons name="time-outline" size={18} color={theme.news.lime} />
      <Text style={styles.ctaComingSoonText}>Personalized plan — coming soon</Text>
    </View>
  ) : null;

  const disclaimerText =
    s?.cta.disclaimer != null && s.cta.disclaimer !== ''
      ? s.cta.disclaimer
      : showDisclaimer
        ? HEALTH_DISCLAIMER
        : null;

  // ── 슬라이드 구성 ─────────────────────────────────────────────
  const slides: Array<{ key: string; tone: 'light' | 'dark'; node: React.ReactNode }> = [];

  // 1) Decode — 후킹.
  slides.push({
    key: 'decode',
    tone: 'light',
    node: (
      <>
        <Text style={styles.eyebrow}>{s?.hook.eyebrow ?? `${bucket} · CELEBRITY DECODE`}</Text>
        <RichText text={s?.hook.headline ?? claim.headline} style={styles.headline} />
        <RichText
          text={s?.hook.sub ?? 'What they actually do — and what it looks like rescaled to you.'}
          style={styles.subtitle}
        />
        <View style={styles.swipeHint}>
          <Text style={styles.swipeHintText}>{s?.hook.swipe ?? 'Swipe'}</Text>
          <Ionicons name="arrow-forward" size={14} color={theme.news.muted} />
        </View>
      </>
    ),
  });

  // 2) What they do — 전문/불릿 + trust + 출처.
  slides.push({
    key: 'what',
    tone: 'light',
    node: (
      <>
        <Text style={styles.eyebrow}>{s?.what.eyebrow ?? 'WHAT THEY DO'}</Text>
        {s !== null ? (
          <>
            <RichText text={s.what.headline} style={styles.headlineSm} />
            {s.what.rows.map((row, i) => (
              <View key={`what-${String(i)}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <RichText text={row} style={styles.bulletText} />
              </View>
            ))}
            {s.what.source != null && s.what.source !== '' ? (
              <Text style={styles.sourceNote}>{s.what.source}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.bodyText}>
            {claim.body !== null && claim.body !== ''
              ? claim.body
              : 'Their real routine, compiled from the sources below.'}
          </Text>
        )}
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

  // 3) Science — story.science 있을 때만(✓ checks + ! caveat).
  if (s?.science != null) {
    const sci = s.science;
    slides.push({
      key: 'science',
      tone: 'light',
      node: (
        <>
          <Text style={styles.eyebrow}>{sci.eyebrow ?? 'WHAT THE SCIENCE SAYS'}</Text>
          <RichText text={sci.headline} style={styles.headlineSm} />
          {sci.checks.map((c, i) => (
            <View key={`sci-${String(i)}`} style={styles.bulletRow}>
              <Ionicons name="checkmark" size={16} color={theme.news.forest} style={styles.checkIcon} />
              <RichText text={c} style={styles.bulletText} />
            </View>
          ))}
          {sci.caveat != null && sci.caveat !== '' ? (
            <View style={styles.caveatRow}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.news.clay} style={styles.checkIcon} />
              <RichText text={sci.caveat} style={styles.caveatText} />
            </View>
          ) : null}
          {sci.source != null && sci.source !== '' ? (
            <Text style={styles.sourceNote}>{sci.source}</Text>
          ) : null}
        </>
      ),
    });
  }

  // 4·5) The catch / Rescaled to you — State A 한정(엔진-정직 약속).
  if (showInspiredCta) {
    slides.push({
      key: 'catch',
      tone: 'dark',
      node: (
        <>
          <Text style={styles.eyebrowOnDark}>{s?.catch.eyebrow ?? "BUT HERE'S THE CATCH"}</Text>
          <RichText
            text={s?.catch.headline ?? 'Built for their body & goals.'}
            style={styles.headlineOnDark}
          />
          <RichText
            text={
              s?.catch.body ??
              'Copy it exactly and the calories and macros may simply not fit your day.'
            }
            style={styles.bodyOnDark}
          />
        </>
      ),
    });

    const profiles = s?.rescaled.profiles ?? [
      { who: 'Your calories', what: "Set to your daily target — not a performer's." },
      { who: 'Your macros', what: 'Protein · carbs · fat split to your goal.' },
      { who: 'Your foods', what: "Swaps for what you'll actually eat & can find." },
    ];
    slides.push({
      key: 'rescale',
      tone: 'light',
      node: (
        <>
          <Text style={styles.eyebrow}>{s?.rescaled.eyebrow ?? 'RESCALED TO YOU'}</Text>
          <RichText
            text={s?.rescaled.headline ?? 'Same base. Your numbers.'}
            style={styles.headlineSm}
          />
          <View style={styles.rescaleRows}>
            {profiles.map((p, i) => (
              <View key={`resc-${String(i)}`} style={styles.rescaleRow}>
                <Text style={styles.rescaleLabel}>{p.who.toUpperCase()}</Text>
                <RichText text={p.what} style={styles.rescaleDesc} />
              </View>
            ))}
          </View>
        </>
      ),
    });
  }

  // 6) Your turn — CTA(상태별) + 면책.
  slides.push({
    key: 'cta',
    tone: 'dark',
    node: (
      <>
        <Text style={styles.eyebrowOnDark}>
          {s?.cta.eyebrow ?? (showInspiredCta ? 'YOUR TURN' : showComingSoon ? 'COMING SOON' : 'MORE')}
        </Text>
        <RichText
          text={
            s?.cta.headline ??
            (showInspiredCta
              ? 'Get your version.'
              : showComingSoon
                ? 'A personalized plan is coming soon.'
                : 'Explore the sources to learn more.')
          }
          style={styles.headlineOnDark}
        />
        {showInspiredCta ? (
          <RichText
            text={
              s?.cta.sub ??
              'Answer a few quick questions — we rescale to your calories, macros & tastes.'
            }
            style={styles.bodyOnDark}
          />
        ) : null}
        {ctaNode}
        {disclaimerText !== null ? (
          <Text style={styles.disclaimerOnDark}>{disclaimerText}</Text>
        ) : null}
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
            Alert.alert('Plan created', 'Find it under My Plan in the News header.');
          }}
        />
      ) : null}
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
    slideScroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
    },
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
    headlineSm: {
      fontFamily: theme.font.display,
      fontSize: 24,
      fontWeight: theme.weight.medium,
      color: n.ink,
      lineHeight: 30,
      letterSpacing: -0.3,
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

    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(2) },
    bulletDot: { fontFamily: theme.font.body, fontSize: 15, color: n.clay, lineHeight: 22 },
    bulletText: { flex: 1, fontFamily: theme.font.body, fontSize: 14.5, color: n.inkSoft, lineHeight: 22 },
    checkIcon: { marginTop: 3 },
    caveatRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space(2),
      marginTop: theme.space(1),
      paddingTop: theme.space(2),
      borderTopWidth: 1,
      borderTopColor: n.line,
    },
    caveatText: { flex: 1, fontFamily: theme.font.body, fontSize: 14.5, color: n.ink, lineHeight: 22 },
    sourceNote: { fontFamily: theme.font.mono, fontSize: 10.5, color: n.muted, lineHeight: 15, marginTop: theme.space(1) },

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
    sourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      paddingVertical: theme.space(1),
    },
    sourceRowDisabled: { paddingVertical: theme.space(1), gap: 2 },
    sourceLink: {
      fontFamily: theme.font.body,
      fontSize: 14,
      color: n.forest,
      textDecorationLine: 'underline',
    },
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
    ctaLiveText: {
      fontFamily: theme.font.body,
      fontSize: 15,
      fontWeight: theme.weight.bold,
      color: n.ctaLive.fg,
    },
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
    ctaComingSoonText: {
      fontFamily: theme.font.body,
      fontSize: 14,
      fontWeight: theme.weight.bold,
      color: n.lime,
    },
    disclaimerOnDark: {
      fontFamily: theme.font.mono,
      fontSize: 10,
      color: n.cream2,
      lineHeight: 15,
      marginTop: theme.space(2),
      opacity: 0.85,
    },

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
