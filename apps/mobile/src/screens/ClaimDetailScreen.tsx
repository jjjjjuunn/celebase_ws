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
import { LinearGradient } from 'expo-linear-gradient';

import type { schemas } from '@celebbase/shared-types';

import { FocalImage } from '../components/FocalImage';
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
        // 각 토큰 Text 에 부모 style 을 명시 전파한다. RN nested Text 의 color 상속에
        // 의존하면(부모만 style) normal/bold 토큰이 기본색(검정)으로 폴백해 dark 슬라이드
        // (cream 텍스트)가 안 보인다 — IMPL-MOBILE-CLAIM-STORY-POLISH 회귀. 명시 전파로 봉인.
        if (tok.kind === 'bold') {
          return (
            <Text key={key} style={[style, { fontWeight: theme.weight.bold }]}>
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
                style,
                { fontFamily: theme.news.font.display, fontStyle: 'italic' },
                accentColor !== undefined ? { color: accentColor } : null,
              ]}
            >
              {tok.t}
            </Text>
          );
        }
        return (
          <Text key={key} style={style}>
            {tok.t}
          </Text>
        );
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
  const { width, height } = useWindowDimensions();
  const { claim, sources } = data;
  const s = claim.story; // ClaimStory | null

  const showDisclaimer = claim.trust_grade === 'D' || claim.is_health_claim;
  const isFoodCard = claim.claim_type === 'food';
  const showInspiredCta = isFoodCard && claim.base_diet_id !== null;
  const showComingSoon = isFoodCard && claim.base_diet_id === null;

  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // areaH = 측정된 carousel 영역 높이. onLayout 전 초기값 = window height — 측정 전 블랭크
  // 플래시를 막고(고정 프레임 디자인 보존: 모든 슬라이드 동일 높이), RN-testing-library 가
  // onLayout 을 발화하지 않아도 슬라이드가 렌더되게 한다(areaH>0 게이트 충족).
  const [areaH, setAreaH] = useState(height);
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
      // disabled(크레딧 0/미로딩)는 State-B ghost(lime 외곽선)와 구별되는 muted fill+lock+헬퍼.
      // opacity 0.55(=lime 올리브화) 금지 — enabled 는 canonical lime+ink 그대로.
      <>
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
          {ctaDisabled ? (
            <Ionicons name="lock-closed" size={15} color={theme.news.inkSoft} />
          ) : null}
          <Text style={[styles.ctaBtnText, ctaDisabled ? styles.ctaBtnTextMuted : null]}>
            {liveButtonLabel}
          </Text>
          {ctaDisabled ? null : <Text style={styles.ctaArrow}>→</Text>}
        </TouchableOpacity>
        {ctaDisabled ? (
          <Text style={styles.ctaHelper}>No credits left — manage in My Plan.</Text>
        ) : null}
      </>
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
  const slides: Array<{
    key: string;
    tone: 'light' | 'dark';
    node: React.ReactNode;
    hero?: { url: string; layout: 'fullbleed' | 'band'; focal?: { x: number; y: number } | null } | null;
    // fullbleed hook(표지)=이미지 우선 → 바닥 위주 가벼운 scrim. 그 외 fullbleed=정보 슬라이드 →
    // 텍스트 영역 전체를 덮는 강한 scrim(cream 글자 가독, CARDNEWS-HERO-CUSTOM-001 Gemini#1).
    cover?: boolean;
  }> = [];

  // hero 이미지 + 슬라이드별 layout(fullbleed/band) 존중. 생략 시 역할 기본값(hook=fullbleed, 그 외=band).
  // CARDNEWS-HERO-CUSTOM-001: 비-hook 도 layout='fullbleed' 면 fullbleed 렌더(텍스트 onDark cream).
  // focal(image_focal)로 크롭 위치를 통제(FocalImage). 정보 슬라이드는 layout 미설정 시 band(기존 동작).
  const hookImage = s?.hook.image ?? null;
  const hookFb = hookImage !== null && (s?.hook.layout ?? 'fullbleed') === 'fullbleed';
  const whatImage = s?.what.image ?? null;
  const whatFb = whatImage !== null && (s?.what.layout ?? 'band') === 'fullbleed';
  const scienceImage = s?.science?.image ?? null;
  const scienceFb = scienceImage !== null && (s?.science?.layout ?? 'band') === 'fullbleed';
  const rescaledImage = s?.rescaled.image ?? null;
  const rescaledFb = rescaledImage !== null && (s?.rescaled.layout ?? 'band') === 'fullbleed';

  // 1) Decode — 이미지 있으면 fullbleed(표지): 이미지 위 scrim + 밝은 글자 오버레이.
  slides.push({
    key: 'decode',
    tone: 'light',
    cover: true,
    hero: hookImage !== null ? { url: hookImage, layout: hookFb ? 'fullbleed' : 'band', focal: s?.hook.image_focal ?? null } : null,
    node: (
      <>
        <Eyebrow
          theme={theme}
          text={s?.hook.eyebrow ?? `${bucket} · CELEBRITY DECODE`}
          dot={hookFb ? theme.news.lime : accent}
          onDark={hookFb}
        />
        <RichText
          text={s?.hook.headline ?? claim.headline}
          style={hookFb ? styles.hHookOnImg : styles.hHook}
          accentColor={hookFb ? theme.news.lime : theme.news.forest2}
        />
        <RichText
          text={s?.hook.sub ?? 'What they actually do — and what it looks like rescaled to you.'}
          style={hookFb ? styles.subOnImg : styles.sub}
        />
        <View style={styles.swipeRow}>
          <Text style={hookFb ? styles.swipeOnImg : styles.swipe}>{(s?.hook.swipe ?? 'SWIPE').toUpperCase()}</Text>
          <Ionicons name="arrow-forward" size={14} color={hookFb ? theme.news.lime : theme.news.forest} />
        </View>
      </>
    ),
  });

  // 2) What they do
  slides.push({
    key: 'what',
    tone: 'light',
    hero: whatImage !== null ? { url: whatImage, layout: whatFb ? 'fullbleed' : 'band', focal: s?.what.image_focal ?? null } : null,
    node: (
      <>
        <Eyebrow theme={theme} text={s?.what.eyebrow ?? 'WHAT THEY DO'} dot={whatFb ? theme.news.lime : accent} onDark={whatFb} />
        {s !== null ? (
          <>
            <RichText text={s.what.headline} style={[styles.hLight, whatFb ? styles.onImgText : null]} />
            <View style={styles.rows}>
              {s.what.rows.map((row, i) => (
                <View key={`what-${String(i)}`} style={styles.row}>
                  <View style={[styles.numChip, whatFb ? styles.chipOnImg : null]}>
                    <Text style={[styles.numChipText, whatFb ? styles.onImgText : null]}>{`0${String(i + 1)}`}</Text>
                  </View>
                  <RichText text={row} style={[styles.rowText, whatFb ? styles.onImgText : null]} />
                </View>
              ))}
            </View>
            {s.what.source != null && s.what.source !== '' ? (
              <Text style={[styles.srcNote, whatFb ? styles.onImgTextSoft : null]}>{s.what.source}</Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.body, whatFb ? styles.onImgTextSoft : null]}>
            {claim.body !== null && claim.body !== ''
              ? claim.body
              : 'Their real routine, compiled from the sources below.'}
          </Text>
        )}
        <View style={styles.trustRow}>
          <TrustGradeBadge grade={claim.trust_grade} />
        </View>
        <View style={styles.sourcesSection}>
          <Text style={[styles.sectionTitle, whatFb ? styles.onImgTextSoft : null]}>Sources</Text>
          {sources.length === 0 ? (
            <Text style={[styles.bodyMuted, whatFb ? styles.onImgTextSoft : null]}>No sources available.</Text>
          ) : (
            sources.map((source) => <SourceRow key={source.id} source={source} onDark={whatFb} />)
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
      hero: scienceImage !== null ? { url: scienceImage, layout: scienceFb ? 'fullbleed' : 'band', focal: sci.image_focal ?? null } : null,
      node: (
        <>
          <Eyebrow theme={theme} text={sci.eyebrow ?? 'WHAT THE SCIENCE SAYS'} dot={scienceFb ? theme.news.lime : accent} onDark={scienceFb} />
          <RichText text={sci.headline} style={[styles.hLight, scienceFb ? styles.onImgText : null]} />
          <View style={styles.rows}>
            {sci.checks.map((c, i) => (
              <View key={`sci-${String(i)}`} style={styles.row}>
                <View style={[styles.markChip, styles.markOk, scienceFb ? styles.chipOnImg : null]}>
                  <Text style={[styles.markOkText, scienceFb ? styles.onImgText : null]}>✓</Text>
                </View>
                <RichText text={c} style={[styles.rowText, scienceFb ? styles.onImgText : null]} />
              </View>
            ))}
            {sci.caveat != null && sci.caveat !== '' ? (
              <View style={styles.row}>
                <View style={[styles.markChip, styles.markWarn, scienceFb ? styles.chipOnImg : null]}>
                  <Text style={[styles.markWarnText, scienceFb ? styles.onImgText : null]}>!</Text>
                </View>
                <RichText text={sci.caveat} style={[styles.rowText, scienceFb ? styles.onImgText : null]} />
              </View>
            ) : null}
          </View>
          {sci.source != null && sci.source !== '' ? (
            <Text style={[styles.srcNote, scienceFb ? styles.onImgTextSoft : null]}>{sci.source}</Text>
          ) : null}
        </>
      ),
    });
  }

  // 4·5) The catch / Rescaled to you (State A 한정)
  if (showInspiredCta) {
    // catch 도 다른 슬라이드처럼 band(사진+다크 카피)로 통일(IMPL-MOBILE-CARDNEWS-UNIFY-001).
    // 이미지 없으면 솔리드 다크 fallback(이 경우에만 큰 따옴표 모티프 — 극적 전환 유지).
    const catchImage = s?.catch.image ?? null;
    const catchFb = catchImage !== null && (s?.catch.layout ?? 'band') === 'fullbleed';
    slides.push({
      key: 'catch',
      tone: 'dark',
      hero: catchImage !== null ? { url: catchImage, layout: catchFb ? 'fullbleed' : 'band', focal: s?.catch.image_focal ?? null } : null,
      node: (
        <>
          {catchImage === null ? <Text style={styles.quoteMark}>{'”'}</Text> : null}
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
      hero: rescaledImage !== null ? { url: rescaledImage, layout: rescaledFb ? 'fullbleed' : 'band', focal: s?.rescaled.image_focal ?? null } : null,
      node: (
        <>
          <Eyebrow theme={theme} text={s?.rescaled.eyebrow ?? 'RESCALED TO YOU'} dot={rescaledFb ? theme.news.lime : accent} onDark={rescaledFb} />
          <RichText text={s?.rescaled.headline ?? 'Same base. Your numbers.'} style={[styles.hLight, rescaledFb ? styles.onImgText : null]} />
          <View style={styles.profiles}>
            {profiles.map((p, i) => (
              <View key={`resc-${String(i)}`} style={[styles.profile, rescaledFb ? styles.profileOnImg : null]}>
                <Text style={[styles.profileWho, { color: rescaledFb ? theme.news.lime : accent }]}>{p.who.toUpperCase()}</Text>
                <RichText text={p.what} style={[styles.profileWhat, rescaledFb ? styles.onImgTextSoft : null]} />
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
        {areaH > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
          >
            {slides.map((slide, i) => {
              const fb = slide.hero?.layout === 'fullbleed';
              const band = slide.hero?.layout === 'band';
              const footDark = slide.tone === 'dark' || fb;
              const hero = slide.hero ?? null;
              // band 이미지 = 카드 높이의 ~44% (고정 px → 프레임 비율). card flex:1 이라 areaH-마진.
              const bandH = Math.round((areaH - theme.space(2) * 2) * 0.44);
              return (
                // 고정 프레임: slidePage(width×areaH) 안에서 card flex:1 → 전 슬라이드 동일 높이.
                // 내부 = [fullbleed 배경 | band 상단 이미지] + [콘텐츠 ScrollView flex:1] + [footer 바닥 고정].
                <View key={slide.key} style={[styles.slidePage, { width, height: areaH }]}>
                  <View
                    style={[
                      styles.card,
                      fb ? styles.cardImage : slide.tone === 'dark' ? styles.cardDark : styles.cardLight,
                    ]}
                  >
                    {fb && hero !== null ? (
                      <>
                        <FocalImage uri={hero.url} focal={hero.focal} style={StyleSheet.absoluteFill} />
                        {slide.cover === true ? (
                          // 표지(hook): 이미지 우선 — 바닥 위주 4-stop scrim(상단 투명, 하단 0.94).
                          // 최종 stop은 동일 hue alpha-0(transparent 금지: RN=검정 hue-shift).
                          <LinearGradient
                            colors={['rgba(18,28,20,0.94)', 'rgba(18,28,20,0.6)', 'rgba(18,28,20,0.12)', 'rgba(18,28,20,0)']}
                            locations={[0, 0.3, 0.55, 0.7]}
                            start={{ x: 0, y: 1 }}
                            end={{ x: 0, y: 0 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                          />
                        ) : (
                          // 정보 슬라이드(what/science/rescaled/catch) fullbleed: 텍스트가 상단 정렬이라
                          // scrim 도 상단 가중(상단 0.9 → 하단 0.66). 상단 글자 영역은 진하게 보장(이미지 밝기
                          // 무관 cream 가독, Gemini#1) + 하단은 footer 가독 유지하며 이미지가 약하게 비침.
                          <LinearGradient
                            colors={['rgba(18,28,20,0.9)', 'rgba(18,28,20,0.78)', 'rgba(18,28,20,0.66)']}
                            locations={[0, 0.55, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                          />
                        )}
                      </>
                    ) : null}
                    {band && hero !== null ? (
                      <FocalImage
                        uri={hero.url}
                        focal={hero.focal}
                        style={[styles.bandImage, { height: bandH }]}
                      />
                    ) : null}
                    {fb ? (
                      // fullbleed 콘텐츠도 ScrollView — 텍스트 많은 정보 슬라이드가 클립되지 않게(Gemini#2/Codex F1).
                      // 표지(hook)는 바닥 정렬(포스터 룩); 정보 슬라이드는 상단 정렬로 통일 → 콘텐츠 길이와
                      // 무관하게 글자 시작점이 항상 같아 슬라이드 간 읽기 리듬이 흔들리지 않는다(IMPL-MOBILE-CLAIM-HERO-CUSTOM-001).
                      <ScrollView
                        style={styles.cardScroll}
                        contentContainerStyle={[styles.fbContent, slide.cover === true ? styles.fbAnchorBottom : styles.fbAnchorTop]}
                        showsVerticalScrollIndicator={false}
                      >
                        {slide.node}
                      </ScrollView>
                    ) : (
                      <ScrollView
                        style={styles.cardScroll}
                        contentContainerStyle={styles.cardContent}
                        showsVerticalScrollIndicator={false}
                      >
                        {slide.node}
                      </ScrollView>
                    )}
                    <View style={[styles.foot, fb ? styles.footFb : null]}>
                      <Text style={footDark ? styles.wordmarkDark : styles.wordmark}>
                        cele<Text style={styles.wordmarkB}>base</Text>
                      </Text>
                      <Text style={footDark ? styles.pagenoDark : styles.pageno}>
                        {`0${String(i + 1)} / 0${String(total)}`}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : null}
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
  // fullbleed 정보 슬라이드(강한 scrim 위) 에서 cream 변형 — 생략 시 기존 light-tone(forest/muted).
  onDark?: boolean;
}

function SourceRow({ source, onDark = false }: SourceRowProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const allowed = isAllowedSourceUrl(source.url);
  const date = source.published_date !== null ? source.published_date.slice(0, 4) : null;

  if (!allowed || source.url === null) {
    return (
      <View style={styles.sourceRowDisabled}>
        <Text style={[styles.sourceOutlet, onDark ? styles.onImgTextSoft : null]}>
          {source.outlet}
          {date !== null ? ` · ${date}` : ''}
        </Text>
        <Text style={[styles.sourceUnavailable, onDark ? styles.onImgTextSoft : null]}>
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
      <Ionicons name="open-outline" size={15} color={onDark ? theme.news.lime : theme.news.forest} />
      <Text style={[styles.sourceLink, onDark ? styles.onImgText : null]}>
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
    // 고정 프레임: slidePage(width×areaH)의 패딩 안에서 card flex:1 → 전 슬라이드 동일 높이.
    slidePage: { paddingHorizontal: theme.space(4), paddingVertical: theme.space(2) },
    card: { flex: 1, borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
    cardLight: { backgroundColor: n.cream, borderColor: n.line },
    cardDark: { backgroundColor: n.forest, borderColor: n.forest },
    cardImage: { backgroundColor: n.forest, borderColor: n.forest },
    // band 상단 이미지 — 풀폭, 높이는 렌더에서 카드 높이의 ~44%로 인라인 주입.
    bandImage: { width: '100%' },
    // 콘텐츠 영역 — 내부 스크롤(overflow 안전망). 패딩은 콘텐츠가 보유(band 이미지는 풀폭이라 카드 패딩 0).
    cardScroll: { flex: 1 },
    cardContent: { flexGrow: 1, paddingHorizontal: theme.space(6), paddingTop: theme.space(6), paddingBottom: theme.space(2) },
    // fullbleed — 이미지+gradient 위 카피. ScrollView contentContainerStyle 라 flexGrow:1(짧으면 anchor
    // 위치 고정, 넘치면 스크롤). 정렬은 슬라이드 종류별로 분리(fbAnchorBottom/Top).
    fbContent: { flexGrow: 1, paddingHorizontal: theme.space(6), paddingTop: theme.space(6), paddingBottom: theme.space(2) },
    // 표지(hook): 바닥 정렬 — 포스터 룩(타이틀이 카드 하단에 앉음).
    fbAnchorBottom: { justifyContent: 'flex-end' },
    // 정보 슬라이드: 상단 정렬 — 글자 시작점을 전 슬라이드 통일(읽기 리듬 보존). 짧으면 아래로 이미지가 비침.
    fbAnchorTop: { justifyContent: 'flex-start' },
    // fullbleed 정보 슬라이드 onDark 오버레이 — 기존 light-tone 스타일 위에 color 만 덮어 cream 가독 확보.
    // chip/profile 은 강한 scrim 위에서 line 색이 안 보여 반투명 흰색으로 대체(rgba — hex 토큰 규칙 무관).
    onImgText: { color: n.cream },
    onImgTextSoft: { color: n.cream2 },
    chipOnImg: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.4)' },
    profileOnImg: { borderTopColor: 'rgba(255,255,255,0.25)' },
    hHookOnImg: { fontFamily: f.display, fontSize: 40, fontWeight: theme.weight.medium, color: n.cream, lineHeight: 44, letterSpacing: -0.6, marginTop: theme.space(4) },
    subOnImg: { fontFamily: f.body, fontSize: 16, color: n.cream2, lineHeight: 24, marginTop: theme.space(4) },
    swipeOnImg: { fontFamily: f.mono, fontSize: 12, color: n.lime, letterSpacing: 2.4, fontWeight: theme.weight.semibold },

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
    // disabled = muted tan fill(cream2) — lime 올리브화(opacity) 금지, State-B ghost(외곽선)와도 구별.
    ctaDisabled: { backgroundColor: n.cream2 },
    ctaBtnText: { fontFamily: f.body, fontSize: 18, fontWeight: theme.weight.bold, color: n.ctaLive.fg },
    ctaBtnTextMuted: { color: n.inkSoft },
    ctaHelper: { fontFamily: f.mono, fontSize: 11, color: n.cream2, letterSpacing: 0.3, marginTop: theme.space(2), opacity: 0.85 },
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

    // footer = card 의 마지막 flex 자식 → ScrollView(flex:1)가 밀어내 카드 바닥에 고정(스크롤로 안 가려짐).
    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: theme.space(6), paddingTop: theme.space(2), paddingBottom: theme.space(4) },
    footFb: { paddingTop: theme.space(2) },
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
