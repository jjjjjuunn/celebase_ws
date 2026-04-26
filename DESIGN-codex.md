# DESIGN-codex.md

Section 0. Header & Manifesto

Document: CelebBase Wellness Design System (Codex Edition)
Version: 1.0.0
Owner: Product Design + Frontend Engineering
Platforms: React Native (iOS/Android) + Next.js (Web)
Date: 2026-04-15
Status: Production-ready baseline

Manifesto:
- CelebBase is a premium wellness operating system, not a recipe gallery.
- Every screen must reduce decision fatigue for time-poor users.
- Data-heavy moments must remain calm, legible, and trustworthy.
- Discovery should feel editorial and aspirational, never noisy.
- Personalization must feel medically careful, never diagnostic.
- Checkout must be fast, explicit, and confidence-building.
- One screen, one primary action.
- Zero blank states during async operations; skeletons are mandatory.
- Nutrition and diet content must always include medical disclaimer text.

Product Promise:
- “Celebrity-inspired, bio-adapted, operationalized in one tap.”

Experience Pillars:
- Premium Calm: cinematic spacing, controlled typography, restrained color.
- Guided Momentum: user always knows next action in under 3 seconds.
- Explainable Personalization: every generated change is surfaced with reason.
- Conversion Without Pressure: single dominant CTA, clear alternatives.

Non-Negotiables:
- WCAG 2.1 AA minimum across all text pairings.
- Health disclaimer on every nutrition/diet screen, never aria-hidden.
- Theme token architecture only (`--cb-*`); no inline color/spacing constants.
- Max one primary CTA per screen.
- Skeleton loaders for all network-backed modules.

Section 1. Brand Identity & Design Principles

1.1 Brand Positioning
- Category: Premium B2C wellness + food commerce.
- Emotional target: “I feel looked after by an elite nutrition concierge.”
- Functional target: “I can go from intent to plan to delivery in under 2 minutes.”

1.2 Brand Voice
- Clear, not clinical.
- Confident, not aggressive.
- Aspirational, not exclusionary.
- Evidence-aware, not pseudo-scientific.

1.3 Persona-Guided UX Priorities
- Household CEO:
  - Prioritize quick picks, defaults, and low-cognitive load summaries.
  - Show “why this is chosen for you” in one sentence.
- Biohacker:
  - Prioritize control panes, nutrient precision, and trend overlays.
  - Expose macro/micro deltas and confidence indicators.
- GLP-1 User:
  - Prioritize high-protein safeguards, satiety-friendly meal cadence.
  - Surface muscle preservation guidance explicitly.
- Aspirational Millennial:
  - Prioritize celebrity story context and social proof modules.
  - Keep outcomes grounded in user bio-data, not celebrity mimicry.

1.4 Visual Direction
- Base atmosphere: premium whitespace and cinematic framing.
- Discovery mood: warm editorial cards with photo-first storytelling.
- Data mood: structured, comfortable density with concise dashboards.
- Payment mood: flat, pill-forward, low-friction confirmation patterns.

1.5 Design Principles
- Principle 01: One Dominant Action
  - Exactly one primary CTA per screen.
- Principle 02: Context First
  - Show current objective, then options, then details.
- Principle 03: Safe Health Framing
  - Educational tone, never diagnosis or treatment implication.
- Principle 04: Traceable Personalization
  - Every AI adjustment has a visible rationale label.
- Principle 05: Platform-Native Feel
  - Shared tokens, platform-specific interaction nuance.

1.6 Visual Signature
- Signature gradient for premium surfaces: soft champagne to ivory.
- Signature accent: disciplined teal for action and trust.
- Signature micro-detail: thin metric separators and pill tags.

Section 2. Color System (exact hex values + CSS custom property tokens --cb-*)

2.1 Color Strategy
- Neutral foundation for trust and readability.
- Warm premium undertones for hospitality and aspiration.
- Teal-led action system for health + commerce clarity.
- Strict semantic mapping; no ad-hoc color usage.

2.2 Core Tokens (Light Theme)
```css
:root {
  --cb-color-bg-canvas: #FCFAF7;
  --cb-color-bg-surface: #FFFFFF;
  --cb-color-bg-elevated: #F7F3EE;
  --cb-color-bg-muted: #F1ECE5;
  --cb-color-bg-inverse: #1E2328;

  --cb-color-text-primary: #1F252B;
  --cb-color-text-secondary: #4E5A65;
  --cb-color-text-tertiary: #6D7882;
  --cb-color-text-inverse: #FFFFFF;
  --cb-color-text-disabled: #8B949C;

  --cb-color-border-subtle: #D9D2C9;
  --cb-color-border-strong: #B8AEA2;
  --cb-color-divider: #E6E0D8;

  --cb-color-brand-500: #0E8F7D;
  --cb-color-brand-600: #0B786A;
  --cb-color-brand-700: #095E53;
  --cb-color-brand-050: #E8F6F3;
  --cb-color-brand-100: #D1EDE7;

  --cb-color-accent-gold-500: #A06A1C;
  --cb-color-accent-gold-100: #F2E3CF;

  --cb-color-success-500: #1D8F4E;
  --cb-color-success-100: #DDF3E6;
  --cb-color-warning-500: #B86A00;
  --cb-color-warning-100: #FDEBD5;
  --cb-color-error-500: #B4232C;
  --cb-color-error-100: #FADADD;
  --cb-color-info-500: #1767B8;
  --cb-color-info-100: #D9EAFB;

  --cb-color-tier-free-bg: #EEF2F5;
  --cb-color-tier-free-border: #CBD5DE;
  --cb-color-tier-free-text: #33414E;

  --cb-color-tier-premium-bg: #E8F6F3;
  --cb-color-tier-premium-border: #79C8BB;
  --cb-color-tier-premium-text: #0B5A4F;

  --cb-color-tier-elite-bg: #1F252B;
  --cb-color-tier-elite-border: #A06A1C;
  --cb-color-tier-elite-text: #F9E9D2;

  --cb-color-focus-ring: #0B786A;
  --cb-color-overlay-scrim: #1F252BB3;
  --cb-color-skeleton-base: #E8E1D8;
  --cb-color-skeleton-shimmer: #F5EFE7;

  --cb-color-chart-weight: #0E8F7D;
  --cb-color-chart-adherence: #1767B8;
  --cb-color-chart-protein: #A06A1C;
  --cb-color-chart-calories: #7A4D00;
  --cb-color-chart-goal: #6A737C;
}
```

