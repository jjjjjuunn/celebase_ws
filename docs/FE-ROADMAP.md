# CelebBase Wellness — Frontend Roadmap

> North-star planning document. Complements `spec.md` and per-sprint `IMPL-APP-*` plans.
> Updated after Codex + Gemini blind-spot reviews (2026-04-19).

| Version | Date | Author | Change |
|---|---|---|---|
| v0.1 | 2026-04-19 | JUNWON | Initial draft post Sprint-B 002-0c merge |

---

## 1. Context

Sprint A (foundation) has shipped. Sprint B (IMPL-APP-002) is mid-flight — 4 of 22 chunks merged (`002-0a-1`, `002-0a-2`, `002-0b`, `002-0c`). The product is **not yet walkable**: `(app)` / `(auth)` / `(marketing)` route groups have layouts only, no `page.tsx`. Only `/slice/*` preview pages render.

This document is the long-range north star for:
- Sprint B remaining 18 chunks
- Sprint C polish (IMPL-APP-003-*)
- Phase 2 scale (mobile, coaching, reminders, grocery)
- Design system remediation (IMPL-DS-*)
- Cross-cutting tracks (a11y, i18n, perf, observability, security, testing, CMS, delivery)

---

## 2. Current State (2026-04-19)

### Route tree
- `apps/web/src/app/slice/*` — component previews (only walkable pages)
- `(app)/`, `(auth)/`, `(marketing)/` — layouts only, no page.tsx
- `api/` — 18 BFF routes shipped
- Root `/` → redirects to `/slice`

### BFF layer
| File | Purpose |
|---|---|
| `_lib/session.ts` | HS256 verify + rotation overlap (`INTERNAL_JWT_SECRET_NEXT`) + `createProtectedRoute` / `createPublicRoute` |
| `_lib/bff-fetch.ts` | Server-side fetcher, throws `SessionExpiredError` on 401 |
| `_lib/bff-error.ts` | Error normalizer |
| `middleware.ts` | Cookie guard + baseline CSP |

### UI-kit shipped
**Primitives**: Badge, Button, Card, Chip, Input, Stack, Text  
**Composites**: InputField, SegmentedControl, SelectField, SlotChip, SlotChipGroup  
**Hook**: `useRovingTabIndex`  
**Theme**: ThemeProvider, ThemePrePaintScript  
12 Storybook stories. CSS-modules via `scripts/copy-css.mjs`.

### Shared-types schemas
`_utils`, `auth`, `users`, `bio-profiles`, `celebrities`, `recipes`, `meal-plans`, `daily-logs`  
**Next**: `subscriptions` (002-0d, barrel-serial after 002-0c)

### Design tokens gap
`packages/design-tokens/tokens.css` (151 lines) is missing vs DESIGN.md:
- §2.4 Persona accents (4 vars), §2.5 Tier tokens (9 vars), §2.6 Chart (5 vars), §2.7 Skeleton (2 vars)
- §3.2 Type-scale semantic tokens, §3.3 Semantic `.cb-*` classes
- §4 Layout, §5 Radius (xs/xl/circle), §6 Shadow (card-photo/brand)
- §9 Breakpoints, §10 Motion + easing, §11 Icon sizes

Sister repo source: `CelebBase Design System/colors_and_type.css` (270 lines) has all of the above.

### Bundle baseline (measured 2026-04-19)
```
First Load JS shared by all   102 kB
/slice/primitives              110 kB
/slice/composites              110 kB
```
This is **before** Stripe, Sentry, PostHog, React Hook Form are added. Auth ≤120 kB budget is already tight.

---

## 3. Architecture Decisions

### ADR-001: WebSocket Architecture
**Decision**: Direct WebSocket from browser to backend (via reverse proxy); Next.js BFF does NOT proxy the WS connection.

**Rationale**: Vercel/serverless environments have a 30-second execution limit. A BFF-proxied WebSocket would be severed by the serverless function lifecycle. The `useMealPlanStream` hook (002-4a) connects directly to the backend WS endpoint using the internal JWT for auth. The BFF only creates the session; the WS URL is resolved server-side (allowlisted) and returned to the client.

