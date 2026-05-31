// Static, declarative copy for the Celebase landing page.
// Kept out of the TSX so the section components stay presentational.
//
// LEGAL / CONTENT POLICY (.claude/rules/domain/content.md):
//   • The persona archetypes below are ILLUSTRATIVE — they are NOT real, named
//     people, and no licensed photo or scraped post is attributed to anyone.
//   • The News cards cover real wellness *topics* (the kind the feed follows),
//     each carrying a trust grade + the *type* of source it would cite — never a
//     scraped headline or a real outlet's photo.
//   • Engine numbers are grounded in services/meal-plan-engine (verified, not
//     invented): Mifflin–St Jeor / Katch–McArdle, activity 1.2–1.9, goal factor
//     0.75–1.20, 1,200–5,000 kcal band, protein 1.4–2.2 g/kg, 18-nutrient RDA.

export type PersonaAccent = 'biohacker' | 'glp1' | 'aspirational' | 'household';
export type TrustGrade = 'A' | 'B' | 'C' | 'D';

/* =====================================================
   HERO — the three-axis product identity
   ===================================================== */
export interface IdentityAxis {
  /** Two-digit editorial index. */
  index: string;
  label: string;
  blurb: string;
}

export const IDENTITY_AXES: readonly IdentityAxis[] = [
  {
    index: '01',
    label: 'Follows the trend first',
    blurb: 'A live feed of what the wellness world is actually doing — graded and sourced before it goes out.',
  },
  {
    index: '02',
    label: 'Re-computes the celebrity diet',
    blurb: 'The food behind the people who inspire you, re-engineered by our AI engine to fit your body.',
  },
  {
    index: '03',
    label: 'Turns it into one plan',
    blurb: 'Every claim funnels into a personalized, allergen-safe meal plan you can follow today.',
  },
] as const;

/* =====================================================
   SOCIAL WALL — illustrative archetype tiles (hero backdrop)
   Designed mock tiles, NOT real accounts or photos. The artwork is
   self-authored gradient + inline SVG (no stock photo, no scraped post),
   so nothing is attributed to a real person. `motif` selects the SVG glyph.
   ===================================================== */
export type MotifKey =
  | 'protein'
  | 'supplement'
  | 'plant'
  | 'prep'
  | 'cardio'
  | 'ferment'
  | 'strength'
  | 'timing';

export interface SocialTile {
  initial: string;
  /** Illustrative archetype handle (fictional). */
  handle: string;
  caption: string;
  motif: MotifKey;
  accent: PersonaAccent;
}

export const SOCIAL_TILES: readonly SocialTile[] = [
  { initial: 'OS', handle: '@the.sprinter', caption: '40g protein, within the hour', motif: 'protein', accent: 'biohacker' },
  { initial: 'WF', handle: '@founder.fuel', caption: 'D3 with the first meal', motif: 'supplement', accent: 'glp1' },
  { initial: 'PV', handle: '@plant.voice', caption: 'Lentils, tofu, leafy base', motif: 'plant', accent: 'aspirational' },
  { initial: 'HC', handle: '@house.ceo', caption: 'Same prep, every Sunday', motif: 'prep', accent: 'household' },
  { initial: 'ZR', handle: '@zone.two', caption: '45 min, nose-breathing only', motif: 'cardio', accent: 'biohacker' },
  { initial: 'GF', handle: '@gut.first', caption: 'A fermented thing daily', motif: 'ferment', accent: 'aspirational' },
] as const;

/* =====================================================
   STORE BADGES
   ===================================================== */
export interface StoreBadge {
  store: 'apple' | 'google';
  small: string;
  name: string;
}

export const STORE_BADGES: readonly StoreBadge[] = [
  { store: 'apple', small: 'Coming soon to the', name: 'App Store' },
  { store: 'google', small: 'Coming soon to', name: 'Google Play' },
] as const;

/* =====================================================
   NEWS / FEED — real wellness topics the feed follows
   ===================================================== */
export interface NewsTopic {
  /** Editorial kicker / category. */
  category: string;
  headline: string;
  /** One-line plain-language summary. */
  summary: string;
  grade: TrustGrade;
  /** The *type* of source a real card would cite (never a scraped outlet). */
  sourceType: string;
  /** Selects the self-authored inline SVG glyph (no stock photo). */
  motif: MotifKey;
  accent: PersonaAccent;
  /** Marks the freshest story in the feed. */
  trending?: boolean;
}