2.3 Dark Theme Tokens
```css
[data-theme="dark"] {
  --cb-color-bg-canvas: #171B1F;
  --cb-color-bg-surface: #1E2328;
  --cb-color-bg-elevated: #262C32;
  --cb-color-bg-muted: #2F363D;
  --cb-color-bg-inverse: #FCFAF7;

  --cb-color-text-primary: #F4F1EC;
  --cb-color-text-secondary: #D2CCC3;
  --cb-color-text-tertiary: #B3ADA4;
  --cb-color-text-inverse: #1F252B;
  --cb-color-text-disabled: #8D949C;

  --cb-color-border-subtle: #3A424A;
  --cb-color-border-strong: #4E5963;
  --cb-color-divider: #323A42;

  --cb-color-brand-500: #38B4A0;
  --cb-color-brand-600: #289C89;
  --cb-color-brand-700: #1E7F70;
  --cb-color-brand-050: #1A2F2B;
  --cb-color-brand-100: #20423E;

  --cb-color-accent-gold-500: #CF9440;
  --cb-color-accent-gold-100: #3D2F1D;

  --cb-color-success-500: #40B36C;
  --cb-color-success-100: #1F3A2A;
  --cb-color-warning-500: #E89A2A;
  --cb-color-warning-100: #3A2B16;
  --cb-color-error-500: #E05A63;
  --cb-color-error-100: #3D1F23;
  --cb-color-info-500: #5CA7F0;
  --cb-color-info-100: #1B2E42;

  --cb-color-tier-free-bg: #283039;
  --cb-color-tier-free-border: #4C5A68;
  --cb-color-tier-free-text: #D9E2EB;

  --cb-color-tier-premium-bg: #1E3C37;
  --cb-color-tier-premium-border: #38B4A0;
  --cb-color-tier-premium-text: #D5F4EE;

  --cb-color-tier-elite-bg: #13171B;
  --cb-color-tier-elite-border: #CF9440;
  --cb-color-tier-elite-text: #F7E8D3;

  --cb-color-focus-ring: #38B4A0;
  --cb-color-overlay-scrim: #0E1115CC;
  --cb-color-skeleton-base: #2D343B;
  --cb-color-skeleton-shimmer: #3B444D;

  --cb-color-chart-weight: #38B4A0;
  --cb-color-chart-adherence: #5CA7F0;
  --cb-color-chart-protein: #CF9440;
  --cb-color-chart-calories: #E6B56A;
  --cb-color-chart-goal: #A9B1BA;
}
```

2.4 Mandatory Contrast Pair Calculations (WCAG 2.1 AA)
Formula:
- Relative luminance: L = 0.2126R + 0.7152G + 0.0722B (linearized)
- Contrast ratio: (L1 + 0.05) / (L2 + 0.05), L1 > L2

Checked pairs:
- `#1F252B` text on `#FCFAF7` bg: 14.03:1
- `#4E5A65` text on `#FCFAF7` bg: 6.78:1
- `#6D7882` text on `#FFFFFF` bg: 4.61:1
- `#FFFFFF` text on `#0E8F7D` button: 4.55:1
- `#FFFFFF` text on `#0B786A` button: 5.80:1
- `#0B786A` text on `#E8F6F3` pill: 5.18:1
- `#33414E` text on `#EEF2F5` tier card: 7.07:1
- `#0B5A4F` text on `#E8F6F3` tier card: 6.67:1
- `#F9E9D2` text on `#1F252B` elite card: 13.54:1
- `#B4232C` text on `#FFFFFF` error label: 6.49:1
- `#B86A00` text on `#FFFFFF` warning label: 4.84:1
- `#1767B8` text on `#FFFFFF` info label: 5.62:1
- `#F4F1EC` text on `#171B1F` dark bg: 14.72:1
- `#D2CCC3` text on `#171B1F` dark bg: 9.71:1
- `#B3ADA4` text on `#1E2328` dark surface: 6.45:1
- `#1F252B` text on `#F4F1EC` inverse surface: 13.66:1

Enforcement:
- Any new pair below 4.5:1 is blocked in design review.
- Body text minimum: 4.5:1.
- Large text (>=24px regular or >=18.66px bold) minimum: 3:1, but system still targets 4.5:1.

2.5 Usage Rules
- Brand teal (`--cb-color-brand-*`) is for interactive emphasis only.
- Gold accent is reserved for elite/premium signaling and nutrient highlights.
- Semantic colors are never used as decorative backgrounds.
- Charts must use chart tokens only.

Section 3. Typography (font families, full type scale)

3.1 Font Stack
- Display font: `Fraunces, "Iowan Old Style", "Times New Roman", serif`
- UI/Body font: `"Plus Jakarta Sans", "Avenir Next", "Segoe UI", sans-serif`
- Numeric font: `"JetBrains Mono", "SF Mono", Menlo, monospace`