**Hydration risk**: The meal-plan stream initial state is rendered as `null` server-side. Client hydration fills it. The RSC layout must not try to render streaming data — only the `'use client'` island reads from the WS hook.

**Fallback**: If WS drops (mobile network transition), the hook falls back to REST polling (`GET /meal-plans/{id}`) with jittered exponential backoff.

### ADR-002: CSS Modules vs Cross-Platform
**Decision**: CSS Modules for web (Sprint B/C). Evaluate migration to vanilla-extract or Tamagui before mobile kickoff.

**Rationale**: CSS Modules work for web today and IMPL-DS-* is already structured around them. However, CSS Modules cannot be shared with React Native. Before Phase 2 (mobile), we must decide: (a) separate `ui-kit-native` package mirroring API surface, or (b) migrate to Tamagui which handles web+RN with one API. This is **Q12** (see Open Questions). The CSS Modules approach is not a dead end if we isolate component APIs cleanly and duplicate only the styles.

### ADR-003: Marketing Pages Render Strategy
**Decision**: Marketing `(marketing)` route group uses SSG/ISR with `revalidate = 3600`. Celebrity list page uses ISR with `revalidate = 300`. App pages are RSC with dynamic rendering.

**CDN policy**: CloudFront for static assets + ISR cache. `Cache-Control: public, max-age=60, stale-while-revalidate=300` on ISR routes. PHI-adjacent routes: `no-store`.

---

## 4. Target State SLOs

| Dimension | Metric | Threshold | Tool |
|---|---|---|---|
| Perf | Lighthouse Performance | ≥90 mobile 4G, golden-path routes | Lighthouse CI |
| Web Vitals | LCP / INP / CLS p75 | <2.5s / <200ms / <0.1 | web-vitals + PostHog |
| A11y | axe serious/critical | 0 | @axe-core/playwright, jest-axe |
| Bundle | First-load JS gzipped | `(auth)` ≤120 kB, `(app)` ≤180 kB, `(marketing)` ≤140 kB | size-limit CI |
| i18n | KO/EN key parity | 100% | parity script |
| Observability | Session error-free rate p95 | ≥99% | Sentry + PostHog |
| Security | CSP strict, Trusted Types, SRI, PHI redaction | enforced | middleware |
| Testing | Coverage `apps/web/src/lib` + `ui-kit` + **BFF routes** | ≥80% | Jest |
| SEO | Lighthouse SEO, marketing | ≥95 | Lighthouse CI |

> **Bundle budget note**: auth route currently measures 110 kB before Stripe/Sentry/PostHog. Use server-only Stripe import (`import 'stripe'` not `@stripe/stripe-js`), lazy Sentry init, and server-side PostHog where possible. Budget owner per route group required before each SDK addition.

---

## 5. Sprint B — Remaining Chunks

4/22 merged. 18 remaining.

### Critical path (auth-first)
Chunks `002-0f-1` and `002-0f-2` (auth callback + `useAuth` hook) are **critical path blockers** for all UI chunks. Without `useAuth`, the wizard (002-2a-c), celebrity pages (002-3*), and plan pages (002-4*) cannot have an authenticated session to test against. These must land before any functional UI chunk is considered "walkable."

Recommended execution order within Sprint B:

| ID | Title | Priority | Dependency |
|---|---|---|---|
| 002-0d | subscriptions BFF + schema | next | serial after 002-0c barrel |
| 002-0e | Stripe webhook + cancel + personalized recipes | queued | 002-0d |
| **002-0f-1** | **authorize-url + callback routes** | **critical path** | 002-0e |
| **002-0f-2** | **useAuth hook + jest polyfills** | **critical path** | 002-0f-1 |
| 002-1a-1 | AuthCard composite | queued | 002-0f-2 |
| 002-1a-2 | SSOButton composite | queued | serial after 002-1a-1 |
| 002-1b | /login + /signup pages | queued | 002-1a-2 |
| 002-2a | BioProfileWizard shell (4-step flat) | queued | 002-1b |
| 002-2b | wizard steps 1+2 + middleware PROTECTED_PATHS | queued | 002-2a |
| 002-2c | wizard steps 3+4 (meds + disclaimer) | queued | 002-2b |
| 002-3a-1 | CelebrityCard composite | queued | 002-0f-2 |
| 002-3a-2 | CategoryTabs composite | queued | serial after 002-3a-1 |
| 002-3b | /celebrities list page | queued | 002-3a-2 |
| 002-3c | /celebrities/[slug] + base-diet detail | queued | 002-3b |
| 002-4a | useMealPlanStream hook + tests | queued | 002-3c |
| 002-4b | WsStatusBanner + /plans/new | queued | 002-4a |
| 002-4c | /plans + /plans/[id] + Confirm island | queued | 002-4b |
| 002-4d | recipe detail + dashboard | queued | 002-4c |

**Exit criteria**: all 22 chunks merged + IMPL-LOG entries + 5 gates green (`fe_contract_check`, `fe_bff_compliance`, `fe_token_hardcode`, `fe_slice_smoke`, `fe_be_probe` advisory) + Evaluator browser walkthrough at 375/768/1440.

---

## 6. Sprint C — Polish (IMPL-APP-003-*)

D24 parking lot + full feature completeness. Runs after Sprint B exit criteria.

| ID | Title | spec.md § | Sister-repo anchor | Exit criterion |
|---|---|---|---|---|
| 003-0a | `[locale]` URL routing (`/en/`, `/ko/`) | §8.1 | — | middleware locale-redirect; hreflang tags; Naver sitemap |
| 003-0b | Nonce-based strict CSP | §12 | — | report-only → enforce migration; Trusted Types report |
| 003-0c | Root `/` redirect to /login | §5.1 | — | unauthenticated `/` → 302 /login |
| 003-0d | Per-route-group `error.tsx` + `loading.tsx` | §5.2 | — | EmptyState, ErrorState, skeleton coverage |
| 003-0e | BFF constant-time response normalization | §12 | — | IDOR timing side-channel closed; test suite |
| 003-1a | `/track` shell + MacroBar + WeightChart | §8.5 | Discover.jsx | Track tab renders; MacroBar tokens; axe 0 |
| 003-1b | Track quick-log drawer + FAB | §8.5 | — | Drawer opens/closes; daily log POST wired |
| 003-2a | `/account/subscription` UI | §7.2 + §7.14 | PricingAndPlan.jsx | Stripe portal link; tier badge; upgrade CTA |
| 003-2b | Tier-gating hook + `<TierGate>` | §7.14 | PricingAndPlan.jsx | Free tier sees gate overlay; premium passes |
| 003-3a | Personalized recipes UI | §8.4 | — | Recipe list renders with persona filter |
| 003-4a | BioProfileWizard steps 5–9 (OCR, summary, category, diff) | §6 | — | Full 9-step wizard walkable |
| 003-4b | Two-pass diff progress view | §6 | — | Diff renders; progress bar animates |
| 003-5a | Dashboard data-integrated summary | §8.2 | Discover.jsx | PlanDayCard + Metric widgets wired |
| 003-6a | Celebrity Hero expansion | §7.6 | Discover.jsx | Hero image loads; expandable section |
| 003-6b | DisclaimerBanner + legal copy surface | §7.10 | — | Health disclaimer visible on PHI pages |

> **Sequencing note**: `003-2b` (TierGate hook) must land before `003-2a` (subscription UI). `003-0a` (locale routing) must land before any marketing SEO work. `error.tsx` (003-0d) reserves App Router special file names — must land before screen work that needs them.

**Exit criteria**: MVP ready for beta waitlist; Lighthouse ≥90 home/celebrities/plans; axe clean; KO parity 100%.

---

## 7. Phase 2 — Scale (Post-MVP Milestones)

