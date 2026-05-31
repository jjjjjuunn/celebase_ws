# Landing — content pass (Celebrity Decode showcase + mission + FAQ)

> Scope of this pass: **content + motion only, design foundation kept.** No
> redesign — existing `--cb-*` tokens, type scale, section grammar, and
> components are the baseline. Work limited to `apps/web/src/app/page.tsx`,
> `apps/web/src/landing/**`, and `apps/web/public/cardnews/**`.

## What changed

- **New section — Celebrity Decode showcase** (`CardNewsShowcase.tsx`, id `#decode`).
  The centerpiece, styled in the current design system:
  - **Featured Decode, slide-by-slide** — the real Cameron Diaz card-news set
    (6 slides) in a scroll-snap filmstrip. Each slide is captioned with its
    arc stage (hook → what she does → what science says → the catch →
    rescaled to you → your turn) so a visitor sees both the craft and the
    structure of a Decode.
  - **How we make each one** — the editorial pipeline
    (scout → research → verify → grade → decode & rescale → publish).
  - **More in the feed** — cover strip of four more published decodes
    (Jennie, Zendaya, Sabrina Carpenter, Jeremy Allen White).
  - **What you get** — the three flagship features (Decode feed, rescale
    engine, one-tap plan).
  - Visible, never-`aria-hidden` disclaimer: editorial / inspired by /
    not affiliated, endorsed, or sponsored.
- **New section — FAQ** (`Faq.tsx`, id `#faq`). Native `<details>/<summary>`
  accordion (works with zero JS, keyboard-accessible). Five honest objections:
  medical advice, personalization, source of numbers, celebrity affiliation,
  launch/cost.
- **data.ts** — added `FEATURED_DECODE`, `MORE_DECODES`, `DECODE_PIPELINE`,
  `FLAGSHIP_FEATURES`, `FAQ_ITEMS` (+ `DecodeSlide`, `CardNewsSet`, `Flagship`,
  `FaqItem` types). Engine numbers unchanged (still grounded in
  `services/meal-plan-engine`).
- **AI surfaced (honest framing)** — the app's AI is now explicit, grounded in
  the real `llm_reranker.py` (LLM Reranker + Narrator). Added to: hero axis 02
  ("our AI engine"), the Engine intro + Pass-2 step ("AI selects & ranks each
  meal from the safe pool"), a transparent-AI safety point ("ranks recipes, never
  overrides safety"), flagship "The AI plan engine", the `AI decode & rescale`
  pipeline step, and a new FAQ ("Does AI choose my meals?"). Framing stays true to
  the engine: the AI only picks from a vetted, allergen-safe pool, never invents
  numbers (USDA/NIH), never overrides allergen filters or the safe calorie band.
- **Section renumber + nav** — Decode 01, Feed 02, Engine 03, Payoff 04, FAQ 05.
  `TopNav` gains a `#decode` link.
- **CSS** — appended showcase + FAQ classes to `landing.module.css`
  (`blockLabel`, `decodeStrip`, `decodeFigure`, `moreStrip`, `flagshipBand`,
  `flagshipGrid`, `faqList`, `faqItem`, …). All color/space/radius via `--cb-*`
  + `color-mix`; reduced-motion + 768px responsive guards added.

## Assets (provenance)

Self-produced brand card news, copied into `apps/web/public/cardnews/<slug>/`:

| Set | Files | Source | Notes |
|---|---|---|---|
| cameron-diaz | `1–6.png` (1080×1350, ~1.2–1.5 MB) | `~/Downloads/cameron-slide-1…6.png` | Newest typographic format — **no photo**, carries its own disclaimer slide. |
| jennie | `1.jpg`, `5.jpg` | `카드뉴스/제니/{1,5}.png` | Resized to ≤1080px, JPEG q82 (~200–270 KB). |
| zendaya | `1.jpg` | `카드뉴스/젠다이아/1.png` | ” |
| sabrina-carpenter | `1.jpg` | `카드뉴스/사브리나 카펜더/1.png` | ” |
| jeremy-allen-white | `1.jpg` | `카드뉴스/제레미 알렌 화이트/1.png` | ” |

All rendered via plain `<img loading="lazy">` (no `next/image`, no
`next.config` change). The older sets embed a real celebrity portrait; the
visible disclaimer + "inspired by" framing is the mitigation. **Likeness note:**
embedding real-celebrity portraits on the public marketing surface is a
deliberate product decision — flagged here for legal review before launch.

## Verification (this pass)

- `bash scripts/gate-check.sh fe_token_hardcode` → **passed** (0 raw hex).
- `pnpm --filter web typecheck` → **0 errors**.
- `pnpm --filter web lint` → **0 landing warnings** (two intentional
  `@next/next/no-img-element` lines suppressed inline with justification).
- `pnpm --filter web build` → **success**; `/`, `/terms`, `/privacy` all emit.
- `next dev` → `/` **200**; all new content present in SSR HTML; all six
  `/cardnews/*` images return 200.
- **No-JS failsafe** — SSR HTML has 0 `opacity:0` / `display:none` /
  `visibility:hidden` on content.
- **Reduced motion** — no new keyframe entrance animations; hover/transition
  on new elements guarded under `prefers-reduced-motion: reduce`; reveals reuse
  the existing failsafe `Reveal`.

## Recommended (not run here)

- 1440 / 768 / 375 screenshots + `axe` (serious/critical 0) on a machine with
  the Playwright MCP.
- Legal sign-off on real-celebrity portraits in `more in the feed`.