export const NEWS_TOPICS: readonly NewsTopic[] = [
  {
    category: 'Recovery',
    headline: 'Magnesium glycinate is the sleep stack everyone is testing',
    summary: 'The gentler, better-absorbed form — why it keeps showing up in evening routines.',
    grade: 'B',
    sourceType: 'NIH ODS fact sheet',
    motif: 'supplement',
    accent: 'glp1',
    trending: true,
  },
  {
    category: 'Cardio',
    headline: 'Zone 2 cardio: the unglamorous base everyone is rebuilding',
    summary: 'Conversational-pace training as the metabolic foundation under the highlight reels.',
    grade: 'A',
    sourceType: 'Sports-medicine consensus',
    motif: 'cardio',
    accent: 'biohacker',
  },
  {
    category: 'Gut health',
    headline: 'Fermented foods keep beating fiber for microbiome diversity',
    summary: 'A daily fermented serving, and what the controlled trials actually measured.',
    grade: 'B',
    sourceType: 'Peer-reviewed trial',
    motif: 'ferment',
    accent: 'aspirational',
  },
  {
    category: 'Strength',
    headline: 'Creatine is leaving the gym — and the evidence followed',
    summary: 'Beyond performance: cognition and recovery claims, weighed against the meta-analyses.',
    grade: 'A',
    sourceType: 'Meta-analysis',
    motif: 'strength',
    accent: 'biohacker',
  },
  {
    category: 'GLP-1',
    headline: 'Holding muscle on GLP-1: protein-first is the whole game',
    summary: 'Why every credible protocol leads with protein and resistance work — graded carefully.',
    grade: 'C',
    sourceType: 'Emerging research',
    motif: 'protein',
    accent: 'glp1',
  },
  {
    category: 'Nutrition',
    headline: 'Protein timing is back — and the dose matters more than the clock',
    summary: 'The "anabolic window" myth, re-examined: total daily protein still does the heavy lifting.',
    grade: 'B',
    sourceType: 'Systematic review',
    motif: 'timing',
    accent: 'household',
  },
] as const;

export interface PipelineStep {
  label: string;
}

/* =====================================================
   ENGINE — the calorie math (grounded in calorie_adjuster.py)
   ===================================================== */
export interface CalorieStep {
  title: string;
  formula: string;
  detail: string;
}

export const CALORIE_STEPS: readonly CalorieStep[] = [
  {
    title: 'Resting burn (BMR)',
    formula: 'Mifflin–St Jeor',
    detail:
      'Your baseline from age, sex, height, and weight — Katch–McArdle when body-fat % is known.',
  },
  {
    title: 'Daily burn (TDEE)',
    formula: 'BMR × activity',
    detail: 'Scaled by how active you are, from sedentary (1.2) to very active (1.9).',
  },
  {
    title: 'Your target',
    formula: 'TDEE × 0.75–1.20',
    detail:
      'A goal factor for cutting, maintaining, or building — clamped to a safe 1,200–5,000 kcal band.',
  },
  {
    title: 'Protein-first macros',
    formula: '1.4–2.2 g/kg',
    detail: 'Protein is set first to protect muscle, then fat (~35%), then carbs with a floor.',
  },
] as const;

export interface MacroSlice {
  label: string;
  pct: number;
  grams: number;
  /** Chart token suffix, e.g. "protein" → var(--cb-chart-protein). */
  token: 'protein' | 'calories' | 'weight';
}

export interface EnginePass {
  tag: string;
  title: string;
  timing: string;
  steps: readonly string[];
}

// The two-pass generation pipeline (services/meal-plan-engine/src/engine/pipeline.py).
export const ENGINE_PASSES: readonly EnginePass[] = [
  {
    tag: 'Pass 1',
    title: 'Lightning draft',
    timing: '~3 s',
    steps: ['Adjust calories to your goal', 'Filter every allergen — fail-closed'],
  },
  {
    tag: 'Pass 2',
    title: 'Deep optimization',
    timing: '~12 s',
    steps: [
      'Rebalance macros, protein first',
      'Check 18 nutrients against your RDA',
      'Solve a varied week (ILP — no recipe more than twice, seed-fixed)',
      'AI selects & ranks each meal from the safe pool — every pick cited',
      'Normalize sources & assemble your week',
    ],
  },
] as const;

export const SAFETY_POINTS: readonly string[] = [
  'Nutrition numbers come only from USDA FoodData Central + NIH ODS — never invented by an LLM.',
  'Allergens are filtered fail-closed; the AI only ranks meals from that vetted pool, never overriding safety.',
  'Calories stay inside a clinically safe 1,200–5,000 kcal band.',
  'Every recommendation carries a citation — no black-box recipes.',
] as const;