| Milestone | Title | Gate to start |
|---|---|---|
| M1 | Mobile scaffolding (Expo managed + expo-router) | Web onboarding/discover/plan/track/profile shipped; ≥500 paying users; ADR-002 decided |
| M2 | Coaching Copilot UI (streaming panel, tool-calling) | M1 scaffolding + `coaching` API shipped |
| M3 | Reminders & Push (VAPID web push + Expo push) | M1 + UX designs approved |
| M4 | Grocery integration (Kroger + Instacart) | M1 + grocery API contracts signed |
| M5 | Advanced dashboard analytics (trend, cohort, CSV) | M2 + analytics event taxonomy v2 |
| M6 | Social/sharing (share cards, referral, privacy links) | M5 + legal review |

> Mobile kickoff gate is **business-validated** (≥500 paying users), not just calendar-based. See Risk R12.

---

## 8. Design System Remediation (IMPL-DS-*)

Runs **parallel to IMPL-APP-***, but with token freeze points. Tokens must land before the consumer chunks that use them.

| ID | Title | Deliverable | Token freeze point |
|---|---|---|---|
| IMPL-DS-001-a | Token expansion — persona/tier/chart/skeleton | §2.4–2.7 vars in `tokens.css` | Before 002-3a-1 |
| IMPL-DS-001-b | Token expansion — type scale + semantic classes | §3.2 + §3.3 `.cb-*` classes | Before 002-2a |
| IMPL-DS-001-c | Token expansion — layout/radius/shadow/bp/motion/icon | §4/5/6/9/10/11 | Before 003-1a |
| IMPL-DS-002-a | ui-kit primitives consume `.cb-*` classes | Remove inline typography sizes | After 001-b |
| IMPL-DS-002-b | `tokens.native.ts` regeneration for RN parity | `scripts/build.ts` handles new vars | Before M1 |
| IMPL-DS-003-a | Composite anchoring §7 — Button variants, Cards A–E, Input states, Toast, Modal, Disclaimer | — | After 001-c |
| IMPL-DS-003-b | Composite anchoring — TabBar, FAB, TopNav, Onboarding Nav | — | After 003-a |
| IMPL-DS-004-a | Storybook coverage ~12 → ~24 stories | Default/loading/empty/error/disabled/dark/RTL per composite | After 003-b |
| IMPL-DS-004-b | Storybook interaction tests (@storybook/test + Vitest) | a11y + keyboard per story | After 004-a |
| IMPL-DS-005 | Visual regression (Chromatic) | Baseline snapshot; CI gate | After 004-b |

**Per-batch DoD**: token diff vs sister-repo = zero drift; `fe_token_hardcode` clean; Storybook Tokens.stories.tsx visual parity; rollback recipe documented.

**RTL requirement**: logical CSS properties (`padding-inline`, `margin-block`, `inset-*`) enforced in ui-kit from IMPL-DS-002-a onward via lint rule. Not deferred — retrofitting 24 components is higher cost.

---

## 9. UI-Kit Completion

### Sprint B composites (6)
| Composite | Chunk | Hook? | Anchor |
|---|---|---|---|
| AuthCard | 002-1a-1 | no | new |
| SSOButton | 002-1a-2 | no | new |
| WizardShell | 002-2a | yes (`'use client'`) | new |
| CelebrityCard | 002-3a-1 | yes | Discover.jsx |
| CategoryTabs | 002-3a-2 | yes (`useRovingTabIndex`) | Discover.jsx |
| WsStatusBanner | 002-4b | yes | new |

### Sprint C composites (14)
| Composite | Chunk | Anchor |
|---|---|---|
| TabBar | 003-1a | DESIGN.md §7.3 |
| FAB | 003-1b | §7.4 |
| PlanDayCard | 003-5a | Discover.jsx |
| Metric | 003-1a | `--cb-metric-*` |
| MacroBar | 003-1a | chart §2.6 |
| TierCard | 003-2a | PricingAndPlan.jsx |
| SubscriptionCard | 003-2a | PricingAndPlan.jsx §7.2 |
| DisclaimerBanner | 003-6b | §7.10 |
| EmptyState | 003-0d | §7.13 |
| ErrorState | 003-0d | §7.14 |
| Toast | 003-0d | §7.12 |
| Modal | 003-1b | §7.11 |
| Hero variants | 003-6a | Discover.jsx §7.6 |
| `<TierGate>` | 003-2b | PricingAndPlan.jsx §7.14 |

