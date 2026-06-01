// Design-system theme — resolves @celebbase/design-tokens into a typed, structured
// object whose namespace mirrors the token names (e.g. theme.color.text ==
// resolveToken(mode, '--cb-color-text')). Screen migration is then mechanical.
//
// Both light and dark are precomputed once at module load. A reactive provider
// (ThemeProvider) selects which one is active.

import type { TokenName } from '@celebbase/design-tokens';

import { px, resolveToken } from '../lib/tokens';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  color: {
    bg: string;
    surface: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    border: string;
    brand: string;
    brandBg: string;
    brandSubtle: string;
    onBrand: string;
    /** Primary action fill (Editorial Luxe ink) + its label color. */
    ink: string;
    onInk: string;
    /** Bright signature gold (brand-500) — luminous CTA fill paired with dark text. */
    gold: string;
    error: string;
    skeletonBase: string;
    skeletonShimmer: string;
  };
  /** Curated multi-hue palette for deterministic monogram avatars (token-derived). */
  accents: readonly string[];
  /** Spacing scale in px. space(4) === 16. */
  space: (step: SpaceStep) => number;
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    pill: number;
  };
  type: {
    display: number;
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    bodyLg: number;
    body: number;
    bodySm: number;
    caption: number;
    /** JetBrains Mono numeral scale (tabular). Numbers only — never body copy. */
    metricXl: number;
    metricLg: number;
    metricMd: number;
    metricSm: number;
  };
  font: {
    display: string;
    body: string;
    /** Monospace numerals (JetBrains Mono). Pair with fontVariant tabular-nums. */
    mono: string;
  };
  weight: {
    regular: TextWeight;
    medium: TextWeight;
    semibold: TextWeight;
    bold: TextWeight;
  };
  /**
   * Motion vocabulary (DESIGN.md §10). Durations in ms; easing as cubic-bezier
   * control points — spread into RN `Easing.bezier(...theme.motion.easing.x)`.
   * Defined now as a shared language; screens adopt it during L2 polish.
   */
  motion: {
    duration: { fast: number; base: number; slow: number };
    easing: { standard: Bezier; emphasized: Bezier };
  };
  /** Trust grade signal colors (A best → E lowest). Theme-invariant signal palette. */
  trust: Record<TrustGradeKey, { bg: string; fg: string }>;
  /**
   * News surface palette — Design Canvas v1 (IMPL-MOBILE-NEWS-CARD-CANVAS-001).
   * Editorial wellness, faceless. Scoped to News feed / ClaimCard / ClaimDetail;
   * theme-invariant (fixed brand palette, not light/dark reactive).
   */
  news: {
    paper: string;
    cream: string;
    cream2: string;
    ink: string;
    inkSoft: string;
    forest: string;
    forest2: string;
    lime: string;
    clay: string;
    line: string;
    muted: string;
    /** Trust badges — A solid · B/C outline · D clay+disclaimer · E not rendered. */
    trust: {
      A: { bg: string; fg: string };
      B: { fg: string; border: string };
      C: { fg: string; border: string };
      D: { bg: string; fg: string; border: string };
    };
    ctaLive: { bg: string; fg: string };
    ctaSoonFg: string;
    trend: { bg: string; fg: string };
    chip: { fg: string; bg: string; border: string };
    /**
     * News-scoped 브랜드 폰트 (App.tsx 가 bare name 으로 로드 — card-system 과 일치).
     * display=Fraunces(serif), body=Hanken Grotesk, mono=Spline Sans Mono.
     * News 피드/카드뉴스 전용 — 앱 전역 theme.font 는 미변경.
     */
    font: { display: string; body: string; mono: string };
  };
}

export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type TextWeight = '400' | '500' | '600' | '700' | '800';
export type Bezier = readonly [number, number, number, number];
export type TrustGradeKey = 'A' | 'B' | 'C' | 'D' | 'E';

