# CelebBase Wellness — Design System v1.0

> **Date**: 2026-04-15  
> **Status**: Production Baseline  
> **Scope**: React Native (iOS/Android) + Next.js (Web) + Admin Dashboard  
> **Origin**: Synthesized from Claude (Opus 4.6) and Codex (GPT-5.4) competitive outputs  
> **Companion Docs**: `spec.md` §7–8, `.claude/rules/domain/content.md`, `.claude/rules/code-style.md`

---

## 0. Manifesto

CelebBase Wellness sits at the intersection of **celebrity aspiration** and **clinical precision**. The visual language must feel luxurious enough that a Household CEO trusts it with their grocery budget, precise enough that a Biohacker trusts it with their macros, warm enough that an Aspirational Millennial shares it on social media, and medically credible enough that a GLP-1 User relies on it for muscle preservation.

**Product Promise**: "Celebrity-inspired, bio-adapted, operationalized in one tap."

### Experience Pillars

- **Premium Calm**: cinematic spacing, controlled typography, restrained color
- **Guided Momentum**: user always knows the next action in under 3 seconds
- **Explainable Personalization**: every AI-generated change surfaces its rationale
- **Conversion Without Pressure**: single dominant CTA, clear alternatives

### Synthesis Lineage

> **Provenance**: Selected from an evidence-first scan of 58 VoltAgent brand dossiers (`/tmp/brand-preview/*.html` → `/tmp/brand-index/*.json`, 2026-04-16). The shortlist's narrative prose was then cross-read against the official `npx getdesign@latest add <brand>` DESIGN.md narratives (`/tmp/design-refs-2/<brand>/DESIGN.md`) so each "What We Take" row reflects both CSS tokens and documented intent, not an LLM paraphrase of abstract "vibes." DNA scoring dimensions: premium / warm / clinical / celebrity / photography (totals in parens).

**How the five voices combine**: CelebBase imagines a *concierge concourse* — Apple's cinematic foundation hosts Tesla's gallery restraint, in which Airbnb's warm photography cards are displayed, annotated in Claude's literary voice, and arranged with Sanity's editorial precision. Each reference is loaded for exactly one layer; cross-contamination (e.g., Airbnb coral leaking into Claude voice rows) is banned by §2 and §13.2.

| Layer | Reference (DNA) | Narrative Hook (why this brand) | What We Take (concrete) | What We Leave |
|-------|-----------------|----------------------------------|--------------------------|---------------|
| Foundation — Premium Whitespace | Apple (8) | *"Minimalism as reverence for the object"* — product-as-sculpture photography on solid color fields with cinematic section pacing; whitespace as the pause between scenes in a film. | Cinematic section rhythm (`980px` max-width, `64px 32px` hero padding), 4-weight scale 400/500/600/700, display line-heights 1.07 / 1.10 / 1.14, single ambient card shadow `rgba(0,0,0,0.22) 3px 5px 30px 0px` | Pure black `#000000` / `#1D1D1F` binary, SF Pro licensing, Apple Blue `#0071E3`, 980px pill CTA shape (we use `--cb-radius-pill` at `9999px` for chips only) |
| Cinema — Radical Subtraction | Tesla (8) | *"Digital showroom… gallery-like browsing where each scroll is a deliberate transition"* — the UI exists only to provide just enough structure to get out of the way, letting full-viewport imagery carry the emotional weight. | Full-viewport celebrity photography posture, shadow restraint (≤2 shadows per screen, `max-shadow-opacity: 0.05`), 1200px / 100% dual-container logic, uppercase labels with `letter-spacing: 3px`, `80px 40px` hero padding, 0.33s universal transition timing | Cool gray palette (`#5C5E62` pewter, `#393C41` graphite), automotive electric-blue `#3E6AE1`, Universal Sans licensing, Tesla's zero-decoration absolutism (we need cards + shadows for data modules) |
| Discovery — Photography-First Cards | Airbnb (7) | *"Travel-magazine spacing, three-layer shadows create natural warm lift rather than CSS effects"* — warmth matters; near-black (`#222`) over pure black, Cereal VF 500–700 weight range for cozy-not-cold headings. | Three-layer compound card shadow `rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px`, generous radii `14px`/`20px`/`50%` for card/pill/avatar, 480 → 1100px responsive max-widths, warm weight range 500–700 for headings, negative tracking -0.18px to -0.44px on display | Rausch coral `#FF385C` (gold wins), marketplace density, Plus badge purple `#460479`, 5-to-1 column mobile-crunch density |
| Voice — Warm Neutrals | Claude (7) | *"Literary salon… parchment evoking premium paper, not screens; warm ring halos rather than drop shadows"* — every gray has a yellow-brown undertone; AI that has good taste in interior design. | Warm parchment / ivory / sand triad (`#F5F4ED` / `#FAF9F5` / `#E8E6DC`) as the neutral-spine anchor, ring-style whisper borders (`0px 0px 0px 1px #D1CFC5`), editorial serif rhythm (serif for content headlines, sans for UI), ambient `rgba(0,0,0,0.05) 0 4px 24px` card glow, body line-height 1.60 for literary pacing | Terracotta accent `#C96442` (gold wins), Georgia serif fallback (Fraunces wins), 3-weight compression on serifs (we need 700 for FAQ section titles) |
| Precision — Content Editorial | Sanity (7) | *"Precision-engineered typographic voice… colorimetric depth — everything feels mounted to the surface rather than hovering"* — structured content deserves a structured stage; border-based containment over floating cards. | Two-shadow restraint (`0 1px 3px rgba(0,0,0,0.08)` card + `0 4px 12px rgba(0,0,0,0.06)` elevated), 1200 / 900 / 560px progressive container ladder, tight display letter-spacing scale (-0.13px → -3.6px), radius ladder shape (3/5/6/12/pill with no values between 12 and pill), IBM-Plex-Mono-style uppercase technical labels for nutrition metrics | Sanity red `#F36458`, Space Grotesk display, neon-green `#19D600` accent, dark-first canvas (CelebBase is light-first; dark mode is opt-in §2.8) |

**Rejected from original intent** (audit 2026-04-16) — the score-6 candidates we evaluated from the `/tmp/design-refs-2` narrative read, each failing exactly one DNA dimension CelebBase requires:

| Brand | Score | Missing Dimension | Verdict |
|-------|------:|-------------------|---------|
| Notion | 6 | celebrity 1 (product-UI-forward, not image-forward) | Displaced by **Claude** (7) which carries the same warm neutrals + a stronger editorial/celebrity presence via hero illustrations. |
| Ferrari | 6 | warm 0 (monastic black/white chiaroscuro) | Luxury-editorial rigor is real, but the "zero warmth" posture conflicts with §1.2 Principle 04 (Transparent Health — approachable). |
| Runway | 6 | warm 0 (cool slate `#767d88`, `#7d848e`) | Cinematic-photography posture is already supplied by Tesla; we don't need a second photography-first dark canvas. |
| Superhuman | 6 | photography 0 (product-screenshot-forward) | Non-standard weight stops (460/540) and warm cream buttons `#e9e5dd` are inspiring but not structural — deferred to §4.2 button exploration notes. |
| Pinterest | 5 | premium 1, celebrity 0 | Warm olive/sand scale is directionally aligned with Claude but lacks the premium lift CelebBase requires for its GLP-1 / Biohacker tiers. |
| Revolut | 3 | no photography, clinical only 1 | Did not reach top 10; its "flat metric" contribution is re-attributed to Tesla (radical subtraction, DNA 8). |

### Non-Negotiables

1. WCAG 2.1 AA minimum across all text pairings
2. Health disclaimer on every nutrition/diet screen, never `aria-hidden`
3. Theme token architecture only (`--cb-*`); no inline color/spacing constants
4. Max one Primary CTA per screen
5. Skeleton loaders for all network-backed modules
6. i18n Day 1 — no hardcoded strings

---

## 1. Brand Identity & Design Principles

### 1.1 Positioning

- Category: Premium B2C wellness + food commerce
- Emotional target: "I feel looked after by an elite nutrition concierge."
- Functional target: "I can go from intent to plan to delivery in under 2 minutes."

### 1.2 Five Principles

**01 — Aspirational Precision**  
Every screen balances "I want this life" (aspiration) with "I understand this data" (trust). Celebrity hero images and macro donut charts coexist without one undermining the other.

**02 — Earned Luxury**  
Premium whitespace and cinematic imagery make the subscription feel worth it. Whitespace is intentional, not filler — every empty pixel earns its place by directing attention.

**03 — One-Click Confidence**  
The primary action on every screen must be immediately obvious. One gold CTA per screen, max. Decision fatigue is the enemy.

**04 — Transparent Health**  
Health disclaimers, data sources, and AI adjustment explanations are surfaced visibly — never buried in fine print. Trust is the product.

**05 — Traceable Personalization**  
Every AI adjustment has a visible rationale label. Users see *why* their plan differs from the celebrity base: "Boosted protein by 30g for your activity level."

### 1.3 Persona ↔ Design Mapping

| Persona | Primary Need | Design Response |
|---------|-------------|-----------------|
| Household CEO | Speed, no cognitive load | One CTA per screen, FAB for cart, quick-pick defaults |
| Biohacker | Data density, precision | JetBrains Mono metrics, progress rings, expandable nutrition tables |
| GLP-1 User | Medical credibility | Info-tinted disclaimer, purple accent, muscle preservation guidance |
| Aspirational Millennial | Visual appeal, shareability | Full-bleed celebrity heroes, Fraunces serif headlines, warm card grids |

### 1.4 Visual Signature

- **Display serif**: Fraunces for celebrity names and hero text — editorial premium
- **Gold accent**: disciplined, singular brand color for action and luxury
- **Micro-detail**: thin whisper borders and pill tags

---

## 2. Color System

All colors defined as CSS custom properties (`--cb-*`) and parallel TypeScript const for React Native.

### 2.1 Brand

| Token | Hex | Contrast (white text) | Role |
|-------|-----|-----------------------|------|
| `--cb-brand-500` | `#C9A84C` | text must be dark | Decorative accent, tints, active states |
| `--cb-brand-600` | `#8B6D2F` | 6.2:1 ✓ | **Primary CTA background** (white text) |
| `--cb-brand-700` | `#6B5420` | 8.9:1 ✓ | Pressed/dark CTA variant |
| `--cb-brand-100` | `#F5EDDA` | — | Selected chip fill, tag surface |
| `--cb-brand-50` | `#FBF8F0` | — | Subtle section background |

**Why gold?** None of the five references (Apple / Tesla / Airbnb / Claude / Sanity) use gold as a brand accent — Apple uses electric blue, Tesla electric blue, Airbnb coral Rausch, Claude terracotta, Sanity red. Gold signals premium (jewelry, awards) and wellness (turmeric, honey, warmth) simultaneously while remaining uncolonized by any reference. Darker variant `--cb-brand-600` ensures white text passes WCAG AA.

> **Naming convention**: Color step IDs use bare numeric suffix without zero-padding in both CSS (`--cb-brand-50`, `--cb-neutral-50`) and TypeScript (`colors.brand[50]`). Sort stability in generated files is guaranteed by `packages/design-tokens/scripts/sync-tokens.ts` which emits tokens in a fixed step order (0, 50, 100, 200 …), not alphabetical.

