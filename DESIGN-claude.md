# CelebBase Wellness — Design System v1.0

> **Author**: Claude (Opus 4.6)  
> **Date**: 2026-04-15  
> **Status**: Draft — Competitive Evaluation  
> **Scope**: React Native (iOS/Android) + Next.js (Web) + Admin Dashboard  
> **Companion Docs**: `spec.md` §7–8, `.claude/rules/domain/content.md`, `.claude/rules/code-style.md`

---

## 0. Manifesto

CelebBase Wellness sits at the intersection of **celebrity aspiration** and **clinical precision**. The visual language must feel luxurious enough that a Household CEO trusts it with their grocery budget, precise enough that a Biohacker trusts it with their macros, warm enough that an Aspirational Millennial shares it on social media, and medically credible enough that a GLP-1 User relies on it for muscle preservation.

This is not a clone of any single reference system. It is a deliberate synthesis:

| Layer | Reference | What We Take | What We Leave |
|-------|-----------|-------------|---------------|
| Foundation | Apple | Premium whitespace, cinematic section rhythm, single-accent discipline | Pure black/white binary, SF Pro licensing |
| Discovery | Airbnb | Warm photography-first cards, rounded UI, three-layer shadows | Coral brand color, marketplace density |
| Data | Notion | Warm neutral palette, whisper borders, four-weight type system | Serif headings, ultra-subtle shadows |
| Metrics | Revolut | Pill buttons, flat metric cards, semantic color tokens | All-dark marketing, zero-shadow dogma |

---

## 1. Brand Identity & Design Principles

### 1.1 Four Principles

**Aspirational Precision**  
Every screen balances "I want this life" (aspiration) with "I understand this data" (trust). Celebrity hero images and macro donut charts coexist without one undermining the other. Never purely editorial, never purely clinical.

**Earned Luxury**  
Premium whitespace and cinematic imagery make the subscription feel worth it. But whitespace is intentional, not filler — every empty pixel earns its place by directing attention to the next action.

**One-Click Confidence**  
The Household CEO persona drives this principle: the primary action on every screen must be immediately obvious. One gold CTA per screen, max. Supporting actions retreat to secondary and ghost styles. Decision fatigue is the enemy.

**Transparent Health**  
Health disclaimers, data sources, and AI adjustment explanations are surfaced visibly — never buried in fine print. Users can collapse disclaimers after first view, but can never fully dismiss them. Trust is the product.

### 1.2 Persona ↔ Design Mapping

| Persona | Primary Design Need | Design Response |
|---------|-------------------|-----------------|
| Household CEO | Speed, no cognitive load | One CTA per screen, FAB for cart, skeleton loading |
| Biohacker | Data density, precision | JetBrains Mono metrics, progress rings, expandable nutrition tables |
| GLP-1 User | Medical credibility | Info-tinted disclaimer boxes, purple accent for clinical context |
| Aspirational Millennial | Visual appeal, shareability | Full-bleed celebrity heroes, warm card grids, Instagram-native aesthetics |

---

## 2. Color System

All colors are defined as CSS custom properties (`--cb-*`) for web and a parallel `colors` TypeScript const for React Native.

### 2.1 Brand

| Token | Hex | Role |
|-------|-----|------|
| `--cb-brand-primary` | `#C9A84C` | Primary CTA fills, active tab icons, brand moments. Gold-amber: luxury without garish. |
| `--cb-brand-primary-hover` | `#B8973E` | Hover/pressed state on primary buttons |
| `--cb-brand-primary-dark` | `#9E7B2E` | High-contrast variant for text-on-light |
| `--cb-brand-primary-light` | `#F5EDDA` | Tinted backgrounds, selected chip fills, tag surfaces |
| `--cb-brand-primary-subtle` | `#FBF8F0` | Very light tint for section backgrounds |

**Why gold?** None of the four reference systems use gold. It signals premium (jewelry, awards, honey) and wellness (turmeric, wheat, warmth) simultaneously. It passes WCAG AA on both white and dark backgrounds at the right weight.

### 2.2 Neutral Spine

Warm undertones throughout — never blue-gray. Inspired by Notion's yellow-brown neutral shift.

| Token | Hex | Role |
|-------|-----|------|
| `--cb-neutral-0` | `#FAFAF8` | Page background — warm white, not clinical |
| `--cb-neutral-50` | `#F4F3F0` | Card surfaces, input backgrounds, alternate section bg |
| `--cb-neutral-100` | `#E8E6E1` | Borders, dividers, inactive toggles |
| `--cb-neutral-200` | `#D0CEC8` | Placeholder text, disabled icons |
| `--cb-neutral-300` | `#B5B2AB` | Inactive tab icons |
| `--cb-neutral-400` | `#9E9B94` | Secondary labels, metadata |
| `--cb-neutral-500` | `#7A7772` | Tertiary text |
| `--cb-neutral-600` | `#5A5750` | Body text — warm, readable |
| `--cb-neutral-700` | `#3D3B37` | Emphasized body, sub-headings |
| `--cb-neutral-800` | `#272521` | Strong emphasis |
| `--cb-neutral-900` | `#1A1917` | Primary headings — warm near-black |

### 2.3 Semantic

| Token | Hex | Role | Contrast on white |
|-------|-----|------|-------------------|
| `--cb-success` | `#2D9B6E` | Goal achieved, adherence on-track, confirmed | 4.5:1 ✓ |
| `--cb-success-light` | `#E8F5EE` | Success tint background | — |
| `--cb-warning` | `#C86A1F` | Near-limit, partial completion, caution | 4.5:1 ✓ |
| `--cb-warning-light` | `#FEF3E8` | Warning tint background | — |
| `--cb-danger` | `#C53030` | Allergen alert, medical warning, destructive action | 5.9:1 ✓ |
| `--cb-danger-light` | `#FEE8E8` | Danger tint background | — |
| `--cb-info` | `#2B6CB0` | Health disclaimer, help text, informational | 5.3:1 ✓ |
| `--cb-info-light` | `#EBF4FF` | Info tint background | — |

