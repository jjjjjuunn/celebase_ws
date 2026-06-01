// Wellness claim 스토리 — feed 카드 탭 시 진입. 카드뉴스 캐러셀 (card-system 디자인 포팅).
// 가로 스와이프: decode → what they do(+출처) → [science] → [the catch → rescaled to you] → your turn(CTA).
//
// 아트디렉션: celebase card-system(card-template.html) 의 네이티브 포팅 — Motif 블롭 · 큰 Fraunces
// 헤드라인 · 컬러 accent(forest-2/lime) · 번호/체크 칩 · 따옴표 · STATE 뱃지 · cele*base* 워드마크.
// News-scoped 폰트(theme.news.font: Fraunces / Hanken Grotesk / Spline Sans Mono). 타이포는 앱이
// 렌더(이미지에 글자 굽지 않음 — 다국어·수정·법적, safezone 스펙).
//
// 콘텐츠 원본: claim.story(JSONB) 가 있으면 6슬라이드 리치, 없으면 영어 템플릿 fallback.
// `**bold**`/`*accent*` 인라인 마크업은 RichText 로 렌더(accent=serif italic, 옵션 컬러).
//
// CTA·게스트 boot-kick 불변식(PR195) 보존: 게스트는 credits skip + 시트 미렌더 + 로그인 게이트.
// 전 슬라이드 동시 마운트(가상화 없음 — ≤6).

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

const BUCKET_LABEL: Record<string, string> = {
  food: 'Diet',
  beauty: 'Beauty',
  workout: 'Wellness',
  sleep: 'Wellness',
  supplement: 'Wellness',
  brand: 'Wellness',
  philosophy: 'Wellness',
};