/* =====================================================
   WORKED EXAMPLE — interactive persona toggle
   Each entry uses a REAL celebrity diet from our seed DB
   (db/seeds/data/<slug>.json → base_diet.avg_daily_kcal + macro_ratio + sources).
   That sourced "base day" → the personalized target the engine computes for an
   ILLUSTRATIVE general-person sample profile, with a protein-first macro split +
   a cited sample day. The sample profile & target numbers are illustrative;
   "inspired by" — not affiliated with or endorsed by the celebrities.
   ===================================================== */
export interface WorkedMacro {
  label: string;
  pct: number;
  grams: number;
  token: 'protein' | 'calories' | 'weight';
}

export interface SampleMeal {
  slot: string;
  dish: string;
  kcal: number;
  cite: string;
}

export interface WorkedPersona {
  id: string;
  /** Illustrative archetype label. */
  archetype: string;
  /** The celebrity this archetype is inspired by (publicly reported; "inspired by"). */
  celebrity: string;
  /** The celebrity's own physical profile (age · sex · height · weight · activity) — for comparison. */
  celebrityBody: string;
  /** The celebrity's real base-diet summary (from our DB): style · diet type · macro ratio. */
  celebrityProfile: string;
  /** Where the celebrity diet is reported (DB source_refs). */
  source: string;
  initial: string;
  accent: PersonaAccent;
  /** The celebrity's real average daily kcal (DB base_diet.avg_daily_kcal — publicly reported). */
  baseKcal: number;
  /** What the engine computes for the sample profile. */
  targetKcal: number;
  /** The illustrative sample profile the target was computed for. */
  profile: string;
  /** One-line rationale, mirrors the "traceable personalization" principle. */
  rationale: string;
  goalFactor: string;
  macros: readonly WorkedMacro[];
  day: readonly SampleMeal[];
}

export const WORKED_PERSONAS: readonly WorkedPersona[] = [
  {
    id: 'ronaldo',
    archetype: 'High-protein athlete',
    celebrity: 'Cristiano Ronaldo',
    celebrityBody: '41 yr · M · 187 cm · 84 kg · very active',
    celebrityProfile: 'CR7 High-Performance · omnivore · 35/40/25 P·C·F',
    source: 'AS / Men’s Health interview',
    initial: 'CR',
    accent: 'biohacker',
    baseKcal: 3200,
    targetKcal: 2200,
    profile: '30 yr · M · 178 cm · 80 kg · moderately active',
    rationale: 'You train less than a pro, so the base scales down — protein stays high to hold muscle.',
    goalFactor: '× 0.80 (moderate cut)',
    macros: [
      { label: 'Protein', pct: 35, grams: 193, token: 'protein' },
      { label: 'Carbs', pct: 40, grams: 220, token: 'weight' },
      { label: 'Fat', pct: 25, grams: 61, token: 'calories' },
    ],
    day: [
      { slot: 'Breakfast', dish: 'Eggs, oats, berries', kcal: 520, cite: 'USDA FDC' },
      { slot: 'Lunch', dish: 'Chicken, brown rice, broccoli', kcal: 640, cite: 'USDA FDC' },
      { slot: 'Snack', dish: 'Greek yogurt & almonds', kcal: 320, cite: 'USDA FDC' },
      { slot: 'Dinner', dish: 'Sea bass, sweet potato, salad', kcal: 720, cite: 'USDA FDC' },
    ],
  },
  {
    id: 'portman',
    archetype: 'Whole-food vegan',
    celebrity: 'Natalie Portman',
    celebrityBody: '44 yr · F · 160 cm · 50 kg · moderately active',
    celebrityProfile: 'Ethical Vegan Kitchen · vegan · 18/55/27 P·C·F',
    source: 'Harper’s Bazaar interview',
    initial: 'NP',
    accent: 'aspirational',
    baseKcal: 1900,
    targetKcal: 1750,
    profile: '29 yr · F · 165 cm · 60 kg · moderately active',
    rationale: 'A plant-forward base with protein floored to 1.8 g/kg so the cut protects muscle.',
    goalFactor: '× 0.85 (light cut)',
    macros: [
      { label: 'Protein', pct: 25, grams: 109, token: 'protein' },
      { label: 'Carbs', pct: 50, grams: 219, token: 'weight' },
      { label: 'Fat', pct: 25, grams: 49, token: 'calories' },
    ],
    day: [
      { slot: 'Breakfast', dish: 'Tofu scramble, sourdough', kcal: 380, cite: 'USDA FDC' },
      { slot: 'Lunch', dish: 'Lentil & quinoa bowl, tahini', kcal: 520, cite: 'USDA FDC' },
      { slot: 'Snack', dish: 'Edamame & soy yogurt', kcal: 250, cite: 'USDA FDC' },
      { slot: 'Dinner', dish: 'Tempeh stir-fry, brown rice', kcal: 600, cite: 'USDA FDC' },
    ],
  },
  {
    id: 'aniston',
    archetype: 'Mediterranean + IF',
    celebrity: 'Jennifer Aniston',
    celebrityBody: '57 yr · F · 164 cm · 57 kg · moderately active',
    celebrityProfile: 'IF + Mediterranean · pescatarian · 25/40/35 P·C·F',
    source: 'InStyle / Radio Times interview',
    initial: 'JA',
    accent: 'glp1',
    baseKcal: 1700,
    targetKcal: 1600,
    profile: '38 yr · F · 168 cm · 65 kg · lightly active',
    rationale: 'A Mediterranean base recomputed to your day — protein-first to stay satisfying.',
    goalFactor: '× 0.85 (light cut)',
    macros: [
      { label: 'Protein', pct: 30, grams: 120, token: 'protein' },
      { label: 'Carbs', pct: 40, grams: 160, token: 'weight' },
      { label: 'Fat', pct: 30, grams: 53, token: 'calories' },
    ],
    day: [
      { slot: 'Breakfast', dish: 'Greek yogurt, berries, walnuts', kcal: 360, cite: 'USDA FDC' },
      { slot: 'Lunch', dish: 'Salmon, farro, greens', kcal: 520, cite: 'USDA FDC' },
      { slot: 'Snack', dish: 'Hummus & crudités', kcal: 220, cite: 'USDA FDC' },
      { slot: 'Dinner', dish: 'White fish, lentils, olive oil', kcal: 500, cite: 'USDA FDC' },
    ],
  },
] as const;