### 2.2 Neutral Spine

Warm undertones throughout — never blue-gray. Parchment/ivory/sand spine traces to Claude's `#F5F4ED` / `#FAF9F5` / `#E8E6DC` triad (see §0 Voice layer); CelebBase applies a marginal yellow shift (+1 in hue) for celebrity-heat vs. Claude's cooler editorial calm.

| Token | Hex | L (relative) | Contrast on `--cb-neutral-0` | Usage |
|-------|-----|-------------|------------------------------|-------|
| `--cb-neutral-0` | `#FAFAF8` | 0.955 | — | Page background |
| `--cb-neutral-50` | `#F4F3F0` | 0.903 | — | Card surfaces, input bg, alt section bg |
| `--cb-neutral-100` | `#E8E6E1` | 0.789 | — | Borders, dividers, inactive toggles |
| `--cb-neutral-200` | `#D0CEC8` | 0.623 | — | Decorative borders |
| `--cb-neutral-300` | `#A8A5A0` | 0.384 | 2.3:1 | Disabled, decorative only |
| `--cb-neutral-400` | `#8A8780` | 0.276 | 3.0:1 | Placeholder text (large text AA) |
| `--cb-neutral-500` | `#6D6A64` | 0.146 | **5.1:1 ✓** | Secondary labels, metadata |
| `--cb-neutral-600` | `#5A5750` | 0.096 | **6.9:1 ✓** | Body text |
| `--cb-neutral-700` | `#3D3B37` | 0.044 | **8.2:1 ✓** | Emphasized body, sub-headings |
| `--cb-neutral-900` | `#1A1917` | 0.012 | **17.0:1 ✓** | Primary headings, hero text |

> **Gap note**: `--cb-neutral-800` is intentionally omitted. Use `--cb-neutral-700` or `--cb-neutral-900` — no intermediate step. Hover/pressed states use opacity or the brand scale, not neutral-800.

### 2.3 Semantic

| Token | Hex | On white | On light bg | Role |
|-------|-----|----------|-------------|------|
| `--cb-success-600` | `#0F7438` | 5.87:1 ✓ | — | Goal achieved, adherence on-track |
| `--cb-success-100` | `#DDF3E6` | — | — | Success tint background |
| `--cb-warning-600` | `#A15900` | 5.34:1 ✓ | — | Near-limit, partial completion |
| `--cb-warning-100` | `#FDEBD5` | — | — | Warning tint background |
| `--cb-danger-600` | `#B4232C` | 6.47:1 ✓ | — | Allergen alert, destructive action |
| `--cb-danger-100` | `#FADADD` | — | — | Danger tint background |
| `--cb-info-600` | `#1767B8` | 5.73:1 ✓ | — | Health disclaimer, informational |
| `--cb-info-100` | `#D9EAFB` | — | — | Info tint background |

### 2.4 Persona Accent Colors

Used only for category chips and subtle UI differentiation — never as primary brand.

| Token | Hex | Persona |
|-------|-----|---------|
| `--cb-accent-biohacker` | `#0E8F9B` | Teal-cyan for precision/data |
| `--cb-accent-glp1` | `#7B5EA7` | Muted purple for medical/clinical |
| `--cb-accent-aspirational` | `#D4654A` | Warm terracotta for social/trend |
| `--cb-accent-household` | `var(--cb-brand-500)` | Gold — reuse for efficiency |

### 2.5 Subscription Tier Tokens

| Token | Free | Premium | Elite |
|-------|------|---------|-------|
| `--cb-tier-*-bg` | `#EEF2F5` | `#E8F6F3` | `#1A1917` |
| `--cb-tier-*-border` | `#CBD5DE` | `#79C8BB` | `#C9A84C` |
| `--cb-tier-*-text` | `#33414E` | `#0B5A4F` | `#F5EDDA` |

### 2.6 Chart Tokens

| Token | Hex | Use |
|-------|-----|-----|
| `--cb-chart-weight` | `#0E8F7D` | Weight trend line |
| `--cb-chart-adherence` | `#1767B8` | Adherence bars |
| `--cb-chart-protein` | `#A06A1C` | Protein area |
| `--cb-chart-calories` | `#7A4D00` | Calorie trend |
| `--cb-chart-goal` | `#6A737C` | Target/goal reference line |

### 2.7 Skeleton Tokens

| Token | Hex |
|-------|-----|
| `--cb-skeleton-base` | `#E8E1D8` |
| `--cb-skeleton-shimmer` | `#F5EFE7` |

### 2.8 Dark Mode (Elite Tier Only)

Dark mode is an Elite subscriber perk. Warm-dark surfaces preserve brand warmth. Every token group used in component specs has a dark override — no untested regressions.

```css
[data-theme="dark"] {
  /* Neutral spine — full scale override */
  --cb-neutral-0: #141412;         /* Page background */
  --cb-neutral-50: #1E1D1B;        /* Card surfaces */
  --cb-neutral-100: #282623;       /* Elevated surface / dropdown */
  --cb-neutral-200: #33312D;       /* Border / divider */
  --cb-neutral-300: #4A4742;       /* Decorative border (dark) */
  --cb-neutral-400: #6D6A64;       /* Disabled text */
  --cb-neutral-500: #A8A5A0;       /* Secondary labels — 5.3:1 vs N-0 */
  --cb-neutral-600: #C5C2BC;       /* Body text — 10.4:1 ✓ AAA */
  --cb-neutral-700: #E0DDD7;       /* Emphasized body */
  --cb-neutral-900: #F2F0EB;       /* Primary heading — 16.3:1 ✓ AAA */

  /* Brand — gold lightened for dark surfaces */
  --cb-brand-50: #2B2418;
  --cb-brand-100: #3D331E;         /* Selected chip fill (dark) */
  --cb-brand-500: #E8C870;         /* Decorative accent / active states */
  --cb-brand-600: #D4B35E;         /* CTA background on dark — 8.9:1 ✓ AAA with #1A1917 text */
  --cb-brand-700: #E8C870;         /* Pressed variant (reverse mapping) */

  /* Semantic — contrast-verified on --cb-neutral-0 */
  --cb-success-600: #3ABF6E;       /* 7.8:1 ✓ */
  --cb-success-100: rgba(58, 191, 110, 0.14);
  --cb-warning-600: #E2933A;       /* 7.5:1 ✓ */
  --cb-warning-100: rgba(226, 147, 58, 0.14);
  --cb-danger-600:  #E8575F;       /* 5.3:1 ✓ */
  --cb-danger-100:  rgba(232, 87, 95, 0.14);
  --cb-info-600:    #5B9EEC;       /* 6.6:1 ✓ */
  --cb-info-100:    rgba(91, 158, 236, 0.14);

  /* Chart tokens — brightened for dark surfaces (min 3:1 non-text graphics) */
  --cb-chart-weight:    #2EDABF;
  --cb-chart-adherence: #5B9EEC;
  --cb-chart-protein:   #D9A24A;
  --cb-chart-calories:  #D1984C;
  --cb-chart-goal:      #A8B0B8;

  /* Persona accents — brightened */
  --cb-accent-biohacker:    #3BC8D6;
  --cb-accent-glp1:         #B59BDD;
  --cb-accent-aspirational: #EA8971;
  --cb-accent-household:    var(--cb-brand-500);

  /* Tier tokens — Elite-only dark, Free/Premium tier cards stay light within dark shell */
  --cb-tier-free-bg: #1E1D1B;
  --cb-tier-free-border: #4A4742;
  --cb-tier-free-text: #C5C2BC;
  --cb-tier-premium-bg: #0E2B25;
  --cb-tier-premium-border: #2B8475;
  --cb-tier-premium-text: #7BE0CB;
  --cb-tier-elite-bg: #0E0D0C;
  --cb-tier-elite-border: #E8C870;
  --cb-tier-elite-text: #F5EDDA;

  /* Borders — rgba on dark */
  --cb-border-default: 1px solid rgba(255, 255, 255, 0.08);
  --cb-border-strong:  1px solid rgba(255, 255, 255, 0.16);
  --cb-border-focus:   2px solid var(--cb-brand-500);
  --cb-border-error:   2px solid var(--cb-danger-600);

  /* Skeleton */
  --cb-skeleton-base:    #282623;
  --cb-skeleton-shimmer: #33312D;

  /* Shadow — disabled; elevation via surface brightness (§6.2) */
  --cb-shadow-1: none;
  --cb-shadow-2: none;
  --cb-shadow-3: none;
  --cb-shadow-brand: none;
  --cb-shadow-focus: 0 0 0 3px rgba(232, 200, 112, 0.55);
}
```

**Dark mode depth**: No box-shadows. Elevation expressed through surface brightness (§6.2 scale).

**CTA text**: In light mode CTA uses `#FFFFFF` on gold-600. In dark mode CTA uses `#1A1917` on lightened gold-600 `#D4B35E` (8.9:1). Components read `--cb-cta-text` which flips automatically — do **not** hardcode white text for CTAs.

```css
:root { --cb-cta-text: #FFFFFF; }
[data-theme="dark"] { --cb-cta-text: #1A1917; }
```

### 2.9 Contrast Audit

All ratios computed using WCAG 2.1 relative luminance formula. CI verification script in `packages/design-tokens/scripts/verify-contrast.ts` re-runs this table on every token PR.

| Text | Background | Ratio | Status |
|------|-----------|-------|--------|
| `#1A1917` on `#FAFAF8` | heading on canvas | 17.0:1 | ✓ AAA |
| `#3D3B37` on `#FAFAF8` | sub-heading on canvas | 10.5:1 | ✓ AAA |
| `#5A5750` on `#FAFAF8` | body on canvas | 7.0:1 | ✓ AAA |
| `#6D6A64` on `#FAFAF8` | secondary on canvas | 5.1:1 | ✓ AA |
| `#FFFFFF` on `#8B6D2F` | CTA white on gold-600 | 4.84:1 | ✓ AA |
| `#FFFFFF` on `#6B5420` | CTA white on gold-700 | 7.36:1 | ✓ AAA |
| `#1A1917` on `#C9A84C` | dark on gold-500 | 7.85:1 | ✓ AAA |
| `#B4232C` on `#FFFFFF` | danger on white | 6.47:1 | ✓ AAA |
| `#1767B8` on `#FFFFFF` | info on white | 5.73:1 | ✓ AA |
| `#A15900` on `#FFFFFF` | warning on white | 5.34:1 | ✓ AA |
| `#A15900` on `#FDEBD5` | warning on warning tint | 4.60:1 | ✓ AA |
| `#0F7438` on `#FFFFFF` | success on white | 5.87:1 | ✓ AA |
| `#0B5A4F` on `#E8F6F3` | premium tier card | 7.40:1 | ✓ AAA |
| `#F5EDDA` on `#1A1917` | elite tier card | 15.3:1 | ✓ AAA |
| `#F2F0EB` on `#141412` | dark mode primary | 16.3:1 | ✓ AAA |
| `#C5C2BC` on `#141412` | dark mode body | 10.4:1 | ✓ AAA |