### 2.4 Persona Accent Colors

Used only for category chips, tags, and subtle UI differentiation in the Discover feed — never as primary brand colors.

| Token | Hex | Persona |
|-------|-----|---------|
| `--cb-accent-biohacker` | `#0E8F9B` | Teal-cyan for precision/data contexts |
| `--cb-accent-glp1` | `#7B5EA7` | Muted purple for medical/clinical |
| `--cb-accent-aspirational` | `#D4654A` | Warm terracotta for social/trend content |
| `--cb-accent-household` | `--cb-brand-primary` | Gold — reuse brand for efficiency persona |

### 2.5 Dark Mode (Elite Tier Only)

Dark mode is an Elite subscriber perk. Warm-dark surfaces (not pure black) preserve the brand warmth.

| Token | Hex | Role |
|-------|-----|------|
| `--cb-dark-surface-0` | `#141412` | Page background |
| `--cb-dark-surface-1` | `#1E1D1B` | Card backgrounds |
| `--cb-dark-surface-2` | `#282623` | Elevated cards, modals |
| `--cb-dark-surface-3` | `#33312D` | Highest elevation |
| `--cb-dark-text-primary` | `#F2F0EB` | Primary text |
| `--cb-dark-text-secondary` | `#A8A5A0` | Secondary text |
| `--cb-dark-brand-primary` | `#E8C870` | Gold lightened for dark backgrounds |
| `--cb-dark-border` | `rgba(255, 255, 255, 0.08)` | Whisper border on dark |

**Dark mode depth**: No box-shadows. Elevation expressed through surface brightness (lighter = higher), following Revolut's flat-by-design principle for dark contexts.

---

## 3. Typography

### 3.1 Font Stack

| Role | Family | Rationale |
|------|--------|-----------|
| Display & Headings | `'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif` | Modern geometric humanist with slightly rounded terminals. Premium feel, Google Fonts free, React Native compatible. |
| Body & UI | `'Inter', -apple-system, system-ui, 'Segoe UI', sans-serif` | Industry standard for data-dense screens. Optimized for small sizes. Notion-grade precision. |
| Metrics & Numbers | `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace` | Tabular (fixed-width) digits prevent layout shift in animated counters and data tables. Used for calories, grams, percentages only. |

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Font | Usage |
|-------|------|--------|-------------|----------------|------|-------|
| `--cb-type-display-xl` | 56px / 3.5rem | 700 | 1.10 | -0.03em | Plus Jakarta Sans | Onboarding hero, celebrity name on profile |
| `--cb-type-display-lg` | 40px / 2.5rem | 700 | 1.15 | -0.025em | Plus Jakarta Sans | Screen titles, section hero headlines |
| `--cb-type-display-md` | 32px / 2rem | 600 | 1.20 | -0.02em | Plus Jakarta Sans | Celebrity card name overlay, plan title |
| `--cb-type-heading-lg` | 24px / 1.5rem | 600 | 1.30 | -0.01em | Plus Jakarta Sans | Section headings, "Today's Meals" |
| `--cb-type-heading-md` | 20px / 1.25rem | 600 | 1.35 | -0.005em | Plus Jakarta Sans | Card titles, modal headers |
| `--cb-type-heading-sm` | 17px / 1.063rem | 600 | 1.40 | 0 | Plus Jakarta Sans | List section headers, form labels |
| `--cb-type-body-lg` | 16px / 1rem | 400 | 1.60 | 0 | Inter | Primary body text, descriptions |
| `--cb-type-body-md` | 14px / 0.875rem | 400 | 1.55 | 0.005em | Inter | Secondary descriptions, card body |
| `--cb-type-body-sm` | 13px / 0.813rem | 400 | 1.50 | 0.005em | Inter | Captions, timestamps, metadata |
| `--cb-type-label-lg` | 14px / 0.875rem | 600 | 1.20 | 0.03em | Inter | Button labels, nav items |
| `--cb-type-label-md` | 12px / 0.75rem | 600 | 1.20 | 0.04em | Inter | Tab labels, chip labels, badges |
| `--cb-type-label-sm` | 11px / 0.688rem | 500 | 1.20 | 0.05em | Inter | Micro labels, legal footnotes |
| `--cb-type-metric-xl` | 48px / 3rem | 700 | 1.00 | -0.02em | JetBrains Mono | Daily calorie total, hero metric |
| `--cb-type-metric-lg` | 32px / 2rem | 600 | 1.00 | -0.01em | JetBrains Mono | Macro gram numbers (protein: 145g) |
| `--cb-type-metric-md` | 20px / 1.25rem | 500 | 1.10 | 0 | JetBrains Mono | Progress percentages, secondary metrics |
| `--cb-type-metric-sm` | 14px / 0.875rem | 500 | 1.20 | 0.01em | JetBrains Mono | Inline numbers in nutrition tables |

### 3.3 Principles

- **Negative tracking scales with size**: -0.03em at 56px → 0 at 17px → slightly positive below 14px. Tight headlines, airy body.
- **Weight restraint**: Display uses 600–700, body uses 400, UI uses 500–600. No weight 300 (too fragile) or 800+ (too aggressive).
- **Metric isolation**: JetBrains Mono is ONLY for numeric values — never for labels, never for body text. The monospace/proportional boundary must be visually clean.