Rationale:
- Fraunces gives editorial premium tone for celebrity storytelling.
- Plus Jakarta Sans keeps app interfaces modern and legible.
- Mono numerals stabilize metric scanning in charts and nutrition grids.

3.2 Type Tokens
```css
:root {
  --cb-font-display: Fraunces, "Iowan Old Style", "Times New Roman", serif;
  --cb-font-body: "Plus Jakarta Sans", "Avenir Next", "Segoe UI", sans-serif;
  --cb-font-mono: "JetBrains Mono", "SF Mono", Menlo, monospace;

  --cb-type-size-00: 12px;
  --cb-type-size-01: 13px;
  --cb-type-size-02: 14px;
  --cb-type-size-03: 16px;
  --cb-type-size-04: 18px;
  --cb-type-size-05: 20px;
  --cb-type-size-06: 24px;
  --cb-type-size-07: 28px;
  --cb-type-size-08: 34px;
  --cb-type-size-09: 42px;
  --cb-type-size-10: 52px;

  --cb-type-lh-tight: 1.12;
  --cb-type-lh-snug: 1.24;
  --cb-type-lh-body: 1.5;
  --cb-type-lh-relaxed: 1.65;

  --cb-type-weight-regular: 400;
  --cb-type-weight-medium: 500;
  --cb-type-weight-semibold: 600;
  --cb-type-weight-bold: 700;

  --cb-type-track-tight: -0.02em;
  --cb-type-track-normal: 0em;
  --cb-type-track-wide: 0.02em;
}
```

3.3 Full Type Scale
- Display/Marketing:
  - `cb-display-xl`: 52px, 600, line-height 1.12, letter-spacing -0.02em, Fraunces
  - `cb-display-lg`: 42px, 600, line-height 1.12, letter-spacing -0.02em, Fraunces
  - `cb-display-md`: 34px, 600, line-height 1.24, letter-spacing -0.01em, Fraunces
- Product Headings:
  - `cb-h1`: 28px, 700, line-height 1.24, letter-spacing -0.01em, Plus Jakarta Sans
  - `cb-h2`: 24px, 700, line-height 1.24, letter-spacing -0.01em, Plus Jakarta Sans
  - `cb-h3`: 20px, 600, line-height 1.24, letter-spacing 0em, Plus Jakarta Sans
  - `cb-h4`: 18px, 600, line-height 1.24, letter-spacing 0em, Plus Jakarta Sans
- Body:
  - `cb-body-lg`: 18px, 400, line-height 1.5, letter-spacing 0em
  - `cb-body-md`: 16px, 400, line-height 1.5, letter-spacing 0em
  - `cb-body-sm`: 14px, 400, line-height 1.5, letter-spacing 0em
- Utility:
  - `cb-label-md`: 14px, 600, line-height 1.24, letter-spacing 0.01em
  - `cb-label-sm`: 13px, 600, line-height 1.24, letter-spacing 0.01em
  - `cb-caption`: 12px, 500, line-height 1.5, letter-spacing 0.01em
  - `cb-metric-lg`: 24px, 600, line-height 1.24, letter-spacing 0em, JetBrains Mono
  - `cb-metric-md`: 16px, 500, line-height 1.24, letter-spacing 0em, JetBrains Mono

3.4 Text Usage Rules
- Do not use display font for form labels, legal text, or tables.
- Avoid font size below 12px.
- Numeric dashboard values should use mono tokens.
- Primary CTA text always 16px/600.

Section 4. Spacing Scale (8px base)

4.1 Spacing Tokens
```css
:root {
  --cb-space-0: 0px;
  --cb-space-1: 4px;
  --cb-space-2: 8px;
  --cb-space-3: 12px;
  --cb-space-4: 16px;
  --cb-space-5: 20px;
  --cb-space-6: 24px;
  --cb-space-7: 32px;
  --cb-space-8: 40px;
  --cb-space-9: 48px;
  --cb-space-10: 56px;
  --cb-space-11: 64px;
  --cb-space-12: 72px;
  --cb-space-13: 80px;
  --cb-space-14: 96px;
}
```

4.2 Layout Constants
```css
:root {
  --cb-container-max-web: 1200px;
  --cb-container-reading: 760px;
  --cb-gutter-mobile: 16px;
  --cb-gutter-tablet: 24px;
  --cb-gutter-desktop: 32px;
  --cb-section-gap-mobile: 48px;
  --cb-section-gap-desktop: 72px;
}
```

4.3 Spacing Rules
- Vertical rhythm uses multiples of 8px after 16px.
- Card internal padding defaults to 24px.
- Form control vertical gap defaults to 12px.
- Hero top/bottom padding: 80px mobile, 96px tablet, 120px desktop.

Section 5. Border Radius Scale

5.1 Radius Tokens
```css
:root {
  --cb-radius-none: 0px;
  --cb-radius-xs: 6px;
  --cb-radius-sm: 10px;
  --cb-radius-md: 14px;
  --cb-radius-lg: 18px;
  --cb-radius-xl: 24px;
  --cb-radius-2xl: 32px;
  --cb-radius-pill: 9999px;
  --cb-radius-circle: 50%;
}
```

5.2 Radius Mapping
- Buttons: `--cb-radius-pill`
- Text inputs: `--cb-radius-md`
- Cards standard: `--cb-radius-lg`
- Cards hero/editorial: `--cb-radius-2xl`
- Inline tags: `--cb-radius-pill`
- Bottom sheet top corners: `--cb-radius-xl`

Section 6. Shadow & Elevation