/* =====================================================
   CARD-NEWS SHOWCASE — our real Instagram "Celebrity Decode" series
   These are SELF-PRODUCED brand assets (in /public/cardnews). The newest
   format (cameron-diaz) is purely typographic — no photo — and carries its
   own "inspired by / not affiliated" disclaimer on the last slide. The older
   sets pair a portrait with the same editorial system. Each set is published
   "inspired by" publicly reported information — never an endorsement.
   ===================================================== */
export interface DecodeSlide {
  /** Path under /public. */
  src: string;
  alt: string;
  /** Mono kicker — where this slide sits in the decode arc. */
  stage: string;
  /** Plain-language note: what this slide shows. */
  note: string;
}

export interface CardNewsSet {
  slug: string;
  celebrity: string;
  hook: string;
  cover: string;
  coverAlt: string;
}

// The featured set — walked slide-by-slide so the arc of a Decode is visible.
export const FEATURED_DECODE = {
  celebrity: 'Cameron Diaz',
  hook: 'Her longevity plate, decoded — then rescaled to your body.',
  slides: [
    {
      src: '/cardnews/cameron-diaz/1.png',
      alt: 'Celebase card news cover — “Cameron Diaz’s longevity plate, decoded.”',
      stage: 'The hook',
      note: 'The celebrity and the promise — what she eats, rescaled to you.',
    },
    {
      src: '/cardnews/cameron-diaz/2.png',
      alt: 'Card news slide — “Mediterranean, whole-food, 80/20” with a numbered breakdown.',
      stage: 'What she does',
      note: 'Her publicly reported pattern, broken into a few rules — each with its source.',
    },
    {
      src: '/cardnews/cameron-diaz/3.png',
      alt: 'Card news slide — “What the science says,” with checks and one caution.',
      stage: 'What science says',
      note: 'The evidence, weighed honestly — and where “associated with” isn’t a guarantee.',
    },
    {
      src: '/cardnews/cameron-diaz/4.png',
      alt: 'Card news slide — “Her plate was built for her body & goals.”',
      stage: 'The catch',
      note: 'Her calories and macros are hers — copied straight, the plate may not fit your day.',
    },
    {
      src: '/cardnews/cameron-diaz/5.png',
      alt: 'Card news slide — “Same Mediterranean base. Your numbers,” listing calories, macros, foods.',
      stage: 'Rescaled to you',
      note: 'Same base, recomputed — your calories, your macros, your foods.',
    },
    {
      src: '/cardnews/cameron-diaz/6.png',
      alt: 'Card news closing slide — “Get your personalized Mediterranean plan,” with a Make my Plan button.',
      stage: 'Your turn',
      note: 'One tap to a personalized week — inspired by, never an endorsement.',
    },
  ],
} as const satisfies { celebrity: string; hook: string; slides: readonly DecodeSlide[] };