**Rules**
- Any new pair below **4.5:1** is **blocked** in design review.
- Chart line/fill tokens (§2.6) are non-text graphics — min **3:1** vs adjacent surface per WCAG SC 1.4.11. Verified in `verify-contrast.ts`.
- Numbers in this table are machine-computed; manual edits require re-running the script.

---

## 3. Typography

### 3.1 Font Stack

| Role | Family | Rationale |
|------|--------|-----------|
| Display & Hero | `'Fraunces', 'Iowan Old Style', 'Georgia', serif` | Variable serif with optical sizing. Editorial premium tone for celebrity storytelling. Google Fonts free. |
| Headings & Body | `'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif` | Modern geometric humanist, slightly rounded. Premium yet approachable. |
| Metrics & Numbers | `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace` | Tabular digits prevent layout shift in animated counters. Digits + punctuation only. |

**Why Fraunces + Plus Jakarta Sans?** The serif/sans-serif contrast creates an editorial voice for celebrity content (Fraunces) while keeping the app interface clean (Plus Jakarta Sans). None of the five reference systems use this pairing: Apple ships Inter + SF Pro fallback (sans-only), Tesla ships Inter (sans-only), Airbnb ships Nunito Sans (sans-only), Sanity ships Space Grotesk (sans-only), Claude ships Georgia + Arial (serif for body, no variable display). The Fraunces (variable serif with optical sizing) + Plus Jakarta Sans pairing is uniquely CelebBase — it takes Claude's editorial-serif cue without inheriting Georgia's static legacy metrics.

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Font | Usage |
|-------|------|--------|-------------|----------------|------|-------|
| `--cb-display-xl` | 52px / 3.25rem | 600 | 1.12 | -0.02em | Fraunces | Onboarding hero, celebrity name |
| `--cb-display-lg` | 42px / 2.625rem | 600 | 1.12 | -0.02em | Fraunces | Section hero headlines |
| `--cb-display-md` | 34px / 2.125rem | 600 | 1.24 | -0.01em | Fraunces | Celebrity card overlay, plan title |
| `--cb-h1` | 28px / 1.75rem | 700 | 1.24 | -0.01em | Plus Jakarta Sans | Screen titles, "Today's Meals" |
| `--cb-h2` | 24px / 1.5rem | 700 | 1.24 | -0.01em | Plus Jakarta Sans | Section headings |
| `--cb-h3` | 20px / 1.25rem | 600 | 1.24 | 0 | Plus Jakarta Sans | Card titles, modal headers |
| `--cb-h4` | 18px / 1.125rem | 600 | 1.24 | 0 | Plus Jakarta Sans | List section headers |
| `--cb-body-lg` | 18px / 1.125rem | 400 | 1.50 | 0 | Plus Jakarta Sans | Intro text, hero subtitles |
| `--cb-body-md` | 16px / 1rem | 400 | 1.50 | 0 | Plus Jakarta Sans | Primary body text |
| `--cb-body-sm` | 14px / 0.875rem | 400 | 1.50 | 0 | Plus Jakarta Sans | Secondary descriptions |
| `--cb-label-lg` | 14px / 0.875rem | 600 | 1.24 | 0.01em | Plus Jakarta Sans | Button labels, nav items |
| `--cb-label-md` | 13px / 0.813rem | 600 | 1.24 | 0.01em | Plus Jakarta Sans | Chip labels, small inline labels |
| `--cb-label-sm` | 12px / 0.75rem | 500 | 1.33 | 0.02em | Plus Jakarta Sans | Bottom tab labels, badges, micro labels |
| `--cb-caption` | 12px / 0.75rem | 400 | 1.50 | 0.01em | Plus Jakarta Sans | Footnotes, timestamps |
| `--cb-metric-xl` | 48px / 3rem | 700 | 1.00 | -0.02em | JetBrains Mono | Daily calorie total |
| `--cb-metric-lg` | 32px / 2rem | 600 | 1.00 | -0.01em | JetBrains Mono | Macro gram numbers |
| `--cb-metric-md` | 20px / 1.25rem | 500 | 1.10 | 0 | JetBrains Mono | Progress percentages |
| `--cb-metric-sm` | 14px / 0.875rem | 500 | 1.24 | 0.01em | JetBrains Mono | Inline nutrition numbers |

### 3.3 Rules

- Fraunces is **only** for display (≥34px) — never for form labels, legal text, or tables
- JetBrains Mono is **only** for numeric values — never for labels or body
- Minimum font size: 12px. No smaller.
- Negative tracking scales with size: -0.02em at display → 0 at body → slightly positive below 14px

---

## 4. Spacing Scale

Base unit: **8px**. Sub-unit: **4px** for tight UI contexts.

```css
:root {
  --cb-space-0: 0px;
  --cb-space-1: 4px;    /* icon gap, tight inline */
  --cb-space-2: 8px;    /* tag padding, input label gap */
  --cb-space-3: 12px;   /* chip padding, compact list gap */
  --cb-space-4: 16px;   /* card padding, form field gap */
  --cb-space-5: 20px;   /* card-to-card grid gap */
  --cb-space-6: 24px;   /* section header to content */
  --cb-space-7: 32px;   /* between content blocks */
  --cb-space-8: 40px;   /* section padding (mobile) */
  --cb-space-9: 48px;   /* section padding (tablet) */
  --cb-space-10: 56px;
  --cb-space-11: 64px;  /* section padding (desktop) */
  --cb-space-12: 72px;
  --cb-space-13: 80px;  /* hero bottom margin */
  --cb-space-14: 96px;  /* full-bleed section gap */
}
```

### Layout Constants

```css
:root {
  --cb-container-max: 1200px;
  --cb-container-reading: 760px;
  --cb-gutter-mobile: 16px;
  --cb-gutter-tablet: 24px;
  --cb-gutter-desktop: 32px;
}
```

### Component-Level Tokens (Exempt from 4/8 Grid)

Certain components have ergonomically-derived padding that does not snap to the 4/8 base unit. These are declared as component-level tokens, not as drift from the scale.

```css
:root {
  --cb-button-pad-y: 14px;       /* Pill CTAs */
  --cb-button-pad-x: 32px;
  --cb-button-pad-x-secondary: 34px;
  --cb-input-height: 52px;
  --cb-fab-size: 56px;
  --cb-tabbar-height: 72px;
  --cb-topnav-height: 72px;
}
```

Components **must** use these tokens. Raw pixel values for these specific surfaces are not a violation.

---

## 5. Border Radius Scale

```css
:root {
  --cb-radius-none: 0px;
  --cb-radius-xs: 4px;    /* tight chips, inline tags */
  --cb-radius-sm: 8px;    /* inputs, small cards, badges */
  --cb-radius-md: 12px;   /* standard content cards */
  --cb-radius-lg: 16px;   /* recipe cards, featured panels */
  --cb-radius-xl: 24px;   /* bottom sheets, prominent panels */
  --cb-radius-2xl: 32px;  /* celebrity discovery cards (magazine cover) */
  --cb-radius-pill: 9999px; /* buttons, sub badges, avatars */
  --cb-radius-circle: 50%;
}
```

### Mapping

| Element | Token |
|---------|-------|
| CTA buttons | `--cb-radius-pill` |
| Text inputs | `--cb-radius-sm` |
| Standard cards | `--cb-radius-md` |
| Celebrity hero cards | `--cb-radius-2xl` |
| Inline pill tags | `--cb-radius-pill` |
| Bottom sheet top | `--cb-radius-xl` |

> **Lineage**: The `xs / sm / md / lg / pill` ladder echoes Sanity's `--radius-xs: 3px / --radius-sm: 5px / --radius-md: 6px / --radius-lg: 12px / --radius-pill: 99999px` progression — proven content-editorial rhythm. CelebBase snaps to even multiples (4/8/12/16/24/32) for §4 spacing-grid cohesion, where Sanity uses odd 3/5/6 for tighter inputs. Airbnb contributes the `14px` and `20px` rounded-card inspiration (retained in `--cb-radius-lg`).

---

## 6. Shadow & Elevation

### 6.1 Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-shadow-0` | `none` | Flat metric cards — Tesla-style radical subtraction (Tesla uses only 2 shadows across its entire site, at max `rgba(0,0,0,0.05)`) |
| `--cb-shadow-1` | `0 1px 3px rgba(26,25,23,0.06), 0 1px 2px rgba(26,25,23,0.04)` | Cards, inputs — subtle lift. Lineage: Sanity's `--shadow-card: 0 1px 3px rgba(0,0,0,0.08)` warmed to `#1A1917` base. |
| `--cb-shadow-2` | `0 4px 12px rgba(26,25,23,0.10), 0 2px 4px rgba(26,25,23,0.06)` | FAB, dropdowns, tooltips. Lineage: Sanity's `--shadow-elevated: 0 4px 12px rgba(0,0,0,0.06)` + added 2nd layer for FAB depth. |
| `--cb-shadow-3` | `0 16px 40px rgba(26,25,23,0.15), 0 4px 12px rgba(26,25,23,0.08)` | Modals, bottom sheets. Compound-layer pattern lineage: Airbnb's three-layer `--shadow-card` stack. |
| `--cb-shadow-card-photo` | `rgba(0,0,0,0.22) 3px 5px 30px 0px` | Celebrity hero / feature card ambient lift — direct Apple lineage (`--shadow-card` from Apple preview). **Use sparingly** (≤ 1 per viewport). |
| `--cb-shadow-brand` | `0 8px 24px rgba(139,109,47,0.30)` | Primary CTA only — gold glow. **Max once per screen.** |
| `--cb-shadow-focus` | `0 0 0 3px rgba(139,109,47,0.40)` | Focus ring on interactive elements |

### 6.2 Dark Mode Elevation

No box-shadows. Depth via surface brightness:

| Level | Surface | Usage |
|-------|---------|-------|
| 0 | `#141412` | Page background |
| 1 | `#1E1D1B` | Standard cards |
| 2 | `#282623` | FAB, dropdowns |
| 3 | `#33312D` | Modals, bottom sheets |

### 6.3 Border Strategy (Claude-inspired whispers)

Light mode values below. Dark mode overrides (rgba-on-white) live in §2.8 alongside the rest of the dark palette.

| Token | Value (light) |
|-------|---------------|
| `--cb-border-default` | `1px solid rgba(26,25,23,0.08)` |
| `--cb-border-strong` | `1px solid rgba(26,25,23,0.15)` |
| `--cb-border-focus` | `2px solid var(--cb-brand-600)` |
| `--cb-border-error` | `2px solid var(--cb-danger-600)` |

> **Lineage**: Claude's preview uses ring-style 1-layer box-shadows (`0px 0px 0px 1px #D1CFC5`) in place of true borders — giving whispers without collapsing margin boxes. CelebBase prefers actual `border` declarations (to stay compatible with form controls) but matches the visual weight. Opacity `0.08` mirrors Airbnb's `rgba(0,0,0,0.08)` border-plate shadow layer.

### 6.4 State Depth

- Hover (web): elevation +1 level
- Pressed: scale(0.98), shadow -1 level
- Focus-visible: keep base shadow + `--cb-shadow-focus`

---

## 7. Component Specifications

### 7.1 Buttons