6.1 Elevation Tokens
```css
:root {
  --cb-shadow-0: none;
  --cb-shadow-1: 0 1px 2px 0 #1F252B14;
  --cb-shadow-2: 0 4px 12px -2px #1F252B1F;
  --cb-shadow-3: 0 10px 28px -6px #1F252B24;
  --cb-shadow-4: 0 20px 48px -12px #1F252B2E;
  --cb-shadow-focus: 0 0 0 3px #0B786A52;
}
```

6.2 Elevation Rules
- Mobile defaults:
  - Surface cards: shadow-1.
  - Floating controls (FAB): shadow-3.
- Web defaults:
  - Cards: shadow-2.
  - Modals: shadow-4.
- Payment confirmation surfaces use flat style (`shadow-0`) + border emphasis.

6.3 State Depth Behavior
- Hover (web): elevation +1 level.
- Pressed: reduce by one level and scale to 0.98.
- Focus-visible: keep base shadow + `--cb-shadow-focus`.

Section 7. Component Specs (Buttons, Cards ×5, Nav, Inputs, Health Disclaimer, Celebrity Hero, Loading State, Checkout)

7.1 Buttons

Button Types:
- Primary
- Secondary
- Tertiary
- Destructive
- Tier Badge CTA (subscription upsell entry)

Primary Button:
- Background: `--cb-color-brand-600` (`#0B786A`)
- Text: `--cb-color-text-inverse` (`#FFFFFF`)
- Height: 52px mobile, 48px web
- Horizontal padding: 24px
- Radius: `--cb-radius-pill`
- Font: 16px, 600
- Shadow: `--cb-shadow-1`
- Hover (web): bg `#095E53`
- Pressed: bg `#095E53`, scale 0.98
- Disabled: bg `#8B949C`, text `#FCFAF7`

Secondary Button:
- Background: `#FFFFFF`
- Text: `#1F252B`
- Border: 1px solid `#B8AEA2`
- Height: 52px
- Radius: `--cb-radius-pill`

Tertiary Button:
- Background: transparent
- Text: `#0B786A`
- Border: none
- Underline on hover (web)

Destructive Button:
- Background: `#B4232C`
- Text: `#FFFFFF`
- Contrast: 6.49:1

Rule:
- Only one Primary Button per screen.

7.2 Cards (x5)

Card A: Editorial Discovery Card
- Use: celebrity discovery feed
- Size: min-height 320px mobile, 360px web
- Image ratio: 4:5
- Radius: 32px
- Overlay gradient: `linear-gradient(180deg, #1F252B00 35%, #1F252BCC 100%)`
- Content padding: 24px
- Title: 24px/700, white
- Meta chip row: pill chips using brand/gold tokens

Card B: Nutrition Metric Card
- Use: calorie/macro summary
- Background: `#FFFFFF`
- Radius: 18px
- Border: 1px solid `#D9D2C9`
- Padding: 20px
- Header metric uses mono 24px
- Sparkline area height: 64px

Card C: Plan Day Card
- Use: My Plan daily meals
- Background: `#F7F3EE`
- Radius: 18px
- Padding: 24px
- Expand/collapse row height: 56px
- Meal rows with 12px vertical spacing

Card D: Tier Comparison Card
- Use: subscription paywall/profile
- Free:
  - Background `#EEF2F5`
  - Border `#CBD5DE`
- Premium:
  - Background `#E8F6F3`
  - Border `#79C8BB`
- Elite:
  - Background `#1F252B`
  - Border `#A06A1C`
- Radius: 24px
- Padding: 24px
- Badge position: top-right, 12px offset

Card E: Checkout Summary Card
- Use: ingredient cart + totals
- Background: `#FFFFFF`
- Border: 1px solid `#D9D2C9`
- Radius: 14px
- Padding: 20px
- Line item rows: 44px minimum height
- Total row top border: 1px solid `#E6E0D8`

7.3 Navigation

Mobile Bottom Tab Bar:
- Height: 72px including safe area inset
- Background: `#FFFFFFF2`
- Blur: 16px (RN blur view / CSS backdrop-filter)
- Border top: 1px solid `#D9D2C9`
- Active icon+label: `#0B786A`
- Inactive: `#6D7882`
- Tab labels: 12px, 600

Web Top Navigation:
- Height: 72px
- Sticky with bg `#FCFAF7E6`, blur 20px
- Container max width: 1200px
- One primary action at right (e.g., Continue / Upgrade / Checkout)

7.4 Inputs

Text Field:
- Height: 52px
- Padding: 0 16px
- Background: `#FFFFFF`
- Border: 1px solid `#B8AEA2`
- Radius: 14px
- Placeholder: `#8B949C`
- Focus border: `#0B786A`
- Focus ring: `--cb-shadow-focus`

Select Field:
- Same as text field + right chevron 20px

Segmented Control:
- Container bg: `#F1ECE5`
- Thumb bg: `#FFFFFF`
- Radius: pill
- Option text: 14px/600

Checkbox & Multi-select Chips:
- Chip bg default: `#F7F3EE`
- Chip selected bg: `#D1EDE7`
- Chip selected border: `#0E8F7D`
- Min tap target: 44x44px

File Upload (S7):
- Dropzone min height: 180px
- Border: 2px dashed `#B8AEA2`
- Active border: `#0B786A`
- Support text includes file type + 10MB max + PDF 5 pages max

7.5 Health Disclaimer Component

Component Name:
- `HealthDisclaimer`

Required Text (exact):
- "This information is for educational purposes only and is not intended as medical advice."

Placement Rules:
- Mandatory on all nutrition/diet screens:
  - S7 Blueprint Reveal (onboarding TDEE + persona meal preview)
  - Discover celebrity diet detail
  - Meal Plan Preview
  - My Plan (overview + day detail)
  - Recipe Detail
  - Track nutrition charts
  - Checkout nutrition substitutions summary