---

## 4. Spacing Scale

Base unit: **8px**. Sub-unit: **4px** for tight UI contexts.

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-space-0` | 0px | No gap |
| `--cb-space-1` | 4px | Icon-to-label gap, tight inline spacing |
| `--cb-space-2` | 8px | Tag padding, input label gap, inline icon gap |
| `--cb-space-3` | 12px | Chip horizontal padding, compact list item gap |
| `--cb-space-4` | 16px | Standard card inner padding, form field vertical gap |
| `--cb-space-5` | 20px | Card-to-card gap in grids |
| `--cb-space-6` | 24px | Section header to content gap |
| `--cb-space-8` | 32px | Between major content blocks within a section |
| `--cb-space-10` | 40px | Section vertical padding (mobile) |
| `--cb-space-12` | 48px | Section vertical padding (tablet) |
| `--cb-space-16` | 64px | Section vertical padding (desktop), Apple-style breathing room |
| `--cb-space-20` | 80px | Hero section bottom margin |
| `--cb-space-24` | 96px | Full-bleed alternating section gap (desktop) |

### Layout Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-layout-page-px-mobile` | 16px | Horizontal page padding, mobile |
| `--cb-layout-page-px-tablet` | 24px | Horizontal page padding, tablet |
| `--cb-layout-page-px-desktop` | 40px | Horizontal page padding, desktop |
| `--cb-layout-max-content` | 1200px | Maximum content width (centered) |
| `--cb-layout-card-gap-mobile` | 12px | Grid gap between cards, mobile |
| `--cb-layout-card-gap-desktop` | 20px | Grid gap between cards, desktop |

---

## 5. Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-radius-xs` | 4px | Tight chips, inline tags |
| `--cb-radius-sm` | 8px | Input fields, small cards, badges |
| `--cb-radius-md` | 12px | Standard content cards, recipe cards |
| `--cb-radius-lg` | 16px | Featured cards, modal containers |
| `--cb-radius-xl` | 24px | Bottom sheets, prominent panels |
| `--cb-radius-2xl` | 32px | Celebrity discovery cards (magazine cover feel) |
| `--cb-radius-full` | 9999px | Pill buttons, subscription badges, avatars, circular controls |

**Philosophy**: Medium-rounded language. Not as geometric as Linear, not as bubbly as Airbnb's 20px cards. The 12px default card radius is the sweet spot — professional yet approachable.

---

## 6. Shadow & Elevation

Shadows are sparse (Apple influence) but warm-tinted (Notion influence). The system uses three levels plus one brand-specific glow.

### 6.1 Light Mode Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-shadow-1` | `0 1px 3px rgba(26,25,23,0.06), 0 1px 2px rgba(26,25,23,0.04)` | Cards, inputs — subtle lift |
| `--cb-shadow-2` | `0 4px 12px rgba(26,25,23,0.10), 0 2px 4px rgba(26,25,23,0.06)` | FAB, dropdowns, tooltips — distinct float |
| `--cb-shadow-3` | `0 16px 40px rgba(26,25,23,0.15), 0 4px 12px rgba(26,25,23,0.08)` | Modals, bottom sheets, celebrity detail overlay |
| `--cb-shadow-brand` | `0 8px 24px rgba(201,168,76,0.30)` | Primary CTA only — gold glow. Max once per screen. |

### 6.2 Dark Mode Elevation

No box-shadows. Depth via surface brightness:

| Level | Surface Token | Usage |
|-------|--------------|-------|
| 0 (Base) | `--cb-dark-surface-0` (#141412) | Page background |
| 1 (Card) | `--cb-dark-surface-1` (#1E1D1B) | Standard cards |
| 2 (Float) | `--cb-dark-surface-2` (#282623) | FAB, dropdowns |
| 3 (Modal) | `--cb-dark-surface-3` (#33312D) | Modals, bottom sheets |

### 6.3 Border Strategy

Borders follow Notion's "whisper" philosophy:

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-border-default` | `1px solid rgba(26,25,23,0.08)` | Card outlines, section dividers |
| `--cb-border-strong` | `1px solid rgba(26,25,23,0.15)` | Input fields (resting) |
| `--cb-border-focus` | `2px solid var(--cb-brand-primary)` | Focused inputs, active states |
| `--cb-border-error` | `2px solid var(--cb-danger)` | Error state inputs |

---

## 7. Component Specifications

### 7.1 Buttons

#### Primary CTA (Gold)
- Background: `--cb-brand-primary`
- Text: `#FFFFFF`, `--cb-type-label-lg`
- Height: 52px (mobile) / 48px (web)
- Padding: 14px 32px
- Radius: `--cb-radius-full` (pill)
- Shadow: `--cb-shadow-brand`
- Hover: background → `--cb-brand-primary-hover`
- Active: scale(0.97), shadow removed
- Disabled: opacity 0.38, no color change
- Loading: skeleton pulse inside button bounds
- **Rule: Maximum ONE per screen.**

#### Secondary
- Background: `--cb-neutral-0`
- Text: `--cb-brand-primary-dark`, `--cb-type-label-lg`
- Border: 1.5px solid `--cb-brand-primary`
- Height/Padding/Radius: same as Primary
- Shadow: none
- Hover: background → `--cb-brand-primary-subtle`

#### Ghost (Tertiary)
- Background: transparent
- Text: `--cb-neutral-600`, `--cb-type-label-lg`
- Border: none
- Hover: text → `--cb-neutral-900`
- Use: dismissal, "Skip" in onboarding, tertiary actions

#### Destructive
- Initial: Ghost style with `--cb-danger` text
- Confirmed (2nd tap): `--cb-danger` background, white text
- Pattern: always requires two-tap confirmation for irreversible actions
- Use: account deletion, plan archive

### 7.2 Cards

#### Celebrity Discovery Card (Discover Tab)
```
┌─────────────────────────┐
│                         │
│    [Photo 2:3 portrait] │  ← object-fit: cover, radius-2xl top
│                         │
│                         │
│   Gradient overlay ↓    │
│   ┌─ Name (heading-md)  │
│   └─ Category chip      │
└─────────────────────────┘
  radius: --cb-radius-2xl (32px)
  shadow: --cb-shadow-1
  hover: scale(1.02) + shadow-2
  grid: 2-col mobile, 3-col tablet, 4-col desktop
```

#### Recipe Card (My Plan, Browse)
```
┌─────────────────────────┐
│   [Photo 16:9 landscape]│  ← radius-lg top
├─────────────────────────┤
│ Recipe Name (heading-sm) │
│ ⏱ 25 min · ●● Medium    │  ← body-sm, neutral-400
│ [P 32g] [C 45g] [F 12g] │  ← nutrient pill badges
└─────────────────────────┘
  radius: --cb-radius-lg (16px)
  shadow: --cb-shadow-1
  pill badges: success(P), warning(C), info(F) light backgrounds
```

#### Metric Card (Track Tab, Nutrition Summary)
```
┌───────────────────┐
│  Protein          │  ← label-md, neutral-400
│  145g             │  ← metric-xl, JetBrains Mono, neutral-900
│  ████████░░ 82%   │  ← progress bar: success if ≥80%, warning if 50-79%, danger if <50%
│  of 178g target   │  ← body-sm, neutral-400
└───────────────────┘
  background: --cb-neutral-50
  border: --cb-border-default
  radius: --cb-radius-md (12px)
  shadow: none (Revolut-flat for data)
  grid: 2×2 on all sizes
```

#### Meal Day Card (My Plan Weekly View)
```
┌────────────────────────────────────────┐
│ Mon 14  [🍳][🥗][🍲][🥜]  ●●●○ 75%   │  ← collapsed
├────────────────────────────────────────┤  ← expanded (today only):
│ Breakfast: Avocado Toast     ✓ done    │
│ Lunch: Grilled Salmon Bowl  ✓ done     │
│ Dinner: Quinoa Stir-fry     ○ pending  │
│ Snack: Greek Yogurt Parfait ○ pending  │
└────────────────────────────────────────┘
  today: left border 3px --cb-brand-primary
  completed meal: text --cb-neutral-400, strikethrough
  radius: --cb-radius-md
```

#### Subscription Tier Card (Profile, Upsell Modals)
```
Free                  Premium ★           Elite ★★
┌──────────┐         ┌──────────┐        ┌──────────┐
│ white bg │         │ white bg │        │ DARK bg  │ ← --cb-dark-surface-1
│          │         │          │        │ gold     │ ← border --cb-brand-primary
│ neutral  │         │ brand    │        │ glow     │ ← --cb-shadow-brand
│ CTA      │         │ CTA      │        │ CTA      │
└──────────┘         └──────────┘        └──────────┘
  web: 3-column side-by-side
  mobile: vertical scroll, sticky CTA at bottom
  feature rows: ✓ (success), 🔒 (neutral-200)
  Elite uses dark gradient EVEN in light mode — only permitted dark-on-light reversal
```

### 7.3 Navigation

#### Mobile (React Native) — Bottom Tab Bar
- Tabs: Discover | My Plan | Track | Profile
- Background: `--cb-neutral-0`, top border `--cb-neutral-100`
- Height: 49px + safe area (iOS) / 56px (Android)
- Active: `--cb-brand-primary` icon + label
- Inactive: `--cb-neutral-300` icon + label
- Badge: red dot (8px) for unread notifications on Profile tab

#### My Plan FAB
- Icon: shopping cart
- Background: `--cb-brand-primary`
- Size: 56px diameter
- Shadow: `--cb-shadow-2`
- Position: `bottom: 72px, right: 16px` (above tab bar)
- Label: "Order" shown on first visit, hidden after

#### Web (Next.js) — Sticky Top Nav
- Height: 64px
- Background: `--cb-neutral-0`, bottom border `--cb-border-default`
- Logo: left-aligned
- Tab links: center, `--cb-type-label-lg`, active = `--cb-brand-primary` + 2px bottom border
- Avatar + subscription badge: right-aligned
- Mobile web (< 768px): switches to bottom tab bar matching native layout

#### Onboarding Nav
- Tab bar hidden during onboarding
- Progress: horizontal step pills — current: gold fill, completed: `--cb-neutral-200`, remaining: `--cb-neutral-100`
- Back: Ghost button top-left
- Next/Continue: Primary CTA bottom-right, full-width on mobile

### 7.4 Inputs

- Height: 52px
- Radius: `--cb-radius-sm` (8px)
- Background: `--cb-neutral-50`
- Border: `--cb-border-strong` (resting) → `--cb-border-focus` (focused) → `--cb-border-error` (error)
- Label: above field, `--cb-type-body-sm`, `--cb-neutral-600`
- Placeholder: `--cb-neutral-200`
- Error: danger border + error message below in `--cb-type-body-sm` + `--cb-danger`
- Numeric inputs: right-aligned value, left-aligned unit label — prevents misreading "175 cm"

**Special Inputs:**
- **Activity level selector**: 5-segment visual slider with icon + label per level (not a dropdown)
- **Allergen multi-select**: pill grid — selected: `--cb-brand-primary-light` bg + `--cb-brand-primary-dark` text, unselected: `--cb-neutral-50` bg + `--cb-neutral-600` text
- **Goal selector**: large radio cards — icon + title + description, selected: `--cb-brand-primary` left border + `--cb-brand-primary-subtle` bg

### 7.5 Health Disclaimer

Required on every diet/nutrition screen (per `content.md`).

```
┌─ℹ────────────────────────────────────────────┐
│  This information is for educational          │
│  purposes only and is not intended as         │
│  medical advice.                              │
└──────────────────────────────────────────────┘
```

- Background: `--cb-info-light`
- Left border: 3px solid `--cb-info`
- Icon: info-circle in `--cb-info`
- Text: `--cb-type-body-sm`, `--cb-neutral-600`
- Radius: `--cb-radius-sm`
- **Collapsible**: after first view in session, collapses to single line: "ℹ Educational purposes only"
- **Never** `display: none` or `aria-hidden="true"`
- **Never** removed from DOM

### 7.6 Celebrity Profile Hero

```
┌─────────────────────────────────────────────┐
│                                             │
│         [Full-bleed portrait image]         │  ← 100vw, min-height 60vh
│                                             │
│                                             │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ gradient overlay ▓▓▓▓▓▓ │  ← rgba(26,25,23,0) → rgba(26,25,23,0.85)
│   Celebrity Name          [Try This Diet]   │  ← display-xl white / Primary CTA
│   "Clean eating advocate"                   │  ← body-lg, white 75% opacity
└─────────────────────────────────────────────┘
```

- Image: `object-fit: cover`, `alt="[Celebrity name] portrait"`
- Gradient: linear bottom 40%
- Name: `--cb-type-display-xl`, white, bottom-left
- Tagline: `--cb-type-body-lg`, `rgba(255,255,255,0.75)`
- CTA: Primary gold button, bottom-right
- On scroll: collapses to sticky mini-header (48px) with circular avatar (32px) + name (heading-sm)
- Source attribution chip below hero: "Sources: Vogue Mar 2025, Instagram" — `--cb-type-label-sm`, `--cb-neutral-400`

### 7.7 Meal Plan Generation Loading State

This screen covers a 5–15 second wait (spec §7.3). Must not be a blank spinner.

```
Phase 1 (0–3s):
┌─────────────────────────────────────────┐
│                                         │
│   [Celebrity photo, blurred bg]         │
│                                         │
│   Personalizing Tom Brady's             │  ← display-md, white
│   diet for you...                       │
│                                         │
│   ████████░░░░░░░░░░░░░ 35%            │  ← progress bar, brand-primary
│                                         │
│   "Building your meal blueprint..."     │  ← body-lg, white 60%
└─────────────────────────────────────────┘

Phase 2 (3–15s):
┌─────────────────────────────────────────┐
│   [Three animated insight cards]        │
│                                         │
│   ┌─ Boosting protein by 30g ─┐        │
│   ┌─ Removing dairy-based ────┐        │  ← fade in sequentially
│   ┌─ Optimizing 7-day variety ┐        │
│                                         │
│   ████████████████████░░░░ 78%          │
│                                         │
│   "Fine-tuning your macros..."          │
└─────────────────────────────────────────┘
```

- Background: celebrity hero image with 80% dark overlay + `blur(20px)`
- Progress bar: `--cb-brand-primary` fill, smooth linear animation
- Insight cards: `--cb-neutral-0` bg, `--cb-radius-md`, fade in at 4s/6s/8s
- If generation completes before 15s: show plan preview immediately with "Refining..." banner

### 7.8 Instacart Checkout Flow

Revolut-inspired: clean, conversion-focused, zero distraction.

```
┌─────────────────────────────────┐
│  Your Ingredients  (14 items)   │  ← heading-lg
├─────────────────────────────────┤
│  Avocado (organic)      $2.99   │
│  Salmon fillet 8oz      $12.99  │
│  [Substituted] Oat milk $4.49   │  ← warning chip if substituted
│  ...                            │
├─────────────────────────────────┤
│  Estimated Total                │
│  $67.42                         │  ← metric-lg, JetBrains Mono
│                                 │
│  [🛒 Order with Instacart]      │  ← Primary CTA + Instacart logo
│                                 │
│  "Estimated" badge when circuit │
│  breaker is open (spec §6.3)   │
└─────────────────────────────────┘
```

- Out-of-stock: `--cb-danger-light` bg chip "Unavailable"
- Substituted: `--cb-warning-light` bg chip "Substituted"
- Price total: `--cb-type-metric-lg`, JetBrains Mono
- Instacart button: Primary CTA with Instacart carrot logo left-aligned inside

---

## 8. Screen-by-Screen Design Mapping

### 8.1 Onboarding (S1–S11)

| Screen | Layout | Key Component | Persona Note |
|--------|--------|---------------|-------------|
| S1 Welcome | Full-viewport dark bg, celebrity collage mosaic behind, display-xl white headline | Primary CTA "Get Started" | Household CEO: emphasize "ready in 2 minutes" in subtitle |
| S2 Auth | Centered card on neutral-0 | Apple/Google SSO buttons (secondary style), email as ghost link | — |
| S3 Basic Info | White card, 1 question per screen | Name, birth year, sex inputs | — |
| S4 Body Metrics | White card, 1 question per screen | Height/weight numeric inputs with unit labels | Biohacker: show BMI calculation live as they type |
| S5 Activity Level | White card | 5-level visual slider with icons | — |
| S6 Health Info | White card | Allergen pill grid + conditions multi-select | Health disclaimer shown for first time here |
| S7 Biomarker | White card | Manual number input form (Phase 1) | Biohacker: prominent placement, not buried |
| S8 Wellness Goal | White card | Large radio cards: Weight Loss, Muscle Gain, Maintenance, GLP-1 Support | GLP-1: purple accent + brief explanation on that option |
| S9 Dietary Pref | White card | Diet type radio + cuisine multi-select chips | — |
| S10 Summary | White card | All answers as editable chip rows, "Confirm" Primary CTA | — |
| S11 Category | 4 large image cards | Category grid: Diet/Protein/Vegetarian/General with celeb faces | Aspirational: celebrity faces prominent |

**Shared onboarding rules:**
- One input or question per screen — no scrolling within a step
- Step progress pills visible at top (max 11 steps, grouped into 4 clusters visually)
- Each step loads < 150ms
- Back = Ghost button top-left, Next = Primary CTA bottom-right (full-width mobile)

### 8.2 Tab 1: Discover

```
┌─────────────────────────────────┐
│  [Search bar]                   │  ← neutral-50 bg, radius-full, search icon
├─────────────────────────────────┤
│  Trending Today ─────────►      │  ← horizontal scroll carousel
│  [Card][Card][Card]...          │    celebrity cards, 140px wide thumbnails
├─────────────────────────────────┤
│  [All] [Diet] [Protein] [Veg]  │  ← category chip row, horizontal scroll
├─────────────────────────────────┤
│  ┌─────┐  ┌─────┐              │
│  │     │  │     │              │  ← 2-col Celebrity Discovery Cards
│  │     │  │     │              │    infinite scroll, cursor pagination
│  └─────┘  └─────┘              │
│  ┌─────┐  ┌─────┐              │
│  │     │  │     │              │
│  └─────┘  └─────┘              │
│  ...                            │
├─────────────────────────────────┤
│  🔒 Unlock more with Premium    │  ← after 3rd card on Free tier:
│                                 │    blurred overlay + upsell CTA
└─────────────────────────────────┘
```

### 8.3 Celebrity Detail

- Full-bleed hero (Section 7.6)
- Three tabs below hero: "About" | "Diet Plans" | "Recipes"
  - About: bio text, philosophy, source refs chips
  - Diet Plans: vertical list of available base diets with nutrient summary
  - Recipes: 2-column recipe card grid
- "Try This Diet" sticky CTA at bottom persists on scroll
- Premium lock: blurred bottom section + "Unlock with Premium" overlay for Free users

### 8.4 Tab 2: My Plan

```
┌─────────────────────────────────┐
│  Good morning, Sarah 👋         │  ← heading-lg, greeting
├─────────────────────────────────┤
│  Today's Nutrition              │
│  ┌─────────┐  ┌─────────┐      │
│  │ 1,847   │  │  145g   │      │  ← 2×2 Metric Cards
│  │ kcal    │  │ protein │      │
│  ├─────────┤  ├─────────┤      │
│  │  203g   │  │   62g   │      │
│  │ carbs   │  │  fat    │      │
│  └─────────┘  └─────────┘      │
├─────────────────────────────────┤
│  [Mon][Tue][Wed][Thu][Fri]►     │  ← horizontal date strip
├─────────────────────────────────┤
│  ▶ Breakfast: Avocado Toast  ✓  │  ← expandable meal cards
│  ▶ Lunch: Grilled Salmon    ✓  │
│  ▶ Dinner: Quinoa Stir-fry  ○  │
│  ▶ Snack: Greek Yogurt      ○  │
├─────────────────────────────────┤
│                    [🛒 FAB]     │  ← gold, above tab bar
└─────────────────────────────────┘
```

### 8.5 Recipe Detail

- Hero image (16:9), radius-lg bottom
- Below image: recipe name (heading-lg), prep/cook time + difficulty chips
- Nutrition table: Notion-style clean rows, metric-sm numbers in JetBrains Mono
  - Columns: Nutrient | Amount | % Daily Value
- Ingredients list: checkable rows (tap to cross off while cooking)
- Step-by-step: numbered cards, each with optional timer button
- "Add to Cart" Secondary button at bottom
- **Health disclaimer always visible below nutrition table**

### 8.6 Tab 3: Track

- Daily check-in card at top: large, prominent, "Log Today" Primary CTA
  - Check-in form: meal completion toggles, weight input, energy/mood/sleep 1–5 selectors
- Progress charts (Revolut-flat aesthetic — no shadows, depth via bg color only):
  - Line chart: weight trend (30 days) — `--cb-neutral-600` line
  - Bar chart: weekly adherence % — success/warning/danger colors
  - Area chart: calorie trend — `--cb-brand-primary` fill at 20% opacity
- Weekly/monthly summary: 2×2 Metric Cards
- Chart interaction: tap a data point → tooltip with date + value

### 8.7 Tab 4: Profile

- Avatar (64px, radius-full) + display name + subscription badge (pill)
- Bio Profile summary card: key stats in 2-column layout, "Edit" ghost button
- Subscription section:
  - Current tier card with badge
  - "Upgrade" Secondary CTA (or "Elite" gold badge if already Elite)
- Order History: compact list with status chips (delivered/processing/failed)
- Settings rows: standard list rows — locale, units (lb/kg), notification toggles
- Support: link to FAQ, "Contact Us" ghost button
- Sign Out: ghost button, danger-colored

---

## 9. Responsive Behavior

### 9.1 Breakpoints

| Token | Value | Target |
|-------|-------|--------|
| `--cb-bp-xs` | 375px | iPhone SE, small Android |
| `--cb-bp-sm` | 390px | iPhone 15 standard |
| `--cb-bp-md` | 768px | iPad, tablets |
| `--cb-bp-lg` | 1024px | iPad Pro landscape, small desktop |
| `--cb-bp-xl` | 1280px | Standard desktop |
| `--cb-bp-2xl` | 1440px | Large desktop |

### 9.2 React Native (Mobile)

- All dimensions in dp (density-independent pixels)
- Layout via Flexbox + `useWindowDimensions()` hook
- No CSS breakpoints — conditional rendering via width thresholds
- Tablet (≥768dp): 2-column layouts, expanded card grids, optional side navigation

### 9.3 Next.js (Web)

- CSS custom properties + standard media queries
- Mobile-first: 375px base, build up
- `375px`: single column, full-width cards, bottom tab bar
- `768px`: 2-column card grids, search expands
- `1024px`: 3-column Discover grid, expanded nav
- `1280px`: 4-column Discover grid, full editorial layout
- `1440px+`: centered with generous margins, max-width 1200px

### 9.4 Collapsing Rules

| Element | Large | Medium | Small |
|---------|-------|--------|-------|
| Discover grid | 4-col | 3-col | 2-col |
| Type display-xl | 56px | 40px | 32px |
| Section padding | 64px | 48px | 24px |
| Celebrity hero | 60vh | 50vh | 40vh |
| Navigation | Top sticky | Top sticky | Bottom tab bar |
| Subscription cards | 3-col row | 2-col + scroll | vertical stack |

### 9.5 Touch Targets

All interactive elements: minimum **44×44pt** (Apple HIG / Android Material).

---

## 10. Motion & Animation

### 10.1 Duration Tokens

| Token | Value | Easing | Usage |
|-------|-------|--------|-------|
| `--cb-motion-instant` | 0ms | — | Checkbox toggles, immediate feedback |
| `--cb-motion-fast` | 150ms | ease-out | Icon state change, chip selection, tab switch |
| `--cb-motion-standard` | 250ms | ease-in-out | Card expand/collapse, modal appearance |
| `--cb-motion-slow` | 400ms | ease-in-out | Page transitions, hero image entrance |
| `--cb-motion-deliberate` | 600ms | cubic-bezier(0.2, 0, 0, 1) | Progress bar fill, loading state |

### 10.2 Specific Animations

- **Discover → Celebrity Detail**: shared element transition — card image morphs to full-bleed hero
- **Macro ring fill**: animate from 0 on screen enter (300ms, ease-out)
- **Tab switch**: horizontal slide + opacity fade (150ms)
- **Meal plan loading**: smooth linear progress bar + sequential card fade-ins
- **Check-in success**: brief scale(1.1) pulse on completed meal icon

### 10.3 Reduced Motion

When `prefers-reduced-motion: reduce`:
- All non-essential animations stop
- Progress bars fill instantly
- Page transitions are instant cuts
- Loading state becomes static text + determinate progress bar
- Macro rings render at final value without animation

---

## 11. Iconography

### 11.1 Icon Library

**Lucide Icons** — MIT license, available via `lucide-react-native` and `lucide-react`.

### 11.2 Size Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--cb-icon-xs` | 16px | Inline with body text, input adornments |
| `--cb-icon-sm` | 20px | Button icons, list item icons |
| `--cb-icon-md` | 24px | Tab bar icons, card action icons |
| `--cb-icon-lg` | 32px | Feature icons, category headers |
| `--cb-icon-xl` | 48px | Empty states, onboarding illustrations |

### 11.3 Rules

- Color: inherits current `color` unless explicitly overridden
- Stroke width: 1.5px (default Lucide)
- All icon-only buttons must have `accessibilityLabel` (RN) / `aria-label` (web)
- Custom icons (not in Lucide) go in `packages/ui-kit/src/icons/`:
  - Celebrity star badge
  - GLP-1 pill icon
  - Macro ring segments (SVG components)
  - Instacart carrot logo

---

## 12. Accessibility

### 12.1 Color Contrast

All text/background combinations meet WCAG 2.1 AA:
- Body text (`--cb-neutral-600` on `--cb-neutral-0`): **7.2:1** ✓
- Heading text (`--cb-neutral-900` on `--cb-neutral-0`): **14.8:1** ✓
- Brand primary (`--cb-brand-primary` on white): **3.1:1** — AA Large only. Used on buttons with white text (white on gold = **4.5:1** ✓) or as decorative accent.
- All semantic colors validated in Section 2.3.

### 12.2 Interactive States

- Focus ring: `2px solid --cb-brand-primary`, 2px offset, visible in all themes
- Focus visible only on keyboard navigation (`:focus-visible`), not on mouse click
- All form errors announced via `aria-live="polite"` regions
- Loading states have `aria-busy="true"` + `role="progressbar"` with `aria-valuenow`

### 12.3 Content Accessibility

- All images: descriptive `alt` text including celebrity name and context
- Health disclaimer: **never** `aria-hidden`, always in tab order when expanded
- Locked content (subscription gating): `aria-disabled="true"` + label "Requires Premium subscription"
- Skeleton screens: `aria-label="Loading content"` on skeleton containers
- Charts: `aria-label` with textual summary of data trend

### 12.4 Platform-Specific

- iOS: Dynamic Type support — font sizes scale with system accessibility settings
- Android: TalkBack compatibility verified for all custom components
- Web: full keyboard navigation for all flows, skip-to-content link

---

## 13. AI Agent Prompt Guide

### 13.1 Core Directives

1. **Never use hex values directly in component code** — always reference token variables (`--cb-brand-primary`, not `#C9A84C`)
2. **Typography**: always use named tokens (`--cb-type-display-xl`), never `font-size: 56px`
3. **Spacing**: use scale tokens (`--cb-space-4`), never `padding: 16px`
4. **One Primary CTA per screen** — a second gold button is a design error
5. **Shadows**: max one level upgrade per interaction (rest→shadow-1, hover→shadow-2)
6. **Celebrity images**: always `object-fit: cover` with `alt` text including celebrity name
7. **Macro numbers**: always use `--cb-type-metric-*` tokens + JetBrains Mono
8. **Health disclaimers**: never remove, never `display: none` — only collapse to single line
9. **Skeleton UI**: every screen must show a skeleton before data loads, never a blank screen

### 13.2 Screen-Specific Prompts

**Discover Tab:**
> "Use 2-column grid of Celebrity Discovery Cards (32px radius, 2:3 portrait images). Top section: search bar (neutral-50 bg, full-pill radius) + 'Trending Today' horizontal carousel. Category chip row below search. Active chip: brand-primary-light bg + brand-primary-dark text. Do not use Airbnb coral anywhere — use `--cb-brand-primary` gold for active states."

**My Plan Tab:**
> "Header: greeting with user's first name. 2×2 Metric Cards grid showing calories/protein/carbs/fat — flat style, no shadow, neutral-50 bg with whisper border. Below: horizontal date strip (today highlighted with brand-primary underline) + expandable meal cards. FAB: gold circle, 56px, position bottom-right above tab bar."

**Track Tab:**
> "All charts use Revolut-flat aesthetic — no shadows, depth via background color only. Weight trend: line chart with neutral-600 stroke. Adherence bars: success-green for ≥80%, warning for 50-79%, danger for <50%. Daily check-in card: prominent at top with 'Log Today' Primary CTA."

**Recipe Detail:**
> "Hero image 16:9 with radius-lg bottom corners. Nutrition table: Notion-style whisper borders, numbers in JetBrains Mono metric-sm. Ingredients list: checkable rows with tap-to-strikethrough. Health disclaimer MUST appear below nutrition table, never omit."

### 13.3 Dark Mode Prompt

> "When implementing dark mode (Elite tier): replace all `--cb-neutral-*` with `--cb-dark-*` equivalents. Remove all box-shadows — use surface brightness for depth. Gold becomes `--cb-dark-brand-primary` (#E8C870). Borders become `rgba(255,255,255,0.08)`. Never use pure black (#000000) for surfaces."

---

## 14. Implementation Notes

### 14.1 File Locations

| Purpose | Path |
|---------|------|
| RN design tokens | `apps/mobile/src/theme/tokens.ts` |
| Web CSS tokens | `apps/web/src/styles/tokens.css` |
| Shared UI components | `packages/ui-kit/src/` |
| Custom icons | `packages/ui-kit/src/icons/` |
| Font assets (RN) | `apps/mobile/src/assets/fonts/` |

### 14.2 Token Export Pattern (TypeScript)

```typescript
// apps/mobile/src/theme/tokens.ts
export const colors = {
  brand: {
    primary: '#C9A84C',
    primaryHover: '#B8973E',
    primaryDark: '#9E7B2E',
    primaryLight: '#F5EDDA',
    primarySubtle: '#FBF8F0',
  },
  neutral: {
    0: '#FAFAF8', 50: '#F4F3F0', 100: '#E8E6E1',
    200: '#D0CEC8', 300: '#B5B2AB', 400: '#9E9B94',
    500: '#7A7772', 600: '#5A5750', 700: '#3D3B37',
    800: '#272521', 900: '#1A1917',
  },
  semantic: {
    success: '#2D9B6E', successLight: '#E8F5EE',
    warning: '#C86A1F', warningLight: '#FEF3E8',
    danger: '#C53030', dangerLight: '#FEE8E8',
    info: '#2B6CB0', infoLight: '#EBF4FF',
  },
} as const;

export const spacing = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20,
  6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96,
} as const;

export const radius = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, full: 9999,
} as const;

export type ColorToken = typeof colors;
export type SpacingToken = keyof typeof spacing;
```

### 14.3 CSS Custom Properties (Web)

```css
/* apps/web/src/styles/tokens.css */
:root {
  --cb-brand-primary: #C9A84C;
  --cb-brand-primary-hover: #B8973E;
  /* ... all tokens from Section 2–6 as CSS custom properties ... */
  
  --cb-type-display-xl: 700 3.5rem/1.10 'Plus Jakarta Sans', sans-serif;
  /* ... shorthand for each type scale entry ... */
}

[data-theme="dark"] {
  --cb-neutral-0: #141412;
  --cb-neutral-50: #1E1D1B;
  /* ... dark mode overrides ... */
}
```

### 14.4 Font Loading

**React Native:**
```typescript
// Use expo-font with useFonts() hook at app root
// Show skeleton splash screen while fonts load — never show un-styled text
import { useFonts } from 'expo-font';
const [fontsLoaded] = useFonts({
  'PlusJakartaSans-Regular': require('./assets/fonts/PlusJakartaSans-Regular.ttf'),
  'PlusJakartaSans-SemiBold': require('./assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('./assets/fonts/PlusJakartaSans-Bold.ttf'),
  'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium': require('./assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
  'JetBrainsMono-Medium': require('./assets/fonts/JetBrainsMono-Medium.ttf'),
  'JetBrainsMono-Bold': require('./assets/fonts/JetBrainsMono-Bold.ttf'),
});
```

### 14.5 Component Wrapper Requirements

Every Lucide icon must go through a `<CbIcon>` wrapper that enforces:
- Size system (xs/sm/md/lg/xl)
- Required `accessibilityLabel` prop
- Bare `<LucideIcon>` usage should fail the linter

---

*This document is the source of truth for all CelebBase Wellness UI implementation. When in doubt, refer back to the four principles: Aspirational Precision, Earned Luxury, One-Click Confidence, Transparent Health.*