**Per-composite DoD**: `'use client';` if hooks used; CSS module copied; Storybook story (default/loading/empty/error/disabled/focused/hover/dark/RTL); keyboard matrix; axe 0; `fe_token_hardcode` clean; barrel re-export; bundle delta declared.

### DESIGN.md §7 coverage gap (tracked, no chunk yet)
Components required by spec but not yet assigned a chunk. These must be assigned before Sprint C execution:
- HealthDisclaimer (full component), Skeleton system, CardEditorial, CardMetric, CardPlanDay, CardTier, CardCheckout, CardHistoryRow, onboarding screens S0–S7 persona-first flow (PersonaSelect → BasicInfo → BodyMetrics → ActivityHealth → Goals & Diet → BlueprintReveal; see spec.md §7.1 revision 2026-04-22), support/help components.

### Pivot-2026-05 additions (LifestyleClaim feed)
| Composite | Task ID | Hook? | Anchor | Status |
|---|---|---|---|---|
| ClaimCard (ui-kit primitive) | IMPL-UI-031-a | yes (`'use client';`, expand state) | `docs/design/claim-card-feed/A-card-catalog.html`, spec.md §7.2 | **Merged** (PR #32, 1f78239) |
| ClaimCard slice preview + Storybook story | IMPL-UI-031-b | n/a | `apps/web/src/app/slice/claim-card/page.tsx` | Queued (after `-a` merges) |
| Wellness Claims Feed page (`/feed`) | IMPL-UI-032 | yes | spec.md §7.2 Tab 1 | Not started; depends on ClaimCard primitive |

---

## 10. Cross-Cutting Tracks

### Track A — Accessibility
`@axe-core/react` dev overlay; `jest-axe` unit; `@storybook/addon-a11y`; `@axe-core/playwright` E2E. Gate `fe_axe` blocking on UI PRs. Keyboard matrix per composite. Manual VoiceOver + NVDA each sprint close. Token-pair contrast ≥4.5:1 text / ≥3:1 large automated via `packages/design-tokens/scripts/contrast-check.ts`.

### Track B — Internationalization
`003-0a` delivers `[locale]` URL routing. KO 100% key parity via CI script. `Intl.*` + ICU for plurals. **hreflang** tags + Naver sitemap (`robots.txt` + `sitemap.xml` with alternate links) for KO SEO. RTL: logical CSS properties from IMPL-DS-002-a (not deferred).

### Track C — Performance
Bundle budgets enforced via `size-limit` CI. Measured baseline: 102 kB shared today. Each chunk declares expected bundle delta before acceptance. `next/image` mandatory. Self-hosted variable fonts via `next/font`. `web-vitals` reporting. Stripe: server-only import. Sentry/PostHog: lazy init.

### Track D — Observability
Sentry browser + server SDK (lazy). `web-vitals` → PostHog (default). Event taxonomy in `docs/analytics-events.md`. Request-id propagation middleware → BFF → Sentry. **PHI redaction before-send scrubber**: all `bio_*`, `health_*`, `medication*`, `biomarker*` keys stripped from Sentry events and PostHog properties. PHI access audit trail is separate (`phi_access_logs` table — not Sentry/PostHog).

### Track E — Security
`003-0b` strict CSP (nonce); Trusted Types (report-only → enforce); SRI on CDN scripts; session rotation runbook quarterly; `003-0e` constant-time BFF normalization (IDOR). **BFF test coverage**: `apps/web/src/app/api` routes included in the ≥80% coverage target (Session + error normalization are highest-risk paths).

### Track F — Testing
Jest unit ≥80% on `lib` + `ui-kit` + **BFF routes**; polyfills in 002-0f-2; `@storybook/test` + Vitest ≥1 interaction test per composite; Playwright E2E at 375/768/1440; visual regression baseline (Chromatic); `fe_contract_check` blocking + `fe_be_probe` advisory; BFF tested via Supertest/Playwright API tests.

### Track G — Content & CMS
Celebrity and base-diet data maintenance requires an authoring pipeline before Phase 2.
- **Phase 1**: Manual via `POST /admin/celebrities/:id/diets` + `base_diet.updated` event (spec.md §1303-1309).
- **Phase 2**: Admin UI or headless CMS integration (TBD). Add to Open Questions Q13.
- Moderation/versioning: celebrity profile updates go through review queue; no direct-to-prod publish.

### Track H — Infrastructure & Delivery
- **Deployment**: Vercel (web) + GitHub Actions CI/CD. Preview environments on every PR.
- **Rollback**: Vercel instant rollback to previous deployment via CLI (`vercel rollback`). One-command rollback procedure documented in `docs/runbooks/rollback.md`.
- **Secrets**: AWS Secrets Manager / Vercel environment variables. No `.env` in CI logs.
- **ISR/CDN**: CloudFront + Vercel Edge Network. Cache headers per ADR-003. Invalidation via `revalidatePath` on `base_diet.updated` events.
- **Feature flags**: PostHog feature flags for gradual rollout (not a separate tool).

---

## 11. Gates & Verification

| Gate | Scope | Status |
|---|---|---|
| fe_contract_check | FE↔BE wire contract | blocking |
| fe_bff_compliance | BFF helpers mandatory | blocking |
| fe_token_hardcode | no hex/px outside tokens | blocking |
| fe_slice_smoke | /slice/* renders 200 | blocking |
| fe_be_probe | FE↔BE round-trip | advisory → blocking after fixture stability |
| fe_axe | axe 0 serious/critical | Track A rollout |
| fe_i18n_coverage | KO/EN parity | 003-0a |
| Lighthouse CI | Perf ≥90 golden paths | Track C |
| size-limit | bundle budgets per route group | Track C |
| Storybook build | stories compile | active |
| Chromatic | visual regression baseline | IMPL-DS-005 |
| Coverage threshold | ≥80% lib/ui-kit/BFF | Track F |

**Evaluator runtime check**: browser tool walks golden paths at 375/768/1440 capturing screenshots + console errors. Required on all UI-touching chunks.

---

## 12. Risk Register

| ID | Risk | L/I | Mitigation |
|---|---|---|---|
| R1 | Design system drift | H/H | IMPL-DS-* parallel; `fe_token_hardcode` blocking; sister-repo single source |
| R2 | Scope creep C → B | H/M | strict chunk allowlist; D24 parking frozen |
| R3 | RN intro timing | M/M | business gate (≥500 paying users) + web parity prerequisite |
| R4 | A11y regression | M/H | `fe_axe` blocking; per-composite DoD; RTL from DS-002-a |
| R5 | PHI in analytics/logs | L/Crit | Sentry before-send scrubber + PostHog denylist + `phi_access_logs` separate |
| R6 | CSP breakage on strict upgrade | M/H | report-only sprint before enforce; report-count monitoring |
| R7 | Bundle budget violation | M/M | server-only Stripe; lazy Sentry/PostHog; per-chunk delta declaration |
| R8 | Token naming drift (essential/pro vs premium/elite) | M/M | default: sister-repo (premium/elite); overwrite DESIGN.md after Q1 resolved |
| R9 | WS meal-plan stream disconnects on mobile | M/H | WsStatusBanner; REST polling fallback with jittered backoff; ADR-001 |
| R10 | i18n URL retrofit SEO churn | M/M | 301 redirects; sitemap update; canonical + hreflang tags |
| R11 | Auth 002-0f-1/2 scheduling creates walkability gap | H/M | Prioritize 002-0f-1/2 immediately after 002-0e; no functional UI before auth hook |
| R12 | CSS Modules dead end for RN | M/H | ADR-002; evaluate Tamagui before M1; isolate component APIs cleanly |
| R13 | Stripe idempotency / incomplete payment state | M/H | Idempotency key on all Stripe API calls; webhook: process only `payment_intent.succeeded`; guard plan generation behind confirmed payment |
| R14 | Storybook 9 tooling churn (CSF3 migration) | M/M | Storybook 9 already in use (package.json); test-runner via Vitest (Q9 resolved) |
| R15 | Serverless WebSocket limitation | H/H | ADR-001: direct browser→backend WS; BFF only issues WS URL; REST polling fallback |
| R16 | OCR (AWS Textract) vendor lock-in | L/M | OCR abstracted behind `OcrProvider` interface; provider swappable without API change |

---

## 13. Open Questions

| ID | Question | Default | Resolve before |
|---|---|---|---|
| Q1 | Tier naming: essential/pro (DESIGN.md) vs premium/elite (sister repo) | sister-repo | IMPL-DS-001-a |
| Q2 | Product analytics: PostHog vs Mixpanel | PostHog | Sprint B exit |
| Q3 | Visual regression: Chromatic vs Percy | Chromatic | IMPL-DS-005 |
| Q4 | RN framework: Expo managed vs bare | Expo managed | M1 gate |
| Q5 | RTL investment timing | Logical CSS from DS-002-a; translations deferred | IMPL-DS-002-a |
| Q6 | Error tracking: Sentry vs Datadog RUM | Sentry + PostHog | Sprint B exit |
| Q7 | Web push provider | Self-host VAPID | M3 |
| Q8 | CSS methodology post-web | CSS Modules now; re-eval for RN | ADR-002 |
| Q9 | Storybook test runner | Vitest (@storybook/test) | IMPL-DS-004-b |
| Q10 | Locale URL strategy | Path-prefix `/en/...` `/ko/...` | 003-0a |
| Q11 | Bundle-size tool | size-limit | Track C rollout |
| Q12 | ui-kit cross-platform strategy | Separate `ui-kit-native` vs Tamagui migration | Before M1 gate |
| Q13 | Celebrity CMS authoring pipeline | Manual admin API Phase 1; headless CMS TBD | M1 |
| Q14 | Deployment target | Vercel + GitHub Actions | Track H |
| Q15 | Edge runtime scope | Middleware only; app routes Node runtime | 003-0b |

---

## 14. Dependency Graph (Critical Paths)

```
subscriptions schema (002-0d)
  → Stripe webhook (002-0e)
    → Auth callback (002-0f-1)              ← CRITICAL PATH GATE
      → useAuth hook (002-0f-2)             ← CRITICAL PATH GATE
        → AuthCard (002-1a-1) → SSOButton (002-1a-2) → /login /signup (002-1b)
          → BioProfileWizard (002-2a-2c)
        → CelebrityCard (002-3a-1) → CategoryTabs (002-3a-2)
          → /celebrities (002-3b) → /celebrities/[slug] (002-3c)
            → useMealPlanStream (002-4a)
              → WsStatusBanner + /plans/new (002-4b)
                → /plans + /plans/[id] + Confirm (002-4c)
                  → recipe detail + dashboard (002-4d)

IMPL-DS-001-a (tier/persona tokens) → must land before 002-3a-1
IMPL-DS-001-b (type scale) → must land before 002-2a
IMPL-DS-001-c (layout/motion) → must land before 003-1a
```

---

## 15. Per-Chunk DoD Template (IMPL-APP-003-* / IMPL-DS-*)

Every Sprint C and design-system chunk must include in its HANDOFF:

```
- Authoritative refs (spec.md § + DESIGN.md §)
- Scope (files to create/modify, max 5)
- Prerequisites (chunk IDs that must be merged first)
- Dependency edges (what this chunk unblocks)
- Route/component mapping (screen → component → BFF route)
- Verification commands (typecheck, lint, gate-check, Playwright)
- Disclaimer/a11y requirements (axe 0, keyboard matrix, health disclaimer)
- Bundle delta (expected kB impact on route group)
- Review tier (L2/L3/L4 per pipeline.md §167)
- Explicit out-of-scope items
```

---

## 16. Version History

| Version | Date | Change summary |
|---|---|---|
| v0.1 | 2026-04-19 | Initial post-Sprint-B-002-0c draft; incorporates Codex + Gemini blind-spot reviews |

---

*This document is reviewed and iterated each sprint. For per-chunk detail, see `pipeline/runs/IMPL-APP-*/CODEX-HANDOFF.md`.*