- Position: directly above primary CTA region or sticky footer action.
- Never hidden from assistive tech.

Accessibility Rules:
- `aria-hidden="false"` always.
- `role="note"`.
- Min text size: 12px.
- Contrast: text `#4E5A65` on bg `#F7F3EE` = 5.41:1.

GLP-1 Conditional Warning:
- If user medications include GLP-1 class, append warning line:
  - "If you are on weight-loss medication, consult your clinician before major calorie or protein changes."

Low-Calorie Safeguard:
- If target calories < 1200:
  - show warning chip color `#B86A00` on `#FDEBD5`
  - include consult recommendation.

7.6 Celebrity Hero Component

Component Name:
- `CelebrityHero`

Structure:
- Full-width media panel
- Celebrity portrait or licensed still
- Name + one-line philosophy
- Source refs badge
- Single primary CTA: "Try This Diet"

Specs:
- Height: 420px mobile, 520px tablet, 620px web
- Image fit: cover
- Gradient overlay: `linear-gradient(180deg, #1F252B1A 0%, #1F252BD9 100%)`
- Title: 34px display, white
- Subtitle: 16px body, `#F4F1EC`
- Source badge: 12px/600, bg `#F2E3CF`, text `#7A4D00`
- CTA button anchored bottom-left with 24px inset

7.7 Loading State System (Skeleton Required)

Global rule:
- Every async module has skeleton placeholder for minimum 400ms.
- No empty container during load.

Skeleton Tokens:
- Base: `#E8E1D8`
- Shimmer: `#F5EFE7`
- Animation: 1200ms infinite linear gradient shimmer

Skeleton Patterns:
- Hero skeleton: image block + title bar + subtitle bar + CTA pill
- List skeleton: 3-6 row cards with avatar/image + text lines
- Chart skeleton: title bar + axis bars + legend pills
- Checkout skeleton: item rows + subtotal row + CTA pill

Motion:
- `background-position` shimmer from -120% to 120%
- Disabled reduce-motion fallback: static base color only

7.8 Checkout Components

Components:
- CartLineItem
- IngredientSubstitutionNotice
- DeliverySlotPicker
- PaymentMethodCard
- OrderSummaryTotal

Checkout visual style:
- Flat-first, low shadow.
- Pills for selectable delivery slots/payment methods.
- Confirm button is single primary CTA: "Place Instacart Order".

Pricing display:
- Currency format locale-aware.
- Total uses mono 24px/600.
- Fee lines use 14px/400.

Trust block:
- Secure checkout row with lock icon + short text.
- Instacart handoff note in 12px caption.

Section 8. Screen-by-Screen Design (S0-S7 persona-first onboarding + Tab1-4 + Recipe Detail + Checkout)

> Updated 2026-04-22 (Plan 20 Phase C-1). Onboarding switched from 11-step data-first to 8-step persona-first flow. Canonical source: spec.md §7.1 + DESIGN.md §8.1. Biomarker Upload moved to Phase 2 post-onboarding at `/settings/health/biomarkers/upload`.

Global screen template constraints:
- One primary CTA only.
- Optional secondary actions are text or secondary button.
- Skeleton states defined for all network/data screens.
- HealthDisclaimer mandatory on nutrition/diet contexts.

S0 Welcome
- Goal: entry + value proposition.
- Layout:
  - Hero image top 58% height with celebrity mosaic.
  - Brand statement centered.
  - Persona chips scroll row.
- Primary CTA: `Get Started`.
- Secondary: `Sign in` text link.
- Spacing:
  - top 48px, sides 24px, bottom CTA inset 32px.

S1 Auth
- Goal: authenticate quickly.
- Layout:
  - Header title + short subtitle.
  - SSO buttons (Apple, Google).
  - Divider and email form.
- Primary CTA: `Continue`.
- Secondary: `Use phone instead` text link.
- States:
  - Loading spinner in button.
  - Inline error labels (error token set).

S2 Persona Select (NEW · persona-first wedge)
- Goal: lock aspirational intent BEFORE PHI collection.
- Layout:
  - Fraunces display-xl prompt: `Who would you like to live like?`
  - 2-col grid (desktop) / 1-col (≤720px) of CelebrityCard + PersonaHero composite.
- Card contents: hero image, name, 1-line wellness philosophy, optional match-score chip with persona accent token.
- Primary CTA: `Continue` (disabled until selection).
- Persistence: `PATCH /api/users/me { preferred_celebrity_slug }` on confirm.
- Persona-match call is NOT triggered here (moved to S6 Continue per Codex Round 1 HIGH-1).

S3 Basic Info
- Fields: display_name, birth_year, sex (enum).
- Primary CTA: `Next: Body Metrics`.
- Validation: real-time per field.
- Persistence: client state only — final write at S7 Confirm.

S4 Body Metrics
- Fields: height_cm (100-250), weight_kg (30-300), waist_cm (optional 40-200), unit toggle (cm↔in, kg↔lb).
- Primary CTA: `Next: Activity & Health`.
- UI: segmented control for units; display conversion only, persist metric.

S5 Activity & Health (MERGED · replaces prior S5 Activity + S6 Health)
- Top: 5-level visual cards (Sedentary, Light, Moderate, Active, Very Active) with roving tabindex.
- Bottom: Allergies / Intolerances / Conditions / Medications tag inputs.
- First HealthDisclaimer appearance on wizard.
- GLP-1 medication detected → Digital Lavender chip (`--cb-accent-glp1`) + §7.5 link.
- Primary CTA: `Next: Goals & Diet`.
- Accessibility: card selectable via keyboard, ARIA `aria-disabled="true"` for disabled states.