// More published decodes — variety across the feed (cover only).
export const MORE_DECODES: readonly CardNewsSet[] = [
  {
    slug: 'jennie',
    celebrity: 'Jennie',
    hook: 'Porridge before Pilates',
    cover: '/cardnews/jennie/1.jpg',
    coverAlt: 'Celebase Celebrity Decode card news cover for Jennie.',
  },
  {
    slug: 'zendaya',
    celebrity: 'Zendaya',
    hook: 'Energy that lasts a set',
    cover: '/cardnews/zendaya/1.jpg',
    coverAlt: 'Celebase Celebrity Decode card news cover for Zendaya.',
  },
  {
    slug: 'sabrina-carpenter',
    celebrity: 'Sabrina Carpenter',
    hook: 'Tour-day fuel, decoded',
    cover: '/cardnews/sabrina-carpenter/1.jpg',
    coverAlt: 'Celebase Celebrity Decode card news cover for Sabrina Carpenter.',
  },
  {
    slug: 'jeremy-allen-white',
    celebrity: 'Jeremy Allen White',
    hook: 'Lean, high-protein discipline',
    cover: '/cardnews/jeremy-allen-white/1.jpg',
    coverAlt: 'Celebase Celebrity Decode card news cover for Jeremy Allen White.',
  },
] as const;

// How each Decode is made — the editorial pipeline behind the series.
export const DECODE_PIPELINE: readonly PipelineStep[] = [
  { label: 'Scout the trend' },
  { label: 'Research the real diet' },
  { label: 'Verify the science' },
  { label: 'Grade the trust' },
  { label: 'AI decode & rescale' },
  { label: 'Publish' },
] as const;

/* =====================================================
   FLAGSHIP — what the product actually does
   ===================================================== */
export interface Flagship {
  index: string;
  name: string;
  blurb: string;
}

export const FLAGSHIP_FEATURES: readonly Flagship[] = [
  {
    index: '01',
    name: 'The Decode feed',
    blurb: 'Celebrity diets, followed first — each one graded for trust and tied to a primary source.',
  },
  {
    index: '02',
    name: 'The AI plan engine',
    blurb: 'An AI recomputes their plate to your calories and macros, then picks each meal from a vetted, allergen-safe pool.',
  },
  {
    index: '03',
    name: 'Your one-tap plan',
    blurb: 'A varied, allergen-safe week you can follow today — every number cited, nothing invented.',
  },
  {
    index: '04',
    name: 'Recipes & meal plans',
    blurb: 'Every meal comes with a full recipe and a shoppable weekly plan — swap, save, and reshuffle to taste.',
  },
] as const;

/* =====================================================
   FAQ — objections, answered honestly
   ===================================================== */
export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: 'Is this medical or nutritional advice?',
    a: 'No — Celebase is educational, not medical advice. Talk to a doctor or dietitian before changing how you eat, especially on medication or with a health condition.',
  },
  {
    q: 'How is a celebrity plan personalized to me?',
    a: 'We keep the eating pattern but recompute the numbers — your calories, a protein-first macro split for your goal, and swaps for what you’ll actually eat. Never the celebrity’s exact portions.',
  },
  {
    q: 'Does AI choose my meals?',
    a: 'Yes — an AI ranks and selects each meal from a vetted, allergen-safe pool, and explains every pick. It never invents numbers (those come from USDA and NIH) or overrides your allergen filters.',
  },
  {
    q: 'Where do the numbers come from?',
    a: 'Every value comes from USDA FoodData Central and NIH ODS — never invented by a model. Each recommendation carries its citation.',
  },
  {
    q: 'Are the celebrities affiliated with Celebase?',
    a: 'No. Each Decode is built from publicly reported information and labelled “inspired by” — Celebase is not affiliated with, endorsed by, or sponsored by any celebrity.',
  },
  {
    q: 'When does it launch, and what will it cost?',
    a: 'Coming to iOS and Android in 2026 — pricing will be shared at launch.',
  },
] as const;