#### Primary CTA (Gold)
- Background: `--cb-brand-600`
- Text: `var(--cb-cta-text)` — auto-flips white (light) / `#1A1917` (dark)
- Typography: `--cb-label-lg`
- Height: 52px mobile / 48px web
- Padding: `var(--cb-button-pad-y)` `var(--cb-button-pad-x)` (defaults 14px / 32px — component-level tokens, exempt from §4 strict 4/8 grid)
- Radius: `--cb-radius-pill`
- Shadow: `--cb-shadow-brand`
- Hover: background → `--cb-brand-700`
- Active: scale(0.98), shadow removed
- Disabled: opacity 0.38, `aria-disabled="true"`, no color change
- Loading: skeleton pulse inside button bounds, `aria-busy="true"`
- **Rule: Maximum ONE per screen.**

#### Secondary
- Background: `--cb-neutral-0`
- Text: `--cb-brand-700`, `--cb-label-lg`
- Border: 1.5px solid `--cb-brand-500`
- Radius: `--cb-radius-pill`
- Shadow: none
- Hover: background → `--cb-brand-50`

#### Ghost (Tertiary)
- Background: transparent
- Text: `--cb-neutral-600`, `--cb-label-lg`
- Hover: text → `--cb-neutral-900`, underline on web

#### Destructive
- Initial: Ghost style with `--cb-danger-600` text
- Confirmed (2nd tap): `--cb-danger-600` background, white text
- Always two-tap confirmation for irreversible actions

### 7.2 Cards

#### Card A: Celebrity Discovery Card (Discover Tab)
```
┌─────────────────────────┐
│                         │
│    [Photo 4:5 portrait] │  ← object-fit: cover
│                         │
│   Gradient overlay ↓    │  ← linear-gradient(180deg, transparent 35%, #1A1917CC 100%)
│   ┌─ Name (display-md)  │  ← Fraunces serif, white
│   └─ Category chip      │  ← pill, brand-100 bg
└─────────────────────────┘
  radius: --cb-radius-2xl (32px)
  shadow: --cb-shadow-1
  hover: scale(1.02) + shadow-2
  min-height: 320px mobile, 360px web
  grid: 1-col xs (<480), 2-col sm (480–767), 3-col md (768–1023), 4-col lg+ (≥1024)
  (canonical source: §9.3 Reflow table)
```

#### Card B: Nutrition Metric Card (Track, My Plan)
```
┌───────────────────┐
│  Protein          │  ← label-md, neutral-500
│  145g             │  ← metric-lg (32px), JetBrains Mono, neutral-900
│  ████████░░ 82%   │  ← success ≥80%, warning 50-79%, danger <50%
│  of 178g target   │  ← caption, neutral-500
└───────────────────┘
  background: --cb-neutral-50
  border: --cb-border-default
  radius: --cb-radius-md
  shadow: none (Tesla-flat for data — radical subtraction)
  padding: --cb-space-4 (16px)
  grid: 2×2 on all sizes
```

> **Typography note**: `--cb-metric-xl` (48px) is reserved for the full-width daily-calorie hero on My Plan. Never use `--cb-metric-xl` inside a 2×2 or multi-column grid — it clips. Macro numbers always use `--cb-metric-lg` (32px).

#### Card C: Plan Day Card (My Plan Weekly)
```
┌────────────────────────────────────────┐
│ Mon 14  [🍳][🥗][🍲][🥜]  ●●●○ 75%   │  ← collapsed
├────────────────────────────────────────┤  ← today: expanded
│ Breakfast: Avocado Toast     ✓ done    │
│ Lunch: Grilled Salmon Bowl  ✓ done     │
│ Dinner: Quinoa Stir-fry     ○ pending  │
│ Snack: Greek Yogurt Parfait ○ pending  │
└────────────────────────────────────────┘
  today: left border 3px --cb-brand-500
  background: --cb-neutral-50
  radius: --cb-radius-lg
  expand row height: 56px, meal rows 12px vertical gap
```

#### Card D: Subscription Tier Card
```
Free                  Premium ★           Elite ★★
┌──────────┐         ┌──────────┐        ┌──────────┐
│ neutral  │         │ teal     │        │ DARK bg  │ ← --cb-tier-elite-bg
│ bg       │         │ tint bg  │        │ gold     │ ← --cb-tier-elite-border
│          │         │ "Popular"│        │ glow     │ ← --cb-shadow-brand
│ CTA      │         │ CTA      │        │ CTA      │
└──────────┘         └──────────┘        └──────────┘
  radius: --cb-radius-xl
  padding: 24px
  tier name: h4, price: metric-lg JetBrains Mono
  feature rows: ✓ (success-600), 🔒 (neutral-300)
  Elite dark card even in light mode — only permitted reversal
  web: 3-col row / mobile: vertical scroll, sticky CTA
```

#### Card E: Checkout Summary Card
```
┌─────────────────────────────────┐
│  Avocado (organic)      $2.99   │
│  Salmon fillet 8oz      $12.99  │
│  [Substituted] Oat milk $4.49   │  ← warning chip
│  ──────────────────────────     │
│  Estimated Total   $67.42       │  ← metric-lg, JetBrains Mono
└─────────────────────────────────┘
  background: white, border: --cb-border-default
  radius: --cb-radius-md
  line item min height: 44px
  total row: top border --cb-neutral-100
```

### 7.3 Navigation

#### Mobile Bottom Tab Bar
- Tabs: Discover | My Plan | Track | Profile
- Height: 72px including safe area
- Background: `#FFFFFFF2` + `backdrop-filter: blur(16px)`
- Border top: 1px solid `--cb-neutral-100`
- Active: `--cb-brand-600` icon + label
- Inactive: `--cb-neutral-400`
- Labels: `--cb-label-sm`

#### My Plan FAB
- Icon: shopping cart, white
- Background: `--cb-brand-600`
- Size: 56px diameter
- Shadow: `--cb-shadow-2`
- Position: bottom 72px, right 16px (above tab bar)

#### Web Top Nav (Sticky)
- Height: 72px
- Background: `--cb-neutral-0` at 90% opacity + `backdrop-filter: blur(20px)`
- Container: `--cb-container-max` centered
- Logo: left. Tab links: center (`--cb-label-lg`, active = `--cb-brand-600` + 2px bottom border). Avatar + tier badge: right.
- Mobile web (<768px): switches to bottom tab bar

#### Onboarding Nav
- Tab bar hidden
- Progress: step pills — current: `--cb-brand-500` fill, completed: `--cb-neutral-200`, remaining: `--cb-neutral-100`
- Back: Ghost button top-left
- Next: Primary CTA bottom-right, full-width on mobile

### 7.4 Inputs

- Height: 52px
- Radius: `--cb-radius-sm`
- Background: `--cb-neutral-0`
- Border: `--cb-border-strong` → `--cb-border-focus` (focused) → `--cb-border-error` (error)
- Label: above, `--cb-caption`, `--cb-neutral-600`
- Placeholder: `--cb-neutral-400`
- Error: danger border + message below in `--cb-body-sm` + `--cb-danger-600`
- Numeric: right-aligned value, left-aligned unit

**Special Inputs:**
- **Activity level**: 5-segment visual cards with icon + label (not dropdown)
- **Allergen multi-select**: pill grid — selected: `--cb-brand-100` bg + `--cb-brand-700` text
- **Goal selector**: large radio cards — icon + title + description, selected: `--cb-brand-600` left border + `--cb-brand-50` bg
- **File upload (S7)**: dropzone 180px min-height, 2px dashed `--cb-neutral-200`, active: `--cb-brand-600`

### 7.5 Health Disclaimer

Required on **every** diet/nutrition screen (per `content.md`).

```
┌─ℹ────────────────────────────────────────────┐
│  This information is for educational          │
│  purposes only and is not intended as         │
│  medical advice.                              │
└──────────────────────────────────────────────┘
```

- Background: `--cb-info-100`
- Left border: 3px solid `--cb-info-600`
- Icon: info-circle in `--cb-info-600`
- Text: `--cb-body-sm`, `--cb-neutral-600`
- Radius: `--cb-radius-sm`
- `role="note"`, **never** `aria-hidden="true"`
- Collapsible after first view in session → single line: "ℹ Educational purposes only"
- **Never** `display: none` or removed from DOM

**GLP-1 Conditional**: If user medications include GLP-1 class, append:
> "If you are on weight-loss medication, consult your clinician before major calorie or protein changes."

**Low-Calorie Safeguard**: If target < 1200 kcal:
- Show `--cb-warning-100` bg chip with consult recommendation

### 7.6 Celebrity Hero

```
┌─────────────────────────────────────────────┐
│                                             │
│         [Full-bleed portrait image]         │  ← 100vw, 420px mobile / 520px tablet / 620px web
│                                             │
│   ▓▓▓▓▓▓▓▓▓▓▓ gradient overlay ▓▓▓▓▓▓▓▓▓▓ │  ← #1A19171A → #1A1917D9
│                                             │
│   Tom Brady              [Try This Diet]    │  ← display-xl Fraunces white / Primary CTA
│   "Clean eating advocate"                   │  ← body-lg, white 75%
│   Sources: Vogue Mar 2025                   │  ← label-sm, gold-100 bg chip
└─────────────────────────────────────────────┘
```

- Image: `object-fit: cover`, `alt="[name] portrait"`
- On scroll: collapses to sticky mini-header (48px) — circular avatar (32px) + name (`--cb-h4`)
- Source attribution: `--cb-label-sm`, `--cb-brand-100` bg, `--cb-brand-700` text

### 7.7 Loading State (2-Phase Narrative)

Covers 5–15 second wait (spec §7.3). Never a blank spinner.

```
Phase 1 (0–3s):
┌─────────────────────────────────────────┐
│   [Celebrity photo, blur(20px) + 80%    │
│    dark overlay]                        │
│                                         │
│   Personalizing Tom Brady's             │  ← display-md Fraunces, white
│   diet for you...                       │
│                                         │
│   ████████░░░░░░░░░░░░░ 35%            │  ← --cb-brand-500 fill
│   "Building your meal blueprint..."     │  ← body-lg, white 60%
└─────────────────────────────────────────┘

Phase 2 (3–15s):
┌─────────────────────────────────────────┐
│   ┌─ Boosting protein by 30g ─┐        │
│   ┌─ Removing dairy-based ────┐        │  ← fade in at 4s/6s/8s
│   ┌─ Optimizing 7-day variety ┐        │    (Principle 05: Traceable)
│                                         │
│   ████████████████████░░░░ 78%          │
│   "Fine-tuning your macros..."          │
│                                         │
│   ℹ Educational purposes only           │  ← collapsed HealthDisclaimer
└─────────────────────────────────────────┘
```

- Insight cards: `--cb-neutral-0` bg, `--cb-radius-md`
- Collapsed `HealthDisclaimer` mounts from Phase 2 onward — adjustment rationale is nutrition content per `content.md`, disclaimer **never** omitted. Tap to expand full text.
- If complete before 15s: show plan preview immediately with "Refining..." banner

**Failure / Timeout** (see §7.12 Error States for full pattern):
- Timeout after 30s: show inline error card with "Still working — retry now?" + `Retry` Primary CTA + `Go back` Ghost. Disclaimer persists.
- AI engine error (5xx): show `--cb-danger-100` banner "We couldn't personalize your plan. Your data is safe. Try again." No PII in copy.