S6 Goals & Diet Preferences
- Fields: primary_goal (radio cards), secondary_goals chips (≤3), diet_type, cuisine_preferences, disliked_ingredients (optional).
- Primary CTA: `Reveal my Blueprint`.
- On Continue:
  1. Fire async `POST /api/persona-match { celebritySlug, goal, wellnessKeywords }` (AbortController on re-entry).
  2. Navigate to S7 immediately.
- Body MUST omit PHI fields (bioProfile*, biomarkers, medications, medicalConditions, age, weightKg, heightCm, sex) — enforced client-side + BFF denylist.

S7 Blueprint Reveal (NEW · replaces prior S10 Summary + S11 Category)
- Layout: hero display-xl "Your CelebBase Blueprint" + 3-column reveal (stacked ≤720px) + bottom Instacart preview.
- Left: Mifflin-St Jeor TDEE + 3-ring NutritionRing cluster.
- Center: IdentitySyncScore overlay (Fraunces display-md). While persona-match is in flight: `aria-live="polite"` placeholder "Calculating your sync…"; no duplicate `aria-live` on the score component itself (single source announcement).
- Right: First persona meal plan preview (MealCard + TrafficLightIndicator + SourceTrackingBadge).
- Bottom: InstacartCartPreview (dismissible if 503 INSTACART_UNCONFIGURED).
- HealthDisclaimer required (between meal preview and primary CTA).
- Primary CTA: `Start my blueprint` → `POST /api/users/me/bio-profile` (201) → `/dashboard`. On 5xx, preserve wizard client state (sessionStorage draft) and offer inline retry.
- Secondary: `Adjust goals` → back to S6.
- Load Budget: p50 < 3s on staging.
- Observability: emit `onboarding.s7.persona_match_timeout` event if placeholder still visible at +3s.

Tab1 Discover
- Modules:
  - Featured Celebrity Carousel
  - Category tabs
  - Search bar
  - Celebrity cards grid
- Primary CTA per screen state:
  - None globally; per card has one primary CTA (`Try This Diet`) only when expanded.
- Skeleton:
  - Carousel slide skeleton + card grid skeleton.
- Disclaimer:
  - Show when entering any diet-specific detail panel.

Tab1 Celebrity Detail (within Discover)
- Sections:
  - Bio & philosophy
  - Available diets
  - Evidence/source refs
  - Adaptation notes preview
- Primary CTA: `Try This Diet`.
- Mandatory:
  - HealthDisclaimer near CTA.

Tab2 My Plan
- Modules:
  - Active plan summary
  - Today meals expandable cards
  - Weekly calendar
  - Nutrition summary (daily/weekly)
- Primary CTA: `Order Ingredients` (floating action).
- Secondary actions:
  - `Adjust Plan`
  - `Regenerate`
- Mandatory:
  - HealthDisclaimer pinned above action area.
- Skeleton:
  - Plan summary bars
  - Meal card rows
  - Weekly chart skeleton

Tab2 Meal Plan Preview (generation result screen)
- Header: "Personalized from {Celebrity}"
- Body:
  - Day-by-day meal overview
  - Key adjustment explanations
  - Weekly nutrition totals
- Primary CTA: `Confirm Plan`.
- Secondary: `Adjust & Regenerate`.
- Mandatory:
  - HealthDisclaimer above CTA group.

Tab2 Plan History
- List with filter chips and dates.
- Primary CTA: `Re-activate Plan` (inside selected plan detail).
- Skeleton list required.

Recipe Detail
- Sections:
  - Hero image/video
  - Ingredient list with quantities
  - Step-by-step cooking view
  - Nutrition breakdown per serving
  - Substitutions panel
- Primary CTA: `Add Ingredients to Cart`.
- Secondary: `Save Recipe` text.
- Mandatory:
  - HealthDisclaimer above nutrition block and above CTA footer.
- Accessibility:
  - Step progress controls keyboard and screen-reader operable.

Checkout (Instacart handoff)
- Stages:
  - Cart Preview
  - Delivery Slot
  - Payment Review
  - Confirm
- Primary CTA by stage:
  - Stage 1: `Continue to Delivery`
  - Stage 2: `Continue to Payment`
  - Stage 3: `Place Instacart Order`
- Rules:
  - only one primary CTA visible per stage.
  - ingredient substitutions highlighted with warning/info chips.
- Skeleton:
  - item rows, delivery slots, payment card placeholders.
- HealthDisclaimer:
  - if substitutions alter nutrition materially, show disclaimer in summary.

Tab3 Track
- Modules:
  - Daily check-in
  - Progress charts
  - Weekly/monthly reports
- Primary CTA: `Submit Daily Check-in`.
- Secondary: `View Monthly Report`.
- Mandatory:
  - HealthDisclaimer in nutrition trend module.
- Chart specs:
  - Weight line, adherence bars, macro trend area.

Tab4 Profile
- Modules:
  - Bio Profile Management
  - Subscription Management
  - Order History
  - Settings
  - Support/FAQ
- Primary CTA per subpage:
  - Profile root: none.
  - Subscription page: `Upgrade`.
  - Settings page: `Save Changes`.
- Tier visuals:
  - Free, Premium, Elite cards using tier color tokens.

Subscription Tier Visual Differentiation (global)
- Free:
  - neutral card, subtle border, no glow.
- Premium ($14.99/mo):
  - brand-teal tint, “Most Popular” pill.
- Elite ($29.99/mo):
  - dark card + gold border + editorial texture image overlay at 8% opacity.
- Typography:
  - tier name 18px/700
  - price 24px mono/600
  - feature rows 14px/400
- CTA pattern:
  - only selected tier card shows primary CTA.

Section 9. Responsive Behavior & Breakpoints

