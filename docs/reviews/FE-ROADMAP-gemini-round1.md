YOLO mode is enabled. All tool calls will be automatically approved.
YOLO mode is enabled. All tool calls will be automatically approved.
MCP issues detected. Run /mcp list for status.```json
{
  "status": "needs_revision",
  "reasons": [
    "The Cross-Platform Design System strategy is fundamentally flawed: CSS Modules (planned for ui-kit) cannot be shared with React Native (Phase 2), necessitating a total rewrite of the component library later.",
    "Next.js App Router (likely on Vercel/Serverless) is incompatible with long-lived WebSockets for the meal-plan stream (002-4a) without an external stateful proxy or pub/sub provider (Ably/Pusher/Socket.io on dedicated infra).",
    "Sprint B has a high 'Integration Debt' risk: 22 chunks for a solo dev creates massive rebase/merge overhead without a clear 'Continuous Integration' deployment strategy (Vercel/Preview branches).",
    "Critical Auth/BFF bottleneck: Chunks 002-0f-1/2 (Auth hook/callback) are sequential blockers for all functional UI chunks, yet they are buried midway through the list.",
    "Missing PHI Access Audit Logging: Sentry/PostHog track errors/events, but 'Production-Grade' health apps require an immutable audit trail of WHO accessed WHICH user's health data (BioProfile/DailyLogs) for HIPAA/GDPR compliance."
  ],
  "suggestions": [
    "Pivot from CSS Modules to a 'Style-Dictionary' or 'Tamagui' approach in Phase 1 (IMPL-DS-001) to ensure the ui-kit is truly cross-platform for the RN Phase 2.",
    "Explicitly architect the WebSocket strategy: Use a stateful backend (AWS ECS/EC2) or a managed provider, and document the 'Hydration Strategy' for streaming content in RSC.",
    "Front-load Auth: Move 002-0f-1/2 to the very next slot (after 0d/0e) to unblock walkable testing of the Wizard and Plans.",
    "Add a 'Security Audit' chunk to Phase 2 for implementing a server-side audit log for all PHI-touching BFF routes.",
    "Define a Deployment Strategy: Map gates to CI/CD stages (e.g., 'fe_contract_check' on PR, 'Evaluator runtime' on Merge to Staging)."
  ],
  "evidence": [
    "Roadmap mentions 'CSS-modules via scripts/copy-css.mjs' and 'Tamagui... evaluated later' (Q8), which conflicts with the 'Phase 2 RN' goal.",
    "Roadmap chunk 002-4a 'useMealPlanStream' assumes standard WS in an App Router context without addressing serverless timeout/state limitations.",
    "Sprint B table shows 18 'queued' chunks with functional UI (wizard/plans) depending on hooks (002-0f-2) that aren't built yet."
  ]
}
```

## Independent Blind Spots (Gemini Review)

### A. Developer Experience (DX) & Atomic Fatigue
The chunking strategy (22 + 15) is **over-atomized**. For a solo developer, the overhead of context-switching, branch management, and `IMPL-LOG` entry for 37+ chunks will consume ~20% of total velocity. 
*   **Risk:** "Integration Hell" at the end of Sprint B where 22 isolated chunks fail to form a cohesive "walkable" app due to subtle state mismatches between the BFF and Client Islands.
*   **Fix:** Consolidate logical units (e.g., merge 002-1a-1/2 and 002-1b into a single "Auth Entry" chunk).

### B. The "Serverless WebSocket" Trap
Next.js App Router is optimized for request-response. If the backend is a Python `meal-plan-engine` (as seen in the file tree) and the FE is on Vercel, a direct WebSocket (`useMealPlanStream`) will fail due to 30-second execution limits on Serverless Functions.
*   **Blind Spot:** The roadmap lacks a **Connection Management** strategy. Does the BFF proxy the WS? If so, where does that proxy live?
*   **Hydration Risk:** Streaming data into an RSC layout often triggers "Hydration failed" errors if the server-rendered initial state doesn't perfectly match the first frame of the WS stream.

### C. Data Architecture & BFF Fragility
The BFF pattern is currently a "pass-through."
*   **Missing Piece:** **Resilience Patterns.** There is no mention of `React Query` or `SWR` for client-side caching/retries. If the BFF is down, the app is a brick.
*   **IDOR/Security:** While `003-0e` mentions normalization, it lacks a **Zod-based Response Filter**. The BFF should explicitly strip sensitive fields from the Python engine's response before it ever hits the browser.

### D. Design System: The Web-Only Dead End
Choosing CSS Modules now while planning a React Native app in Phase 2 is a **high-cost architectural pivot** waiting to happen. 
*   **Challenge:** You cannot "transpile" CSS Modules to RN Stylesheets effectively. 
*   **Suggestion:** If "Phase 2 Scale" is a real goal, the design system remediation (IMPL-DS-001) should use **Atomic CSS (Tailwind)** or **CSS-in-JS (Tamagui/Vanilla-Extract)** to allow for shared logic between Web and Native.

### E. Sprint B Critical Path (The "Locked Door")
The current sequence is functionally inverted.
*   **Issue:** Chunks `002-2a` through `002-4d` (the meat of the app) require an authenticated session, but the `useAuth` hook and callback logic (`002-0f-1/2`) are scheduled *after* the wire schemas.
*   **Bottleneck:** You cannot "walk" the app or use the Evaluator-runtime tool effectively if you can't get past the login redirect.

### F. Subscription & Webhook Reliability
*   **Blind Spot:** **Stripe Idempotency.** The roadmap mentions webhooks (`002-0e`) but ignores the "Incomplete Payment" state. Users will get "Generation" errors if the meal-plan engine starts before the Stripe webhook finishes processing.
*   **PCI/Mobile:** RN Stripe integration requires native modules. The "BFF-only" approach won't work for Apple Pay/Google Pay in Phase 2.

### G. Internationalization (i18n) & SEO
*   **SEO:** The path-prefix (`/ko/...`) strategy is good, but lacks a plan for **Metadata/Hreflang** injection. Korean search engines (Naver) have different crawler behaviors than Google.
*   **RTL:** "Scaffolding only" (Q5) is dangerous. Retrofitting logical properties (`padding-inline`) into 24+ components later is a recipe for visual regressions. It must be in the `ui-kit` DoD from Day 1.

### H. Testing: The BFF Gap
*   **Blind Spot:** The 80% coverage goal excludes the `apps/web/src/app/api` directory (the BFF). In a production-grade app, the logic that handles **Session Rotation** and **Error Normalization** is the most likely to break and the most critical to secure. 
*   **Suggestion:** Add **Supertest** or **Playwright API tests** specifically for the BFF layer.

### I. Observability: PHI Audit Trail
*   **Missing Mandate:** Sentry tracks *what* went wrong. PostHog tracks *what* the user did. Neither tracks **"Who viewed this PHI?"**
*   **Requirement:** A "Production-Grade" health app needs a `middleware` or `BFF` decorator that logs "User A accessed MealPlan B for User C" to a secure, searchable log (e.g., CloudWatch/Datadog) for compliance audits.

### J. Infrastructure & "The Big Green Button"
*   **Blind Spot:** **Deployment & Rollback.** The roadmap is a "Build Plan," not a "Release Plan."
*   **Questions:** How are secrets managed across environments? Is there a `preview` environment for the `Evaluator-runtime` to run against before merging to `main`? What happens if `002-0e` (Stripe) breaks production—is there a one-command rollback?