### 7.8 Skeleton System

Global rule: every async module has skeleton placeholder for **minimum 400ms**. No empty container.

- Base: `--cb-skeleton-base`
- Shimmer: `--cb-skeleton-shimmer`, 1200ms infinite linear gradient
- `prefers-reduced-motion`: static base color only
- Patterns: hero block + title bar + CTA pill / card grid rows / chart axis + legend pills

### 7.9 Checkout (4-Stage Flow)

Sanity-inspired content-editorial rhythm applied to commerce: whisper borders, single `--cb-shadow-1` (Sanity `--shadow-card` lineage), conversion-focused. Single Primary CTA per stage. Progress indicator at top: 4-step pill bar (§7.3 Onboarding Nav pattern reused).

#### Stage 1 — Cart Preview
- Layout: Card E (§7.2) as list body, sticky total footer
- Line items: min 44px, swipe-left on mobile to remove (web: trash icon on hover)
- Out-of-stock: `--cb-danger-100` bg chip "Unavailable" + inline substitution suggestion
- Substituted: `--cb-warning-100` bg chip "Substituted" + tap to view original
- Primary CTA: "Continue to Delivery"

#### Stage 2 — Delivery Slot
```
┌─────────────────────────────────────┐
│  Delivery address                   │  ← h3
│  [123 Main St, Seattle WA]  [Edit]  │  ← input + ghost
├─────────────────────────────────────┤
│  Choose a delivery window           │  ← h3
│                                     │
│  Today                              │  ← label-md neutral-500
│  ┌─────────┐ ┌─────────┐ ┌───────┐  │
│  │ 2–4 PM  │ │ 4–6 PM  │ │ 6–8PM │  │  ← SlotChip (radius-pill)
│  │ $3.99   │ │ $5.99   │ │ Full  │  │    selected: brand-50 bg + brand-600 border
│  └─────────┘ └─────────┘ └───────┘  │    full: neutral-300 disabled state
│                                     │
│  Tomorrow                           │
│  ┌─────────┐ ┌─────────┐            │
│  │ 9–11 AM │ │ 11–1 PM │            │
│  │ Free ★  │ │ $2.99   │            │
│  └─────────┘ └─────────┘            │
├─────────────────────────────────────┤
│  Delivery fee            $3.99      │  ← body-md
└─────────────────────────────────────┘
```
- SlotChip: `--cb-radius-pill`, 52px min-height, 2-line label (time + price)
- "Free" badge: `--cb-brand-100` bg chip
- **No slots available**: empty state card (§7.10 pattern) — "No delivery windows in your area. Try another address." + Ghost "Use a different address" CTA
- Error (Instacart API 5xx): inline `--cb-danger-100` banner "Delivery service temporarily unavailable. Try again in a moment." + Primary "Retry"
- Skeleton: 6 SlotChip placeholders + address line pulse
- Primary CTA: "Continue to Payment" (disabled until slot selected — `aria-disabled="true"`)

#### Stage 3 — Payment Review
- Payment method card: last-4 + brand logo, tap → method picker bottom sheet
- Order summary: collapsible Card E + delivery slot + fees breakdown
- Trust block: lock icon + "Secure checkout via Instacart" + `--cb-label-sm` neutral-500 terms link
- Price total: `--cb-metric-lg`, JetBrains Mono, neutral-900
- Nutrition deviation warning (`--cb-warning-100` chip) if substitutions alter macros > 15%
- Primary CTA: "Place Instacart Order"

#### Stage 4 — Confirmation
- Success illustration (not emoji): checkmark in `--cb-success-600` circle, 72px
- `--cb-display-md` "Order placed"
- Order number + ETA in `--cb-label-md`
- 3-step timeline: Accepted → Shopping → Out for delivery (animated dots at active step)
- Primary CTA: "View My Plan" / Secondary: "Track Order" (deep-link Instacart app/web)