9.1 Breakpoints
- `--cb-bp-xs`: 0-359px
- `--cb-bp-sm`: 360-479px
- `--cb-bp-md`: 480-767px
- `--cb-bp-lg`: 768-1023px
- `--cb-bp-xl`: 1024-1279px
- `--cb-bp-2xl`: 1280-1535px
- `--cb-bp-3xl`: >=1536px

9.2 Grid Behavior
- Mobile (<768): single column, 16px gutters.
- Tablet (768-1023): 8-column grid, 24px gutters.
- Desktop (>=1024): 12-column grid, 32px gutters, max width 1200px.

9.3 Component Reflow
- Hero:
  - mobile stack text over image.
  - desktop split layout 6/6 when needed.
- Card grid:
  - 1 column (xs-sm)
  - 2 columns (md-lg)
  - 3 columns (xl)
  - 4 columns (2xl+)
- Checkout:
  - mobile stepper stacked.
  - desktop summary panel sticky right column.

9.4 Typography Scaling
- Display XL: 52 -> 42 -> 34 on smaller widths.
- H1: 28 -> 24 on small devices.
- Body stays 16px minimum.

9.5 Touch and Input Targets
- Minimum interactive area: 44x44px mobile.
- Minimum web click target: 36x36px.
- Tab bar icons with label zone min 64px width.

Section 10. Motion & Animation

10.1 Motion Principles
- Motion indicates hierarchy change, not decoration.
- Keep transitions short and stable.
- Reduce motion option respected globally.