// design-tokens stores font-family as a CSS stack ("'Fraunces', 'Georgia', serif").
// RN's fontFamily takes a single family name, so extract the first quoted family.
function firstFamily(stack: string): string {
  const quoted = stack.match(/^\s*'([^']+)'/) ?? stack.match(/^\s*"([^"]+)"/);
  if (quoted) return quoted[1];
  return stack.split(',')[0].trim();
}

function num(mode: ThemeMode, name: TokenName): number {
  return px(resolveToken(mode, name));
}

function weight(mode: ThemeMode, name: TokenName): TextWeight {
  return resolveToken(mode, name) as TextWeight;
}

// Parse a CSS cubic-bezier() into its 4 control points for RN's Easing.bezier.
function bezier(mode: ThemeMode, name: TokenName): Bezier {
  const nums = resolveToken(mode, name).match(/-?\d*\.?\d+/g)?.map(Number);
  if (!nums || nums.length !== 4) {
    throw new Error(`[theme] cannot parse cubic-bezier from token '${name}' (mode=${mode})`);
  }
  return [nums[0], nums[1], nums[2], nums[3]] as const;
}

function buildTheme(mode: ThemeMode): Theme {
  return {
    mode,
    color: {
      bg: resolveToken(mode, '--cb-color-bg'),
      surface: resolveToken(mode, '--cb-color-surface'),
      text: resolveToken(mode, '--cb-color-text'),
      textMuted: resolveToken(mode, '--cb-color-text-muted'),
      textSubtle: resolveToken(mode, '--cb-color-text-subtle'),
      border: resolveToken(mode, '--cb-color-border'),
      brand: resolveToken(mode, '--cb-color-brand'),
      brandBg: resolveToken(mode, '--cb-color-brand-bg'),
      brandSubtle: resolveToken(mode, '--cb-color-brand-subtle'),
      onBrand: resolveToken(mode, '--cb-color-on-brand'),
      ink: resolveToken(mode, '--cb-color-ink'),
      onInk: resolveToken(mode, '--cb-color-on-ink'),
      gold: resolveToken(mode, '--cb-brand-500'),
      error: resolveToken(mode, '--cb-color-error'),
      skeletonBase: resolveToken(mode, '--cb-skeleton-base'),
      skeletonShimmer: resolveToken(mode, '--cb-skeleton-shimmer'),
    },
    accents: [
      resolveToken(mode, '--cb-accent-aspirational'),
      resolveToken(mode, '--cb-accent-biohacker'),
      resolveToken(mode, '--cb-accent-glp1'),
      resolveToken(mode, '--cb-accent-household'),
      resolveToken(mode, '--cb-brand-600'),
      resolveToken(mode, '--cb-brand-700'),
    ],
    space: (step) => num(mode, `--cb-space-${String(step)}` as TokenName),
    radius: {
      sm: num(mode, '--cb-radius-sm'),
      md: num(mode, '--cb-radius-md'),
      lg: num(mode, '--cb-radius-lg'),
      xl: num(mode, '--cb-radius-xl'),
      xxl: num(mode, '--cb-radius-2xl'),
      pill: num(mode, '--cb-radius-pill'),
    },
    type: {
      display: num(mode, '--cb-display-md'),
      h1: num(mode, '--cb-h1'),
      h2: num(mode, '--cb-h2'),
      h3: num(mode, '--cb-h3'),
      h4: num(mode, '--cb-h4'),
      bodyLg: num(mode, '--cb-body-lg'),
      body: num(mode, '--cb-body-md'),
      bodySm: num(mode, '--cb-body-sm'),
      caption: num(mode, '--cb-caption'),
      metricXl: num(mode, '--cb-metric-xl'),
      metricLg: num(mode, '--cb-metric-lg'),
      metricMd: num(mode, '--cb-metric-md'),
      metricSm: num(mode, '--cb-metric-sm'),
    },
    font: {
      display: firstFamily(resolveToken(mode, '--cb-font-family-display')),
      body: firstFamily(resolveToken(mode, '--cb-font-family-body')),
      mono: firstFamily(resolveToken(mode, '--cb-font-family-mono')),
    },
    weight: {
      regular: weight(mode, '--cb-font-weight-regular'),
      medium: weight(mode, '--cb-font-weight-medium'),
      semibold: weight(mode, '--cb-font-weight-semibold'),
      bold: weight(mode, '--cb-font-weight-bold'),
    },
    motion: {
      duration: {
        fast: num(mode, '--cb-motion-fast'),
        base: num(mode, '--cb-motion-base'),
        slow: num(mode, '--cb-motion-slow'),
      },
      easing: {
        standard: bezier(mode, '--cb-ease-standard'),
        emphasized: bezier(mode, '--cb-ease-emphasized'),
      },
    },
    trust: {
      A: { bg: resolveToken(mode, '--cb-color-trust-a-bg'), fg: resolveToken(mode, '--cb-color-trust-a-fg') },
      B: { bg: resolveToken(mode, '--cb-color-trust-b-bg'), fg: resolveToken(mode, '--cb-color-trust-b-fg') },
      C: { bg: resolveToken(mode, '--cb-color-trust-c-bg'), fg: resolveToken(mode, '--cb-color-trust-c-fg') },
      D: { bg: resolveToken(mode, '--cb-color-trust-d-bg'), fg: resolveToken(mode, '--cb-color-trust-d-fg') },
      E: { bg: resolveToken(mode, '--cb-color-trust-e-bg'), fg: resolveToken(mode, '--cb-color-trust-e-fg') },
    },
    news: {
      paper: resolveToken(mode, '--cb-news-paper'),
      cream: resolveToken(mode, '--cb-news-cream'),
      cream2: resolveToken(mode, '--cb-news-cream-2'),
      ink: resolveToken(mode, '--cb-news-ink'),
      inkSoft: resolveToken(mode, '--cb-news-ink-soft'),
      forest: resolveToken(mode, '--cb-news-forest'),
      forest2: resolveToken(mode, '--cb-news-forest-2'),
      lime: resolveToken(mode, '--cb-news-lime'),
      clay: resolveToken(mode, '--cb-news-clay'),
      line: resolveToken(mode, '--cb-news-line'),
      muted: resolveToken(mode, '--cb-news-muted'),
      trust: {
        A: { bg: resolveToken(mode, '--cb-news-trust-a-bg'), fg: resolveToken(mode, '--cb-news-trust-a-fg') },
        B: { fg: resolveToken(mode, '--cb-news-trust-b-fg'), border: resolveToken(mode, '--cb-news-trust-b-border') },
        C: { fg: resolveToken(mode, '--cb-news-trust-c-fg'), border: resolveToken(mode, '--cb-news-trust-c-border') },
        D: {
          bg: resolveToken(mode, '--cb-news-trust-d-bg'),
          fg: resolveToken(mode, '--cb-news-trust-d-fg'),
          border: resolveToken(mode, '--cb-news-trust-c-border'),
        },
      },
      ctaLive: { bg: resolveToken(mode, '--cb-news-cta-live-bg'), fg: resolveToken(mode, '--cb-news-cta-live-fg') },
      ctaSoonFg: resolveToken(mode, '--cb-news-cta-soon-fg'),
      trend: { bg: resolveToken(mode, '--cb-news-trend-bg'), fg: resolveToken(mode, '--cb-news-trend-fg') },
      chip: {
        fg: resolveToken(mode, '--cb-news-chip-fg'),
        bg: resolveToken(mode, '--cb-news-chip-bg'),
        border: resolveToken(mode, '--cb-news-chip-border'),
      },
      // News-scoped 브랜드 폰트. display 는 기존 Fraunces 토큰 재사용, body/mono 는
      // App.tsx 가 로드하는 bare name(Hanken Grotesk / Spline Sans Mono).
      font: {
        display: firstFamily(resolveToken(mode, '--cb-font-family-display')),
        body: 'Hanken Grotesk',
        mono: 'Spline Sans Mono',
      },
    },
  };
}

export const lightTheme: Theme = buildTheme('light');
export const darkTheme: Theme = buildTheme('dark');

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