#### Shared Rules
- **One Primary CTA visible per stage** (§0 Non-Negotiable #4)
- Back button in top-left: Ghost style, `aria-label="Go back to [previous stage]"`
- Price total always `--cb-metric-lg`, JetBrains Mono
- `HealthDisclaimer` appears in Stage 1 and Stage 3 when substitutions materially change nutrition

---

### 7.10 Empty States

Every list/grid/chart surface defines a named empty state. Never ship a blank container.

```
┌───────────────────────────────┐
│                               │
│        ⬚ icon-xl (32px)       │  ← neutral-300
│                               │
│      Primary message          │  ← h3, neutral-700
│   Secondary explanation       │  ← body-md, neutral-500, max 2 lines
│                               │
│     [ Primary CTA ]           │  ← optional, brand-600
│                               │
└───────────────────────────────┘
  padding: --cb-space-8 (40px) vertical / --cb-space-6 horizontal
  icon: Lucide stroke, neutral-300, 32px
  max-width: 440px, centered
```

| Surface | Empty Copy | CTA |
|---------|-----------|-----|
| Discover (no search result) | "No celebrities match '[query]'." / "Try a different keyword or browse categories." | Ghost "Clear search" |
| Plan History | "No plans yet." / "Generate your first personalized plan from Discover." | Primary "Explore Diets" |
| Track charts | "Start logging to see your trend." / "Tap 'Log Today' above." | — |
| Weekly Reports | "Your first weekly report arrives after 7 days of tracking." | — |
| Order History | "No orders yet." | Ghost "Browse recipes" |
| Cart | "Your cart is empty." / "Add ingredients from your meal plan." | Primary "Go to My Plan" |
| Notifications | "You're all caught up." | — |

### 7.11 Error States

Three scopes — match the error to the right scope:

**1. Field-level** (form input)
- Red border + `--cb-body-sm` `--cb-danger-600` message below input
- Linked via `aria-describedby`; `aria-invalid="true"`
- Never block submit silently — always surface

**2. Module-level** (one card/section failed; rest of screen works)
```
┌───────────────────────────────────┐
│  ⚠ Couldn't load this section.    │  ← info icon, warning-600 text
│  [ Retry ]                         │  ← ghost button
└───────────────────────────────────┘
  background: --cb-warning-100
  border-left: 3px solid --cb-warning-600
  radius: --cb-radius-sm
```

**3. Screen-level** (primary flow broken)
```
┌─────────────────────────────────┐
│                                 │
│     ⊘ icon-xl danger-600        │
│                                 │
│   Something went wrong          │  ← h2
│   We couldn't [context].        │  ← body-md, specific verb
│   Your data is safe.            │  ← body-sm, reassurance
│                                 │
│     [ Try Again ]    [ Back ]   │
│                                 │
│   Error code: CB-4521           │  ← label-sm neutral-400
└─────────────────────────────────┘
```

**Error copy rules** (per `content.md`):
- No PII in error messages
- No medical specifics in error messages
- Error code visible but low-visual-weight for support reference
- Always include recovery action
- Never say "You did something wrong" — say "We couldn't..."

### 7.12 Toast / Snackbar / Inline Alerts

| Pattern | When | Position | Dismissal |
|---------|------|----------|----------|
| **Toast** | Transient confirmation ("Plan saved") | Top center, 16px from safe area | Auto 4s + swipe/tap |
| **Snackbar** | Action with undo ("Removed. Undo") | Bottom center, above tab bar | Auto 6s + Undo button |
| **Inline alert** | Persistent context (low calorie warning) | In-flow | Manual close or dismissed on navigate |
| **Modal** | Blocking decision | Center + scrim | Explicit CTA only |

**Toast spec**
- Background: `--cb-neutral-900` text `--cb-neutral-0`
- Success variant: `--cb-success-600` bg
- Error variant: `--cb-danger-600` bg
- Radius: `--cb-radius-sm`, padding `--cb-space-3` `--cb-space-4`
- Shadow: `--cb-shadow-2`
- Animation: 180ms emphasized slide + fade
- `role="status"` (success) / `role="alert"` (error)
- `aria-live="polite"` (success) / `aria-live="assertive"` (error)
- Max one toast at a time; subsequent replaces current
- **Never** carry medical-critical info in auto-dismissing toast — use inline alert or modal

### 7.13 Modals & Dialogs

Use sparingly — only for decisions that must be resolved before continuing.

```
┌─────────────────────────────────┐
│  Cancel subscription?           │  ← h2
│                                 │
│  You'll lose access to AI       │  ← body-md, neutral-600
│  personalized plans at the end  │
│  of your billing period.        │
│                                 │
│  [ Keep Premium ]  [ Cancel ]   │  ← Primary / Destructive
└─────────────────────────────────┘
  width: min(440px, calc(100vw - 32px))
  background: --cb-neutral-0
  radius: --cb-radius-xl
  shadow: --cb-shadow-3
  padding: --cb-space-7 (32px)
  scrim: rgba(26,25,23,0.55)
  focus trap: required (first focusable on open, return focus on close)
  close: Esc key, scrim tap, explicit CTA
  role="dialog" aria-modal="true" aria-labelledby=[heading id]
```

**Rules**
- Primary CTA on the right (Western reading order)
- Destructive action never pre-focused
- Never auto-dismiss
- Max two actions; if more needed, use bottom sheet
- Never stack modals — close one before opening another

### 7.14 Tier Gating UX

Spec §8 quotas: Free 3 base diets/month, Premium 4 AI plans/month, Elite unlimited.

| State | Surface | Pattern |
|-------|---------|---------|
| **Counter visible** | Tab 2 header | `"3 of 4 AI plans this month"` in `--cb-label-md` neutral-500 |
| **1 remaining (soft nudge)** | Plan generation CTA | Below CTA: `--cb-warning-100` chip "1 plan left this month · Upgrade to Elite" |
| **Quota exhausted** | Plan generation action | CTA disabled (`aria-disabled="true"`), label flips to `"Monthly limit reached"`, Secondary "Upgrade" Primary CTA appears |
| **Locked content** | Discover (>3rd card on Free) | Card blurred (`filter: blur(12px)`) + overlay `rgba(26,25,23,0.6)` + lock icon + "Premium" label + "Upgrade" Secondary CTA. `aria-disabled="true"` + `aria-describedby="tier-lock-{id}"` |
| **Elite-exclusive** | Celebrity detail (some cards) | Gold crown icon in top-right of card + "Elite" chip + same lock pattern when user is Free/Premium |
| **Quota resets** | Profile → Subscription | Show reset date: `"Resets on April 30"` |

**Upgrade overlay** (full-bleed)
```
┌─────────────────────────────────┐
│  ✨                             │
│  Upgrade to Elite               │  ← display-md Fraunces
│                                 │
│  Unlimited AI plans             │  ← checklist, body-md
│  ✓ Exclusive celebrity content  │
│  ✓ Priority support             │
│  ✓ Advanced biomarker analysis  │
│                                 │
│  $29.99/mo                      │  ← metric-lg JetBrains Mono
│                                 │
│  [ Start Elite ]                │  ← Primary CTA
│  [ Maybe later ]                │  ← Ghost
└─────────────────────────────────┘
```
- Persona-aware copy: Biohacker emphasises "Advanced biomarker analysis"; Aspirational Millennial emphasises "Exclusive celebrity content"
- Never auto-trigger on every session — max 1 overlay per session, dismissible, debounce via local storage

---

## 8. Screen-by-Screen Design

### 8.1 Onboarding (S1–S11)

| Screen | Layout | Key Component | Persona Note |
|--------|--------|---------------|-------------|
| S1 Welcome | Full-viewport dark bg, celebrity mosaic | Primary CTA "Get Started" | CEO: "ready in 2 minutes" subtitle |
| S2 Auth | Centered card | SSO (Apple/Google) + email link | — |
| S3 Basic Info | 1 question/screen | Name, birth year, sex inputs | — |
| S4 Body Metrics | 1 question/screen | Height/weight + unit toggle + optional waist (cm/in) | Biohacker: live BMI calc + waist-to-height ratio |
| S5 Activity | 1 question/screen | 5-level visual cards | A11y: keyboard-selectable |
| S6 Health Info | 1 question/screen | Allergen pill grid + conditions + medications (searchable tag input) | First disclaimer appearance; GLP-1 auto-detection triggers §7.5 conditional text |
| S7 Biomarker | 1 question/screen | Manual input (Phase 1) / Upload (Phase 2) | Biohacker: prominent, not buried |
| S8 Wellness Goal | 1 question/screen | Large radio cards | GLP-1: purple accent + explanation |
| S9 Dietary Pref | 1 question/screen | Diet type + cuisine chips | Photo-backed cuisine chips |
| S10 Summary | Review card | Editable chips, completeness meter | "Personalization confidence" indicator |
| S11 Category | 2×2 grid | 4 category cards with celeb faces | Disclaimer before CTA |

**Rules**: One input per screen. No scrolling within step. Each loads < 150ms.

### 8.2 Tab 1: Discover

```
┌─────────────────────────────────┐
│  [Search bar] (pill, neutral-50)│
├─────────────────────────────────┤
│  Trending Today ─────────►      │  ← horizontal carousel
├─────────────────────────────────┤
│  [All] [Diet] [Protein] [Veg]  │  ← category chips
├─────────────────────────────────┤
│  ┌─────┐  ┌─────┐              │
│  │ A   │  │ A   │              │  ← 2-col Celebrity Discovery Cards
│  └─────┘  └─────┘              │    infinite scroll, cursor pagination
│  ┌─────┐  ┌─────┐              │
│  └─────┘  └─────┘              │
├─────────────────────────────────┤
│  🔒 Unlock more with Premium    │  ← after 3rd card on Free tier
└─────────────────────────────────┘
```

**Celebrity Detail** (drill-in from Discover):
- Full-bleed hero (Section 7.6)
- Tabs below: "About" | "Diet Plans" | "Recipes"
- Source refs as chips
- "Try This Diet" sticky CTA at bottom
- Premium lock: blurred bottom + upsell overlay
- No-photo fallback: Celebrity Hero (§7.6) renders with `--cb-brand-50` gradient + initials badge (72px, Fraunces, neutral-900). Alt text: `"[name] — photo unavailable"`

**Search Results** (focused state from Discover search bar):
```
┌─────────────────────────────────┐
│  [← Search celebrities, recipes]│  ← sticky input, autofocus
├─────────────────────────────────┤
│  Recent                         │  ← label-md, only if history
│  · Tom Brady   [×]              │
│  · Keto recipes [×]             │
├─────────────────────────────────┤
│  Suggestions for "tom"          │  ← live results, 180ms debounce
│  ┌────┐ Tom Brady               │  ← row: 40px avatar + name
│  ┌────┐ Tom Holland             │
│  ┌──┐ Recipes (3) ►             │  ← grouped by type
└─────────────────────────────────┘
```
- Live results: 180ms debounce, min 2 chars
- Empty state (§7.10): `"No results for '[query]'."`
- Error state (§7.11 module-level): `"Search temporarily unavailable. Retry"`
- Skeleton: 5 row skeletons while loading
- Tap result → Celebrity Detail or Recipe Detail

### 8.3 Tab 2: My Plan

```
┌─────────────────────────────────┐
│  Good morning, Sarah            │  ← h1
├─────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐      │
│  │ 1,847   │  │  145g   │      │  ← 2×2 Metric Cards (B)
│  │ kcal    │  │ protein │      │
│  ├─────────┤  ├─────────┤      │
│  │  203g   │  │   62g   │      │
│  │ carbs   │  │  fat    │      │
│  └─────────┘  └─────────┘      │
├─────────────────────────────────┤
│  [Mon][Tue][Wed][Thu][Fri]►     │  ← date strip
├─────────────────────────────────┤
│  ▶ Breakfast: Avocado Toast  ✓  │  ← expandable Plan Day Cards (C)
│  ▶ Lunch: Grilled Salmon    ✓  │
│  ▶ Dinner: Quinoa Stir-fry  ○  │
├─────────────────────────────────┤
│  HealthDisclaimer               │
│                    [🛒 FAB]     │
└─────────────────────────────────┘
```

- **Meal Plan Preview** (generation result): day-by-day overview, adjustment rationale labels (Principle 05), nutrition totals, `HealthDisclaimer` above Primary CTA. CTA: "Confirm Plan" / Secondary: "Adjust & Regenerate"
- **Plan History** (accessed via top-right history icon in My Plan header):
```
┌─────────────────────────────────────┐
│  ← Plan History                     │  ← h2 + back
├─────────────────────────────────────┤
│  [All] [Active] [Completed] [Archived]│ ← filter chip row
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ [📷] Tom Brady · 7 days       │  │  ← 44px circle avatar + h4
│  │      Mar 8 – Mar 14, 2026     │  │  ← label-md neutral-500
│  │      ✓ Active                 │  │  ← success chip
│  │                     [Re-activate] │  ← ghost CTA row-end
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ [📷] Gwyneth Paltrow · 14 days│  │
│  │      Feb 12 – Feb 26, 2026    │  │
│  │      · Completed (86%)        │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```
- Row: `--cb-radius-lg`, `--cb-neutral-50` bg, `--cb-border-default`
- Status chip: Active (success-100/success-600), Completed (neutral-100/neutral-700), Archived (neutral-100/neutral-500)
- Re-activate → confirmation modal (§7.13): "Replace your current plan?"
- Empty state (§7.10): "No plans yet." → Primary "Explore Diets"
- Skeleton: 4 row skeletons

### 8.4 Tab 3: Track

- Daily check-in card: prominent at top, "Log Today" Primary CTA
  - Toggles: meal completion, weight input, energy/mood/sleep 1–5
- Charts (Tesla-flat — no shadows, depth via bg contrast; 2-shadow total-site discipline):
  - Line: weight trend (`--cb-chart-weight`)
  - Bar: weekly adherence (`--cb-chart-adherence`)
  - Area: calorie trend (`--cb-chart-calories`)
- Chart interaction: tap data point → tooltip with date + value
- Below charts: 2×2 Metric Cards weekly summary
- HealthDisclaimer in nutrition trend module

**Weekly / Monthly Reports** (accessed via "Reports" button in Track header):
```
┌─────────────────────────────────────┐
│  Weekly Report · Apr 8–14           │  ← h2
│  [Week] [Month]                     │  ← segmented toggle
├─────────────────────────────────────┤
│  Adherence                          │
│  ████████████░░ 82%                 │  ← metric-lg JetBrains Mono
│  +6% vs last week                   │  ← success-600 delta
├─────────────────────────────────────┤
│  Highlights                         │
│  ✓ Hit protein target 6/7 days      │
│  ⚠ Under hydration goal 4 days      │
│  ✓ Logged every meal this week      │
├─────────────────────────────────────┤
│  [Weight chart: 7-day trend]        │
│  [Macro distribution donut]         │
├─────────────────────────────────────┤
│  HealthDisclaimer                   │
│                                     │
│  [ Share ]          [ Download PDF ]│  ← Secondary + Ghost
└─────────────────────────────────────┘
```
- Week toggle: segmented control, `--cb-brand-600` active
- Deltas: success-600 for positive goals, warning-600 for regressions (not danger — reports aren't failures)
- Empty state: "Your first weekly report arrives after 7 days of tracking." — no CTA
- Reduced motion: delta animations static
- Share: native share sheet; Download PDF: triggers server-side PDF generation with disclaimer footer

### 8.5 Tab 4: Profile

- Avatar (64px, radius-circle) + display name + tier badge (pill)
- Bio Profile card: key stats, "Edit" ghost button
- **Subscription Management**:
  - Current tier card (Card D, §7.2)
  - Next renewal date + amount (`--cb-label-md` neutral-500)
  - "Manage Plan" Secondary CTA → bottom sheet with: Upgrade / Downgrade / Change billing cycle / Cancel
  - Cancel flow: confirmation modal (§7.13) "Cancel subscription?" with end-of-period messaging
  - Quota counters: `"3 of 4 AI plans used · Resets Apr 30"` (§7.14)
- Order History: compact list, status chips, tap → detail screen, empty state §7.10
- Settings: locale, units (lb/kg), notification toggles
- **Support / FAQ**:
  ```
  ┌──────────────────────────────┐
  │  Search help  [ 🔍          ]│  ← search input
  ├──────────────────────────────┤
  │  ▸ Getting started           │  ← accordion row
  │  ▸ Subscription & billing    │
  │  ▸ Health & nutrition        │
  │  ▸ Privacy & data            │
  ├──────────────────────────────┤
  │  Still need help?            │
  │  [ Contact Support ]         │  ← Secondary CTA
  └──────────────────────────────┘
  ```
  - Accordion row: 56px min height, `aria-expanded` managed
  - Contact Support: opens in-app message composer (Elite: priority badge shown)
  - GLP-1 users: dedicated "Medications & meal plans" accordion with conditional content
- Sign Out: ghost, danger-colored, confirmation modal before action

### 8.6 Recipe Detail

- Hero image (16:9), `--cb-radius-lg` bottom corners
- Name (`--cb-h1`), prep/cook time + difficulty chips
- Nutrition table: whisper borders, `--cb-metric-sm` JetBrains Mono numbers
- Ingredients: checkable rows (tap to strikethrough)
- Steps: numbered cards, optional timer button per step
- "Add to Cart" Secondary CTA at bottom
- **HealthDisclaimer always visible below nutrition table**

---

## 9. Responsive Behavior

### 9.1 Breakpoints

| Token | Range | Target |
|-------|-------|--------|
| `xs` | 0–479px | Small mobile |
| `sm` | 480–767px | Standard mobile |
| `md` | 768–1023px | Tablet |
| `lg` | 1024–1279px | Small desktop |
| `xl` | 1280–1535px | Standard desktop |
| `2xl` | ≥1536px | Large desktop |

### 9.2 Grid

- Mobile (<768): single column, 16px gutters
- Tablet (768–1023): 8-column grid, 24px gutters
- Desktop (≥1024): 12-column grid, 32px gutters, max 1200px

### 9.3 Component Reflow

| Element | xs–sm | md | lg | xl+ |
|---------|-------|----|----|-----|
| Discover grid | 1-col (xs) / 2-col (sm) | 3-col | 4-col | 4-col |
| Display XL | 34px | 42px | 52px | 52px |
| Section padding | 24px | 48px | 64px | 72px |
| Celebrity hero | 320px | 420px | 520px | 620px |
| Navigation | Bottom tab | Bottom tab | Top sticky | Top sticky |
| Checkout | Stacked | Stacked | Summary sticky right | Summary sticky right |

### 9.4 Touch Targets

- Mobile interactive minimum: **44×44px**
- Web click target minimum: **36×36px**
- Tab bar icon zone: min 64px width

### 9.5 React Native

- All dimensions in dp. Layout via Flexbox + `useWindowDimensions()`
- No CSS breakpoints — conditional rendering via width thresholds
- Tablet (≥768dp): 2-column layouts, expanded grids

### 9.6 Next.js

- CSS custom properties + standard media queries
- Mobile-first. Content max-width 1200px.
- SSR defaults to light theme; hydrate user preference after mount

---

## 10. Motion & Animation

### 10.1 Tokens

```css
:root {
  --cb-motion-instant: 0ms;
  --cb-motion-quick: 120ms;
  --cb-motion-fast: 180ms;
  --cb-motion-base: 240ms;
  --cb-motion-slow: 320ms;
  --cb-motion-deliberate: 480ms;

  --cb-ease-standard: cubic-bezier(0.2, 0.0, 0, 1);
  --cb-ease-emphasized: cubic-bezier(0.2, 0.8, 0.2, 1);
  --cb-ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --cb-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 10.2 Specific Animations

| Animation | Duration | Easing | Detail |
|-----------|----------|--------|--------|
| Screen transition | 240ms | standard | 16px Y fade-in |
| Bottom sheet open | 320ms | emphasized | Y 24px → 0 |
| Button press | 120ms | spring | scale 1→0.98→1 |
| Tab switch | 180ms | standard | slide + opacity |
| Macro ring fill | 300ms | exit | animate from 0 on enter |
| Celebrity hero entrance | 320ms | emphasized | shared element transition (card → full-bleed) |
| Loading progress | 480ms | standard | smooth linear fill |
| Skeleton shimmer | 1200ms | linear infinite | background-position -120% → 120% |
| Check-in success | 180ms | spring | scale(1.1) pulse |

### 10.3 Reduced Motion

When `prefers-reduced-motion: reduce`:
- All non-essential animations stop
- Progress bars fill instantly
- Page transitions are instant cuts
- Skeleton shimmer → static base color
- Macro rings render at final value

---

## 11. Iconography

### 11.1 Library

**Lucide Icons** — MIT, `lucide-react-native` + `lucide-react`.

### 11.2 Size Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-icon-xs` | 14px | Inline with small text |
| `--cb-icon-sm` | 16px | Input adornments |
| `--cb-icon-md` | 20px | Button icons, list items |
| `--cb-icon-lg` | 24px | Tab bar, card actions |
| `--cb-icon-xl` | 32px | Feature icons, empty states |

### 11.3 Rules

- Stroke width: 1.75px
- Default color: `--cb-neutral-500`; active: `--cb-brand-600`; inverse: `#FFFFFF`
- Stroke icons for UI controls; filled for active tab state only
- All icon-only buttons must have `accessibilityLabel` / `aria-label`
- Custom icons in `packages/ui-kit/src/icons/`: celebrity star badge, GLP-1 pill, macro ring segments, Instacart carrot logo

---

## 12. Accessibility

### 12.1 Contrast

All tokenized pairs verified in Section 2.9. Enforcement: any new pair < 4.5:1 is blocked.

### 12.2 Interactive States

- Focus ring: `--cb-shadow-focus`, visible only on keyboard (`:focus-visible`)
- `aria-live="polite"` for form errors and loading status
- `aria-busy="true"` + `role="progressbar"` + `aria-valuenow` on loading states

### 12.3 Forms

- Every input: persistent label above
- Error text: linked via `aria-describedby`
- Required fields announced to screen readers
- Multi-select chips: `aria-pressed` or checkbox semantics

### 12.4 Health Disclaimer

- Always in DOM / accessibility tree
- `role="note"`, **never** `aria-hidden="true"`
- Reachable before final CTA in reading order
- Collapsed state still readable by screen reader

### 12.5 Charts

- Textual summary below each chart: period, trend direction, max/min
- Color is never sole signal — include markers/labels
- `aria-label` with human-readable trend description

### 12.6 Platform

- iOS: Dynamic Type support
- Android: TalkBack compatibility
- Web: full keyboard nav, skip-to-content link
- Skeleton screens: `aria-label="Loading content"`

### 12.7 Locked Content

- Subscription gating: `aria-disabled="true"` + label "Requires Premium subscription"

---

## 13. AI Agent Prompt Guide

> Prompt vocabulary is inherited from the five lineage brands' **Example Component Prompts** and **Do/Don't** lists (Apple §7, Tesla §7, Airbnb §7, Claude §7, Sanity §7). When generating a CelebBase screen, an agent should recognize the narrative beat first, then reach for the concrete `--cb-*` token.

### 13.1 Core Directives

**Token discipline (non-negotiable):**
1. **Always** use `--cb-*` tokens — never raw hex values in components. If a color is missing from §2, stop and add a token, do not inline.
2. **Always** use named type tokens (`--cb-display-xl`, `--cb-body-md`) — never `font-size: 52px`.
3. **Always** use spacing tokens (`--cb-space-4`) — never `padding: 16px`.

**Synthesis rhythm (narrative beats from §0 lineage):**
4. **Cinematic pacing (Apple)** — one headline per viewport, 1.07–1.14 line-height on display sizes, negative tracking at every scale. Body copy left-aligned; only hero headlines center.
5. **Gallery restraint (Tesla)** — one Primary CTA per screen (second gold button = design error). All transitions 0.33s. No scale/translate on hover — color-only transitions.
6. **Warm photography cards (Airbnb)** — celebrity portraits use `--cb-radius-2xl` (32px) with the three-layer shadow (`--cb-shadow-1`/`2`/`3`). Never pure `#000000` text — `--cb-neutral-900` (`#1A1917`) is deliberately warm.
7. **Literary voice (Claude)** — body line-height 1.60, serif (Fraunces) for content headlines only, sans (Plus Jakarta) for all UI labels. Generous radius (≥12px) on cards. Depth comes from **ring halos** (`0 0 0 1px var(--cb-border-whisper)`), not drop shadows on resting-state surfaces.
8. **Editorial precision (Sanity)** — IBM-Plex-Mono-style uppercase labels (`--cb-label-mono`, JetBrains Mono 11–13px, letter-spacing +0.08em) for metadata, tags, metric units. Radius ladder jumps from `--cb-radius-lg` (16px) to `--cb-radius-pill` (9999px) — nothing between 17px and 9998px.

**Category guarantees:**
9. Celebrity images: always `object-fit: cover`, `loading="lazy"`, `alt` text includes the name.
10. Metrics: `--cb-metric-*` tokens + JetBrains Mono weight 500, tabular-nums enabled.
11. Health disclaimer: never remove, never `display: none`, never `aria-hidden="true"`. `role="note"` is required when content is nutrition-heavy.
12. Every async module ships with a `SkeletonBlock` — blank loading states are rejected at review.
13. Max one shadow upgrade per interaction state (rest → `--cb-shadow-1`, hover → `--cb-shadow-2`). Focus ring is ring-only (`--cb-ring-focus`), never combined with an additional shadow.

### 13.2 Screen-Specific Prompts

Each prompt below is written in the **Example Component Prompt** register of §0's lineage brands: name the surface → name the typography + weight + tracking → name the accent token → name the interaction.

**Celebrity Discovery (home):**
> "Build a 2-column grid of Celebrity Discovery Cards on `--cb-surface-page` (`#FAFAF8`). Each card: 4:5 portrait photo at the top (full-bleed, `object-fit: cover`), `--cb-radius-2xl` (32px), three-layer warm shadow (`--cb-shadow-1` rest, `--cb-shadow-2` hover, both warm-toned per Airbnb lineage — never cool rgba). Celebrity name in Fraunces SemiBold at `--cb-headline-md` (28px, line-height 1.14, letter-spacing -0.28px — Apple tight-track). One-line discipline subtitle in Plus Jakarta 14px weight 500, color `--cb-text-muted`. Category chips above the grid: active chip uses `--cb-brand-100` bg + `--cb-brand-700` text, `--cb-radius-pill`. Gold `--cb-brand-500` (`#C9A84C`) is the sole accent — reject Airbnb Rausch `#FF385C`, Apple Blue `#0071E3`, Sanity Coral `#F36458`, Claude Terracotta `#C96442`, Tesla Electric Blue `#3E6AE1`."

**Celebrity Hero (detail top):**
> "Apple-style cinematic hero on black (`--cb-surface-inverse` `#1A1917` — never pure `#000000`): full-bleed cover photograph, name in Fraunces 56px weight 600, line-height 1.07, letter-spacing -0.56px, color `--cb-text-inverse`. One-line editorial descriptor below at 21px line-height 1.19, weight 400. Two pill CTAs below the descriptor: primary ('Start 7-Day Plan') uses `--cb-brand-600` background + `--cb-cta-text`, `--cb-radius-pill`; secondary ('See Routine') is transparent + 1px `rgba(255,255,255,0.4)` border, same radius. One CTA per visual hierarchy — Tesla gallery rule."

**My Plan (daily):**
> "Greeting line in Fraunces 32px weight 500 with user's first name (`Hi, {firstName}.`). Below, a 2×2 grid of Metric Cards: flat surface on `--cb-surface-elevated`, **no shadow** — the warm whisper border (`1px solid --cb-border-whisper`) supplies containment in Tesla's flat register. Metric numerals in JetBrains Mono weight 500 with tabular-nums, sized `--cb-metric-md`; caption under each in uppercase `--cb-label-mono` (Sanity editorial precision). Date strip below: today = `--cb-brand-500` 2px underline, rest = neutral. Expandable meal cards use `--cb-radius-lg` (16px) with the three-layer shadow only on elevation (Airbnb warm lift). FAB: `--cb-brand-600` circle, 56px, bottom-right, above tab bar. `HealthDisclaimer` sits directly above the FAB, `role=\"note\"`, never tucked behind an accordion."

**Track (weight/adherence):**
> "Apply Tesla's gallery flatness locally: every chart renders with zero `box-shadow`, depth comes from background contrast (`--cb-surface-page` vs. `--cb-surface-elevated`). Weight trend line uses `--cb-chart-weight` (`#0E8F7D`), adherence bars classified by threshold (success ≥80% → `--cb-semantic-success-600`, warning 50–79% → `--cb-semantic-warning-600`, danger <50% → `--cb-semantic-danger-600`). Axis labels in uppercase `--cb-label-mono` (Sanity). Daily check-in card at top uses one Primary CTA ('Log today'). `HealthDisclaimer` lives inside the nutrition module, not the page footer."

**Recipe Detail:**
> "Hero image 16:9 at top, `--cb-radius-lg` on the bottom corners only. Title in Fraunces 40px weight 600, line-height 1.10, letter-spacing -0.40px. Nutrition table: whisper border rows (Claude ring-halo philosophy — `0 0 0 1px --cb-border-whisper` between rows, not solid fills), JetBrains Mono `--cb-metric-sm` for values, uppercase mono labels for macronutrient names. Ingredients: checkable rows with circle checkbox (`--cb-radius-pill`). `HealthDisclaimer` MUST render below the nutrition table — never as an info-icon tooltip."

**Dark Mode (Elite tier):**
> "Wrap the route in `[data-theme='dark']`. All `--cb-*` tokens remap automatically via §2.8 overrides — the agent must never hand-pick dark hex values. Remove all `box-shadow` rules at the dark theme layer (Sanity: 'dark interfaces demand colorimetric depth'). Depth comes from surface-brightness steps (§6.2): `--cb-surface-page` → `--cb-surface-elevated` → `--cb-surface-raised`. Borders: `rgba(255,255,255,0.08)` only. CTA text uses `--cb-cta-text` (auto-flips). Lowest surface is `#141412` — reject pure `#000000` (Airbnb warm-black lesson: even on dark, pure black reads as cold/synthetic)."

### 13.3 Prompt Templates

| Template | Prompt skeleton |
|----------|----------------|
| **New screen** | "Build [SCREEN] for [web / RN]. Use `--cb-*` tokens only. One Primary CTA. `SkeletonBlock` for every async block. If nutrition content present → `HealthDisclaimer` with `role=\"note\"` above the footer. Match the lineage beat (cinematic pacing / gallery restraint / warm cards / literary voice / editorial precision — name which one)." |
| **New component** | "Create [COMPONENT] with CelebBase tokens. Deliver all four states: default, hover, focus-visible (ring-only), disabled. Verify text contrast ≥ 4.5:1 (body) / ≥ 3:1 (large display). Respect the token radius ladder — nothing between 17px and pill." |
| **QA audit** | "Audit [SCREEN] against §13 directives: one Primary CTA, token-only styles (no raw hex), `SkeletonBlock` coverage on every async region, `HealthDisclaimer` placement + role, contrast, focus-visible ring, shadow-upgrade-per-state rule, radius ladder compliance. Return violations as a markdown checklist with file:line citations." |

### 13.4 Anti-Patterns to Block

Each anti-pattern below traces to one of the lineage Do/Don't sources.

- **Multiple Primary CTAs per viewport** (Tesla §7.Don't: "clutter the viewport with multiple CTAs").
- **Cool blue-gray shadows** on resting-state surfaces. All depth must be warm-toned or ring-only (Claude §7.Don't + Airbnb three-layer rule).
- **Borrowed accent colors from the lineage brands.** Reject literal `#0071E3` (Apple Blue), `#FF385C` (Airbnb Rausch), `#3E6AE1` (Tesla Electric), `#F36458` (Sanity Coral), `#0052EF` (Sanity hover blue), `#C96442` (Claude Terracotta) anywhere in CelebBase code. Gold `--cb-brand-500` is the sole accent.
- **Pure `#000000` text or surfaces** — always `--cb-neutral-900` (`#1A1917`, warm) per Airbnb §7.Don't.
- **Heavy drop shadows** in any light-theme resting state (Claude §7.Don't). Hover may upgrade one shadow level.
- **Direct hex values** in component code — token-only.
- **Type sizes outside `--cb-*-{xs,sm,md,lg,xl}` scale**; font-sizes inline.
- **Shadow values outside the token set** (§6.1).
- **Fraunces below 34px** — Apple optical-sizing boundary applied locally. Plus Jakarta takes over under 34px.
- **Anthropic Serif 700 or higher on the serif family.** Fraunces tops at 600 on web, 700 only on FAQ titles (explicit §3.4 allowlist).
- **Radius values between 17px and 9998px.** System jumps from `--cb-radius-lg` (16px) directly to `--cb-radius-pill` (9999px).
- **Uppercase transforms on body or display text** (Tesla §7.Don't). Uppercase is reserved for `--cb-label-mono`.
- **Centered body copy.** Body paragraphs are left-aligned; only hero display headlines may center (Apple §7.Don't).
- **Empty loading screens** — every async region ships with `SkeletonBlock`.
- **`HealthDisclaimer` suppressed** via `display: none`, `aria-hidden`, `visibility: hidden`, tooltip-only, or conditional rendering based on auth tier.

---

## 14. Implementation Notes

### 14.1 File Paths

| Purpose | Path |
|---------|------|
| Shared token source | `packages/design-tokens/tokens.json` |
| Shared token CSS | `packages/design-tokens/tokens.css` |
| Shared token TS | `packages/design-tokens/tokens.native.ts` |
| RN theme | `apps/mobile/src/theme/tokens.ts` |
| Web CSS | `apps/web/src/styles/tokens.css` |
| Shared UI kit | `packages/ui-kit/src/` |
| Custom icons | `packages/ui-kit/src/icons/` |
| Font assets (RN) | `apps/mobile/src/assets/fonts/` |

### 14.2 Token Export (TypeScript)

```typescript
// packages/design-tokens/tokens.native.ts
export const colors = {
  brand: {
    500: '#C9A84C', 600: '#8B6D2F', 700: '#6B5420',
    100: '#F5EDDA', 50: '#FBF8F0',
  },
  neutral: {
    0: '#FAFAF8', 50: '#F4F3F0', 100: '#E8E6E1',
    200: '#D0CEC8', 300: '#A8A5A0', 400: '#8A8780',
    500: '#6D6A64', 600: '#5A5750', 700: '#3D3B37',
    900: '#1A1917',
  },
  semantic: {
    success600: '#0F7438', success100: '#DDF3E6',
    warning600: '#A15900', warning100: '#FDEBD5',
    danger600: '#B4232C', danger100: '#FADADD',
    info600: '#1767B8', info100: '#D9EAFB',
  },
  tier: {
    free: { bg: '#EEF2F5', border: '#CBD5DE', text: '#33414E' },
    premium: { bg: '#E8F6F3', border: '#79C8BB', text: '#0B5A4F' },
    elite: { bg: '#1A1917', border: '#C9A84C', text: '#F5EDDA' },
  },
  chart: {
    weight: '#0E8F7D', adherence: '#1767B8',
    protein: '#A06A1C', calories: '#7A4D00', goal: '#6A737C',
  },
} as const;

export const spacing = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24,
  7: 32, 8: 40, 9: 48, 10: 56, 11: 64, 12: 72, 13: 80, 14: 96,
} as const;

export const radius = {
  none: 0, xs: 4, sm: 8, md: 12, lg: 16,
  xl: 24, '2xl': 32, pill: 9999, circle: '50%',
} as const;

export const component = {
  buttonPadY: 14,
  buttonPadX: 32,
  buttonPadXSecondary: 34,
  inputHeight: 52,
  fabSize: 56,
  tabBarHeight: 72,
  topNavHeight: 72,
} as const;

// Dark theme overrides resolved at runtime via useColorScheme() →
// `import { darkColors } from './tokens.dark.native'` — same shape as `colors`.

export type ColorToken = typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type ComponentToken = keyof typeof component;
```

### 14.3 CSS Custom Properties (Web)

```css
/* apps/web/src/styles/tokens.css */
:root {
  --cb-brand-500: #C9A84C;
  --cb-brand-600: #8B6D2F;
  --cb-brand-700: #6B5420;
  /* ... all tokens from Sections 2–6 ... */
}

[data-theme="dark"] {
  /* ... Section 2.8 overrides ... */
}
```

### 14.4 Font Loading (React Native)

```typescript
import { useFonts } from 'expo-font';
const [fontsLoaded] = useFonts({
  'Fraunces-SemiBold': require('./assets/fonts/Fraunces-SemiBold.ttf'),
  'Fraunces-Bold': require('./assets/fonts/Fraunces-Bold.ttf'),
  'PlusJakartaSans-Regular': require('./assets/fonts/PlusJakartaSans-Regular.ttf'),
  'PlusJakartaSans-Medium': require('./assets/fonts/PlusJakartaSans-Medium.ttf'),
  'PlusJakartaSans-SemiBold': require('./assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('./assets/fonts/PlusJakartaSans-Bold.ttf'),
  'JetBrainsMono-Medium': require('./assets/fonts/JetBrainsMono-Medium.ttf'),
  'JetBrainsMono-Bold': require('./assets/fonts/JetBrainsMono-Bold.ttf'),
});
// Show skeleton splash while loading — never un-styled text
```

### 14.5 Component Build Order

| Priority | Components |
|----------|-----------|
| 1 | `ButtonPrimary`, `ButtonSecondary`, `ButtonTertiary` |
| 2 | `InputField`, `SelectField`, `SegmentedControl`, `Chip`, `SlotChip` |
| 3 | `CardEditorial`, `CardMetric`, `CardPlanDay`, `CardTier`, `CardCheckout`, `CardHistoryRow` |
| 4 | `HealthDisclaimer` |
| 5 | `SkeletonBlock`, `SkeletonCard`, `SkeletonChart`, `SkeletonRow` |
| 6 | `EmptyState`, `ErrorState`, `Toast`, `Snackbar`, `Modal`, `BottomSheet` |
| 7 | `TabBar`, `TopNav`, `ProgressSteps` |
| 8 | `CelebrityHero`, `TierLockOverlay`, `UpgradeOverlay` |
| 9 | `CheckoutSummary`, `DeliverySlotPicker`, `PaymentReview` |
| 10 | `ReportCard`, `DeltaIndicator`, `AccordionRow` |

### 14.6 Screen Build Order

1. S1–S3 (Welcome, Auth, Basic Info)
2. S4–S7 (Body Metrics, Activity, Health, Biomarker)
3. S8–S11 (Goals, Diet Pref, Summary, Category)
4. Tab 1: Discover + Celebrity Detail
5. Tab 2: My Plan + Meal Plan Preview
6. Recipe Detail
7. Checkout (4 stages)
8. Tab 3: Track
9. Tab 4: Profile + Subscription

### 14.7 Definition of Done per Screen

- [ ] Uses token-only styles (no raw hex/px)
- [ ] Exactly one Primary CTA visible
- [ ] Skeleton present for all async modules
- [ ] `HealthDisclaimer` present where nutrition/diet info appears
- [ ] Accessibility: contrast, focus, labels pass audit
- [ ] Responsive verified at xs/md/lg/xl breakpoints
- [ ] Fraunces only at ≥34px display sizes
- [ ] JetBrains Mono only for numeric values

### 14.8 Governance

- Any new color/spacing/type/radius/shadow value → design token PR required
- Any new screen → must include CTA count, skeleton, empty-state, error-state, and disclaimer annotations
- Any nutrition screen merge → **blocked** without disclaimer verification
- Any new contrast pair → must be ≥ 4.5:1 text / 3:1 graphics, added to §2.9 audit table
- `packages/design-tokens/scripts/verify-contrast.ts` runs in CI on every token change. Claimed ratio in §2.9 must match computed value within 0.05. Mismatch → CI fail.
- `scripts/sync-tokens.ts` regenerates CSS + TS + dark overrides from `tokens.json` — hand-edits to generated files are rejected by CI.
- Component-level token drift (e.g., hard-coded 14px button padding) is detected by Stylelint custom rule `celebbase/no-raw-component-values`.
- Fraunces below 34px → blocked by `ui-kit` runtime warning in dev mode.

---

*This document is the canonical UI source of truth for CelebBase Wellness. Engineering implements tokens first, primitives second, screens third. No UI implementation should proceed with values outside this document.*