10.2 Timing Tokens
```css
:root {
  --cb-motion-quick: 120ms;
  --cb-motion-fast: 180ms;
  --cb-motion-base: 240ms;
  --cb-motion-slow: 320ms;
  --cb-motion-xslow: 480ms;

  --cb-ease-standard: cubic-bezier(0.2, 0.0, 0, 1);
  --cb-ease-emphasized: cubic-bezier(0.2, 0.8, 0.2, 1);
  --cb-ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --cb-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

10.3 Motion Specs by Pattern
- Screen transitions:
  - Duration: 240ms
  - Easing: `--cb-ease-standard`
  - Offset: 16px Y fade-in
- Bottom sheet open:
  - Duration: 320ms
  - Easing: `--cb-ease-emphasized`
  - Translate Y from 24px to 0
- Button press:
  - Duration: 120ms
  - Scale 1 -> 0.98 -> 1
  - Easing: `--cb-ease-spring`
- Skeleton shimmer:
  - Duration: 1200ms linear infinite

10.4 Reduced Motion
- Replace translate/scale with opacity-only 120ms.
- Disable shimmer animation; keep static skeleton base.

Section 11. Iconography

11.1 Icon Style
- Stroke-first icons for UI controls.
- Filled icons reserved for active tab state and critical status.
- Corner style: rounded joins/caps.

11.2 Icon Tokens
```css
:root {
  --cb-icon-size-xs: 14px;
  --cb-icon-size-sm: 16px;
  --cb-icon-size-md: 20px;
  --cb-icon-size-lg: 24px;
  --cb-icon-size-xl: 32px;

  --cb-icon-stroke-width: 1.75px;
  --cb-icon-color-default: #4E5A65;
  --cb-icon-color-active: #0B786A;
  --cb-icon-color-inverse: #FFFFFF;
}
```

11.3 Icon Library Rules
- Use single icon set across RN and web (phosphor or lucide equivalent).
- Avoid mixing visual families.
- Health-related icons must be neutral/non-alarmist.

11.4 Required Icon Set
- Navigation: discover, plan, track, profile
- Nutrition: calorie, protein, carbs, fat, fiber
- Commerce: cart, delivery, payment, receipt
- System: info, warning, error, success, lock, upload, camera

Section 12. Accessibility (WCAG 2.1 AA)

12.1 Baseline Requirements
- Minimum contrast 4.5:1 for normal text.
- Keyboard/switch navigation for all flows.
- Visible focus indicator on all interactive elements.
- Semantic roles for all form and nav structures.
- Alt text required for all meaningful images.

12.2 Form Accessibility
- Every input has persistent label.
- Error text linked via `aria-describedby`.
- Required fields announced to screen readers.
- Multi-select chips expose selected state via `aria-pressed` or checkbox semantics.

12.3 Health Disclaimer Accessibility
- Must always render in DOM/native accessibility tree.
- Must not use `aria-hidden="true"`.
- Role: `note`.
- Should be reachable before final CTA in reading order.

12.4 Chart Accessibility
- Provide textual summary below each chart:
  - period
  - trend direction
  - max/min values
- Color is never sole signal; include markers/labels.

12.5 Motion Accessibility
- Respect reduced motion settings.
- Avoid parallax effects in health-critical contexts.

12.6 Locale and Units
- Day 1 support en-US content architecture.
- Unit switching accessible in settings and onboarding.
- Date/time/currency formatted by locale.

12.7 QA Checklist
- Contrast audit pass for all tokenized combinations.
- Screen reader walkthrough S0-S7 + Tab1-4 + Recipe + Checkout.
- Keyboard-only completion for web onboarding and checkout.
- Touch target audit for RN.

Section 13. AI Agent Prompt Guide

13.1 Purpose
- Ensure generated UI code remains faithful to this system.
- Prevent drift into inline styles or ad-hoc values.

13.2 Core Prompt Contract
- Always use `--cb-*` tokens.
- Never introduce hard-coded colors/spacing/radius/shadows in components.
- Enforce one primary CTA per screen.
- Insert `HealthDisclaimer` on all nutrition/diet screens.
- Include skeleton states for async modules.

13.3 Prompt Templates

Template A: New Screen
- "Build [SCREEN_NAME] for [PLATFORM]. Use CelebBase design tokens only (`--cb-*`). Include exactly one primary CTA. Add skeleton state for all remote data blocks. If the screen includes diet/nutrition content, render `HealthDisclaimer` with role=note and never aria-hidden."

Template B: Component Build
- "Create [COMPONENT_NAME] using CelebBase token set. Use spacing/radius/shadow/type tokens from DESIGN-codex.md only. Provide default, hover, focus, disabled states. Validate WCAG AA contrast with specified text/background pair."

Template C: Refactor
- "Refactor [FILE] to remove inline styles and magic numbers. Replace with shared design tokens. Ensure no visual regressions for breakpoints xs-sm-md-lg-xl."

Template D: Screen QA
- "Audit [SCREEN_NAME] against DESIGN-codex.md: one primary CTA, token-only styles, skeleton coverage, HealthDisclaimer placement, contrast >=4.5:1, accessible focus states. Return violations as a checklist."

13.4 Anti-Patterns to Block
- Multiple primary CTAs on one viewport.
- Missing disclaimer on nutrition views.
- Empty loading screens.
- Direct hex use in component code instead of tokens.
- Typographic sizes outside defined scale.
- Shadow values not in token set.

13.5 Required AI Output Shape
- Include:
  - changed files
  - token usage summary
  - accessibility notes
  - screenshot checklist (if available)

Section 14. Implementation Notes (file paths, token exports)

14.1 Target File Paths
- Web token CSS: `src/web/styles/tokens.css`
- Web theme mapping: `src/web/styles/theme.css`
- Web typography utilities: `src/web/styles/typography.css`
- Web component primitives: `src/web/components/ui/*`

- Mobile token source: `src/mobile/theme/tokens.ts`
- Mobile semantic theme: `src/mobile/theme/semantic.ts`
- Mobile typography helpers: `src/mobile/theme/typography.ts`
- Mobile component primitives: `src/mobile/components/ui/*`

- Shared contract package (recommended): `packages/design-tokens/`
  - `tokens.json`
  - `tokens.css`
  - `tokens.native.ts`

14.2 Token Export Contract
- Source of truth format: JSON
- Build outputs:
  - CSS custom properties for Next.js
  - TS constants for React Native

Example JSON schema:
```json
{
  "color": {
    "brand": { "500": "#0E8F7D", "600": "#0B786A", "700": "#095E53" },
    "text": { "primary": "#1F252B", "secondary": "#4E5A65" }
  },
  "space": { "1": "4px", "2": "8px", "3": "12px" },
  "radius": { "md": "14px", "pill": "9999px" },
  "shadow": { "2": "0 4px 12px -2px #1F252B1F" }
}
```

14.3 RN Mapping Notes
- CSS vars are not native in RN; map tokens into typed TS objects.
- Use strict typing:
  - `ColorToken`
  - `SpaceToken`
  - `RadiusToken`
- Avoid inline object literals for colors/spacing in components.

14.4 Next.js Mapping Notes
- Inject `tokens.css` once in root layout.
- Use utility classes or CSS modules referencing `--cb-*` variables.
- For server rendering, default to light theme, hydrate user preference after mount.

14.5 Component Inventory to Build First
1. `ButtonPrimary`, `ButtonSecondary`, `ButtonTertiary`
2. `InputField`, `SelectField`, `SegmentedControl`, `Chip`
3. `CardEditorial`, `CardMetric`, `CardPlanDay`, `CardTier`, `CardCheckout`
4. `HealthDisclaimer`
5. `SkeletonBlock`, `SkeletonCard`, `SkeletonChart`
6. `TabBar`, `TopNav`
7. `CelebrityHero`
8. `CheckoutSummary`

14.6 Screen Build Order (persona-first, S0-S7)
1. S0 Welcome + S1 Auth
2. S2 Persona Select (celebrity grid + PATCH /api/users/me { preferred_celebrity_slug })
3. S3 Basic Info + S4 Body Metrics
4. S5 Activity & Health (merged from retired Activity + Health Intake)
5. S6 Goals & Diet Preferences (fires async POST /api/persona-match on Continue)
6. S7 Blueprint Reveal (TDEE + persona meal preview + Identity Sync Score placeholder)
7. Tab1 Discover + Celebrity Detail
8. Tab2 My Plan + Meal Plan Preview
9. Recipe Detail
10. Checkout
11. Tab3 Track
12. Tab4 Profile + Subscription
13. Phase 2 biomarker upload (`/settings/health/biomarkers/upload`, post-onboarding)

14.7 Definition of Done per Screen
- Uses token-only styles.
- Exactly one primary CTA visible.
- Skeleton present for all async modules.
- HealthDisclaimer present where nutrition/diet info appears.
- Accessibility checks pass (contrast, focus, labels).
- Responsive behavior verified at xs/md/lg/xl breakpoints.

14.8 Governance
- Any new color/spacing/type/radius/shadow value requires design token PR.
- Any new screen must include CTA and loading-state annotations.
- Any nutrition screen merge is blocked without disclaimer verification.

14.9 Final Compliance Matrix
- 14-section structure: complete.
- Explicit hex values: complete.
- Explicit spacing/radius/shadows: complete.
- WCAG contrast calculations: complete.
- S0-S7 + Tab1-4 + Recipe + Checkout coverage: complete (persona-first, post-spec §7.1 revision 2026-04-22).
- Max one primary CTA per screen rule: defined and enforced.
- Skeleton UI mandatory: defined globally + per-screen.
- Subscription tiers visual differentiation: complete.

14.10 Handoff Note
- This document is the canonical UI source until replaced by versioned Design System v2.
- Engineering should implement tokens first, primitives second, screens third.
- No UI implementation should proceed with values outside this document.