// ── 인라인 마크업: `**bold**`(faux-bold) / `*accent*`(serif italic + 옵션 컬러) ────
type RichToken = { t: string; kind: 'bold' | 'accent' | 'normal' };

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
  accentColor,
}: {
  text: string;
  style: StyleProp<TextStyle>;
  accentColor?: string;
}): React.JSX.Element {
  const theme = useTheme();
  const tokens = parseRich(text);
  return (
    <Text style={style}>
      {tokens.map((tok, i) => {
        const key = `${tok.kind}-${String(i)}-${tok.t.slice(0, 6)}`;
        if (tok.kind === 'bold') {
          return (
            <Text key={key} style={{ fontWeight: theme.weight.bold }}>
              {tok.t}
            </Text>
          );
        }
        if (tok.kind === 'accent') {
          // 에디토리얼 accent — serif(Fraunces) italic + 옵션 컬러(헤드라인은 forest-2/lime).
          return (
            <Text
              key={key}
              style={[
                { fontFamily: theme.news.font.display, fontStyle: 'italic' },
                accentColor !== undefined ? { color: accentColor } : null,
              ]}
            >
              {tok.t}
            </Text>
          );
        }
        return <Text key={key}>{tok.t}</Text>;
      })}
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
  const s = claim.story; // ClaimStory | null

  const showDisclaimer = claim.trust_grade === 'D' || claim.is_health_claim;
  const isFoodCard = claim.claim_type === 'food';
  const showInspiredCta = isFoodCard && claim.base_diet_id !== null;
  const showComingSoon = isFoodCard && claim.base_diet_id === null;

  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [areaH, setAreaH] = useState(0);
  const isGuest = useIsGuest();
  const { credits, loading: creditsLoading } = useMealPlanCredits(isGuest);
  const maxDays =
    credits === null ? 0 : credits.credits_remaining === null ? 7 : credits.credits_remaining;
  const ctaDisabled = !creditsLoading && maxDays === 0;

  const bucket = (BUCKET_LABEL[claim.claim_type] ?? 'Wellness').toUpperCase();
  const liveButtonLabel = s?.cta.button ?? 'Make my Plan';
  // 카테고리 accent — Diet/Beauty=clay, Wellness=forest-2. (Beauty rose 토큰은 후속.)
  const isWellness =
    claim.claim_type === 'workout' || claim.claim_type === 'sleep' || claim.claim_type === 'supplement';
  const accent = isWellness ? theme.news.forest2 : theme.news.clay;

  const ctaNode = showInspiredCta ? (
    isGuest ? (
      <TouchableOpacity
        onPress={() => {
          signalLoginRequired();
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign in to make your plan"
        style={styles.ctaBtn}
      >
        <Text style={styles.ctaBtnText}>Sign in to make your plan</Text>
        <Text style={styles.ctaArrow}>→</Text>
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
        style={[styles.ctaBtn, ctaDisabled ? styles.ctaDisabled : null]}
      >
        <Text style={styles.ctaBtnText}>{liveButtonLabel}</Text>
        <Text style={styles.ctaArrow}>→</Text>
      </TouchableOpacity>
    )
  ) : showComingSoon ? (
    <View style={styles.ctaGhost} accessibilityRole="text">
      <Text style={styles.ctaGhostText}>Personalized plan — coming soon</Text>
      <Text style={styles.ctaGhostArrow}>→</Text>
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

  // 1) Decode
  slides.push({
    key: 'decode',
    tone: 'light',
    node: (
      <>
        <Blob color={theme.news.lime} size={230} top={-70} right={-60} opacity={0.85} />
        <Blob color={accent} size={120} bottom={90} right={-40} opacity={0.45} />
        <Eyebrow theme={theme} text={s?.hook.eyebrow ?? `${bucket} · CELEBRITY DECODE`} dot={accent} />
        <RichText
          text={s?.hook.headline ?? claim.headline}
          style={styles.hHook}
          accentColor={theme.news.forest2}
        />
        <RichText
          text={s?.hook.sub ?? 'What they actually do — and what it looks like rescaled to you.'}
          style={styles.sub}
        />
        <View style={styles.swipeRow}>
          <Text style={styles.swipe}>{(s?.hook.swipe ?? 'SWIPE').toUpperCase()}</Text>
          <Ionicons name="arrow-forward" size={14} color={theme.news.forest} />
        </View>
      </>
    ),
  });

  // 2) What they do
  slides.push({
    key: 'what',
    tone: 'light',
    node: (
      <>
        <Eyebrow theme={theme} text={s?.what.eyebrow ?? 'WHAT THEY DO'} dot={accent} />
        {s !== null ? (
          <>
            <RichText text={s.what.headline} style={styles.hLight} />
            <View style={styles.rows}>
              {s.what.rows.map((row, i) => (
                <View key={`what-${String(i)}`} style={styles.row}>
                  <View style={styles.numChip}>
                    <Text style={styles.numChipText}>{`0${String(i + 1)}`}</Text>
                  </View>
                  <RichText text={row} style={styles.rowText} />
                </View>
              ))}
            </View>
            {s.what.source != null && s.what.source !== '' ? (
              <Text style={styles.srcNote}>{s.what.source}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.body}>
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

  // 3) Science (story 한정)
  if (s?.science != null) {
    const sci = s.science;
    slides.push({
      key: 'science',
      tone: 'light',
      node: (
        <>
          <Eyebrow theme={theme} text={sci.eyebrow ?? 'WHAT THE SCIENCE SAYS'} dot={accent} />
          <RichText text={sci.headline} style={styles.hLight} />
          <View style={styles.rows}>
            {sci.checks.map((c, i) => (
              <View key={`sci-${String(i)}`} style={styles.row}>
                <View style={[styles.markChip, styles.markOk]}>
                  <Text style={styles.markOkText}>✓</Text>
                </View>
                <RichText text={c} style={styles.rowText} />
              </View>
            ))}
            {sci.caveat != null && sci.caveat !== '' ? (
              <View style={styles.row}>
                <View style={[styles.markChip, styles.markWarn]}>
                  <Text style={styles.markWarnText}>!</Text>
                </View>
                <RichText text={sci.caveat} style={styles.rowText} />
              </View>
            ) : null}
          </View>
          {sci.source != null && sci.source !== '' ? (
            <Text style={styles.srcNote}>{sci.source}</Text>
          ) : null}
        </>
      ),
    });
  }

  // 4·5) The catch / Rescaled to you (State A 한정)
  if (showInspiredCta) {
    slides.push({
      key: 'catch',
      tone: 'dark',
      node: (
        <>
          <Text style={styles.quoteMark}>{'”'}</Text>
          <Blob color={theme.news.forest2} size={220} bottom={-70} left={-60} opacity={0.55} />
          <Eyebrow theme={theme} text={s?.catch.eyebrow ?? "BUT HERE'S THE CATCH"} dot={theme.news.lime} onDark />
          <RichText
            text={s?.catch.headline ?? 'Built for their body & goals.'}
            style={styles.hDark}
            accentColor={theme.news.lime}
          />
          <RichText
            text={
              s?.catch.body ??
              'Copy it exactly and the calories and macros may simply not fit your day.'
            }
            style={styles.bodyDark}
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
          <Eyebrow theme={theme} text={s?.rescaled.eyebrow ?? 'RESCALED TO YOU'} dot={accent} />
          <RichText text={s?.rescaled.headline ?? 'Same base. Your numbers.'} style={styles.hLight} />
          <View style={styles.profiles}>
            {profiles.map((p, i) => (
              <View key={`resc-${String(i)}`} style={styles.profile}>
                <Text style={[styles.profileWho, { color: accent }]}>{p.who.toUpperCase()}</Text>
                <RichText text={p.what} style={styles.profileWhat} />
              </View>
            ))}
          </View>
        </>
      ),
    });
  }

  // 6) Your turn — CTA + 면책
  slides.push({
    key: 'cta',
    tone: 'dark',
    node: (
      <>
        {showInspiredCta ? (
          <View style={styles.stateBadge}>
            <Text style={styles.stateBadgeText}>STATE A · LIVE</Text>
          </View>
        ) : null}
        <Blob color={theme.news.forest2} size={200} top={-60} right={-60} opacity={0.5} />
        <Eyebrow
          theme={theme}
          text={s?.cta.eyebrow ?? (showInspiredCta ? 'YOUR TURN' : showComingSoon ? 'COMING SOON' : 'MORE')}
          dot={theme.news.lime}
          onDark
        />
        <RichText
          text={
            s?.cta.headline ??
            (showInspiredCta
              ? 'Get your version.'
              : showComingSoon
                ? 'A personalized plan is coming soon.'
                : 'Explore the sources to learn more.')
          }
          style={styles.hDark}
          accentColor={theme.news.lime}
        />
        {ctaNode}
        {showInspiredCta ? (
          <RichText
            text={
              s?.cta.sub ??
              'Answer a few quick questions — we rescale to your calories, macros & tastes.'
            }
            style={styles.ctaSub}
          />
        ) : null}
        {disclaimerText !== null ? <Text style={styles.disclaimer}>{disclaimerText}</Text> : null}
      </>
    ),
  });

  const total = slides.length;
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(idx, total - 1)));
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
          {slides.map((slide, i) => (
            <View key={slide.key} style={{ width, ...(areaH > 0 ? { height: areaH } : {}) }}>
              <ScrollView
                contentContainerStyle={styles.slideScroll}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={[styles.card, slide.tone === 'dark' ? styles.cardDark : styles.cardLight]}
                >
                  {slide.node}
                  <View style={styles.foot}>
                    <Text style={slide.tone === 'dark' ? styles.wordmarkDark : styles.wordmark}>
                      cele<Text style={styles.wordmarkB}>base</Text>
                    </Text>
                    <Text style={slide.tone === 'dark' ? styles.pagenoDark : styles.pageno}>
                      {`0${String(i + 1)} / 0${String(total)}`}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.dots}>
        {slides.map((slide, i) => (
          <View key={slide.key} style={[styles.dot, i === activeIndex ? styles.dotActive : null]} />
        ))}
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

// ── 소형 컴포넌트 ─────────────────────────────────────────────
interface BlobProps {
  color: string;
  size: number;
  opacity: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}
function Blob({ color, size, opacity, top, bottom, left, right }: BlobProps): React.JSX.Element {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        ...(top !== undefined ? { top } : {}),
        ...(bottom !== undefined ? { bottom } : {}),
        ...(left !== undefined ? { left } : {}),
        ...(right !== undefined ? { right } : {}),
      }}
    />
  );
}

function Eyebrow({
  theme,
  text,
  dot,
  onDark = false,
}: {
  theme: Theme;
  text: string;
  dot: string;
  onDark?: boolean;
}): React.JSX.Element {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.eyebrowRow}>
      <View style={[styles.eyebrowDot, { backgroundColor: dot }]} />
      <Text style={onDark ? styles.eyebrowTextDark : styles.eyebrowText}>{text}</Text>
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
  const f = n.font;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: n.paper },
    header: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(2) },
    backButton: { paddingVertical: theme.space(2), alignSelf: 'flex-start' },
    backButtonText: {
      fontFamily: f.mono,
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
      paddingHorizontal: theme.space(6),
      paddingTop: theme.space(7),
      paddingBottom: theme.space(5),
      minHeight: 440,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    cardLight: { backgroundColor: n.cream, borderColor: n.line },
    cardDark: { backgroundColor: n.forest, borderColor: n.forest },

    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    eyebrowDot: { width: 8, height: 8, borderRadius: 4 },
    eyebrowText: {
      fontFamily: f.mono,
      fontSize: 12,
      fontWeight: theme.weight.semibold,
      color: n.forest,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    eyebrowTextDark: {
      fontFamily: f.mono,
      fontSize: 12,
      fontWeight: theme.weight.semibold,
      color: n.lime,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },

    hHook: { fontFamily: f.display, fontSize: 40, fontWeight: theme.weight.medium, color: n.ink, lineHeight: 44, letterSpacing: -0.6, marginTop: theme.space(4) },
    hLight: { fontFamily: f.display, fontSize: 28, fontWeight: theme.weight.medium, color: n.ink, lineHeight: 32, letterSpacing: -0.3, marginTop: theme.space(3), marginBottom: theme.space(3) },
    hDark: { fontFamily: f.display, fontSize: 34, fontWeight: theme.weight.medium, color: n.cream, lineHeight: 38, letterSpacing: -0.4, marginTop: theme.space(4) },
    sub: { fontFamily: f.body, fontSize: 16, color: n.inkSoft, lineHeight: 24, marginTop: theme.space(4) },
    body: { fontFamily: f.body, fontSize: 16, color: n.inkSoft, lineHeight: 25 },
    bodyMuted: { fontFamily: f.body, fontSize: 14, color: n.muted },
    bodyDark: { fontFamily: f.body, fontSize: 16, color: n.cream2, lineHeight: 25, marginTop: theme.space(4) },

    swipeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.space(4) },
    swipe: { fontFamily: f.mono, fontSize: 12, color: n.forest, letterSpacing: 2.4, fontWeight: theme.weight.semibold },

    rows: { gap: theme.space(3) },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(3) },
    numChip: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: n.cream2,
      borderWidth: 1.4,
      borderColor: n.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numChipText: { fontFamily: f.mono, fontSize: 13, fontWeight: theme.weight.semibold, color: n.forest },
    markChip: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.4, alignItems: 'center', justifyContent: 'center' },
    markOk: { backgroundColor: n.cream2, borderColor: n.forest2 },
    markOkText: { fontSize: 15, color: n.forest2, fontWeight: theme.weight.bold },
    markWarn: { backgroundColor: n.cream2, borderColor: n.clay },
    markWarnText: { fontSize: 15, color: n.clay, fontWeight: theme.weight.bold },
    rowText: { flex: 1, fontFamily: f.body, fontSize: 15, color: n.inkSoft, lineHeight: 22, marginTop: 4 },

    srcNote: { fontFamily: f.mono, fontSize: 10.5, color: n.muted, lineHeight: 16, marginTop: theme.space(4) },
    trustRow: { flexDirection: 'row', marginTop: theme.space(3) },
    sourcesSection: { gap: theme.space(2), marginTop: theme.space(3) },
    sectionTitle: { fontFamily: f.mono, fontSize: 10.5, fontWeight: theme.weight.bold, color: n.muted, letterSpacing: 1, textTransform: 'uppercase' },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2), paddingVertical: theme.space(1) },
    sourceRowDisabled: { paddingVertical: theme.space(1), gap: 2 },
    sourceLink: { fontFamily: f.body, fontSize: 14, color: n.forest, textDecorationLine: 'underline' },
    sourceOutlet: { fontFamily: f.body, fontSize: 14, color: n.muted },
    sourceUnavailable: { fontFamily: f.mono, fontSize: 11, color: n.clay },

    profiles: { marginTop: theme.space(2) },
    profile: { borderTopWidth: 1.4, borderTopColor: n.line, paddingVertical: theme.space(3), gap: 4 },
    profileWho: { fontFamily: f.mono, fontSize: 11, fontWeight: theme.weight.semibold, letterSpacing: 1 },
    profileWhat: { fontFamily: f.body, fontSize: 15, color: n.inkSoft, lineHeight: 21 },

    quoteMark: { position: 'absolute', top: -34, right: 8, fontFamily: f.display, fontSize: 150, color: n.lime, opacity: 0.14 },
    stateBadge: { position: 'absolute', top: theme.space(4), right: theme.space(4), backgroundColor: n.lime, borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
    stateBadgeText: { fontFamily: f.mono, fontSize: 9.5, fontWeight: theme.weight.bold, color: n.ink, letterSpacing: 1 },

    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      alignSelf: 'flex-start',
      marginTop: theme.space(5),
      paddingVertical: theme.space(4),
      paddingHorizontal: theme.space(6),
      backgroundColor: n.ctaLive.bg,
      borderRadius: theme.radius.pill,
    },
    ctaDisabled: { opacity: 0.55 },
    ctaBtnText: { fontFamily: f.body, fontSize: 18, fontWeight: theme.weight.bold, color: n.ctaLive.fg },
    ctaArrow: { fontFamily: f.mono, fontSize: 18, fontWeight: theme.weight.bold, color: n.ctaLive.fg },
    ctaGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space(2),
      alignSelf: 'flex-start',
      marginTop: theme.space(5),
      paddingVertical: theme.space(3),
      paddingHorizontal: theme.space(5),
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: n.lime,
    },
    ctaGhostText: { fontFamily: f.body, fontSize: 16, fontWeight: theme.weight.bold, color: n.lime },
    ctaGhostArrow: { fontFamily: f.mono, fontSize: 16, fontWeight: theme.weight.bold, color: n.lime },
    ctaSub: { fontFamily: f.body, fontSize: 15, color: n.cream2, lineHeight: 22, marginTop: theme.space(4) },
    disclaimer: { fontFamily: f.mono, fontSize: 9.5, color: n.cream2, lineHeight: 15, marginTop: theme.space(3), opacity: 0.8 },

    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: theme.space(5) },
    wordmark: { fontFamily: f.display, fontSize: 18, fontWeight: theme.weight.semibold, color: n.ink },
    wordmarkDark: { fontFamily: f.display, fontSize: 18, fontWeight: theme.weight.semibold, color: n.cream },
    wordmarkB: { color: n.clay },
    pageno: { fontFamily: f.mono, fontSize: 11, color: n.muted, letterSpacing: 1.4 },
    pagenoDark: { fontFamily: f.mono, fontSize: 11, color: n.cream2, letterSpacing: 1.4, opacity: 0.7 },

    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: theme.space(3) },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: n.line },
    dotActive: { backgroundColor: n.forest, width: 20 },
  });
}
