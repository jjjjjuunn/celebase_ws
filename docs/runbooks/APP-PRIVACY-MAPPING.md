# App Privacy / Data Safety Mapping — CelebBase mobile (launch v1)

> CHORE-APP-PRIVACY-MAPPING-001 (Gate G2). Source-of-truth inventory the user
> transcribes into **App Store Connect → App Privacy** and **Google Play Console
> → Data safety**. Reflects launch-v1 PHI policy (PROD-DEPLOY-ROADMAP Decision A):
> medical_conditions + medications are **not collected** until post-BAA.
>
> Authored 2026-05-25 (autonomous). Re-confirm against live schemas before the
> store submission (G4). This is a mapping aid, not a substitute for legal review
> (pairs with the pending `COMPLIANCE-LAUNCH-V1.md`, CHORE-COMPLIANCE-DECISION-RECORD-001).

## 0. Global posture (read first)

- **Whole app is classified Health & Fitness** (Apple 5.1.3). Even the "trend-only"
  path is evaluated under health-data rules (Codex + Gemini HIGH).
- **"Used to track you" = NO for every data type.** We run **no ad networks, no
  IDFA/ATT, no cross-app/-site tracking, no data brokers**. No `AppTrackingTransparency`
  prompt is needed. Do not enable any "Tracking" toggle in App Privacy.
- **Data is sold = NO** (Google Data Safety / CCPA "sale").
- **All collected data is linked to the user account** unless noted (Diagnostics is
  pseudonymous — see §4).
- **Account deletion is in-app** (`DELETE /api/users/me`) — required by Apple 5.1.1(v)
  and satisfies Google's "users can request data deletion."

## 1. Data inventory (engineering source of truth)

| Data | Store / origin | Service | Classification | Encryption at rest | Notes |
|------|----------------|---------|----------------|--------------------|-------|
| email | Cognito + `users.email` | Cognito / user-service | Contact Info | managed (Cognito) / column | Auth identity |
| password | Cognito only | Cognito | Credentials | Cognito-managed | Never stored by us |
| cognito_sub | `users.cognito_sub` | user-service | Identifier | column | Maps Cognito ↔ internal user |
| internal user id | `users.id` (UUID) | user-service | Identifier | column | Primary key |
| display_name | `users.display_name` / onboarding | user-service | User Content | column | User-entered |
| subscription tier/status | `subscriptions` | commerce-service | Purchases | column | Mirror of RevenueCat/store |
| Apple refresh token | `users.apple_refresh_token_enc` | user-service | Credentials | **AES-256-GCM** | For 4.8.1 revoke; not exposed |
| allergies | `bio_profiles.allergies` (TEXT[]) | user-service | **Health & Fitness** | column (not PHI-encrypted) | Personalized path |
| intolerances | `bio_profiles.intolerances` | user-service | **Health & Fitness** | column | Personalized path |
| activity_level | `bio_profiles.activity_level` | user-service | **Health & Fitness** | column | Personalized path |
| body metrics (height_cm, weight_kg, waist_cm, body_fat_pct, birth_year, sex) | `bio_profiles` | user-service | **Health & Fitness** | column | Personalized path |
| biomarkers | `bio_profiles.biomarkers` (JSONB) | user-service | **Health & Fitness (sensitive)** | **AES-256** | **Not collected in v1 UI** (schema retained) |
| medical_conditions | `bio_profiles.medical_conditions` | user-service | **Health (sensitive)** | **AES-256** | **NOT collected v1** (Decision A; mobile hardcodes `[]`) |
| medications | `bio_profiles.medications` | user-service | **Health (sensitive)** | **AES-256** | **NOT collected v1** except GLP-1 boolean → `['glp1']` |
| daily logs (weight_kg, energy_level, mood, sleep_quality, notes, meals_completed) | `daily_logs` | analytics-service | **Health & Fitness** + User Content (`notes` free text) | column | Optional self-tracking |
| meal plans | `meal_plans` | meal-plan-engine | User Content / Health (derived) | column | Generated output |
| crash / error events | Sentry SaaS | all services + mobile | Diagnostics | n/a (3rd party) | **PHI-redacted** (see §4) |
| purchase transactions | App Store / Play / RevenueCat | commerce-service | Purchases | n/a (3rd party) | Receipt + entitlement |
| coarse request metadata (timestamps, request IDs) | structured logs | all services | (operational) | n/a | No PHI (pino redact) |

## 2. Apple App Privacy mapping (App Store Connect)

For each: **Collected? · Linked to user? · Used for tracking? · Purposes**. Tracking is
**No** everywhere (§0).

| Apple data type | Collected | Linked | Tracking | Purpose |
|-----------------|-----------|--------|----------|---------|
| **Contact Info → Email Address** | Yes | Yes | No | App Functionality (account/auth) |
| **Health & Fitness → Health** | Yes | Yes | No | App Functionality (personalized meal plans) |
| **Health & Fitness → Fitness** | Yes | Yes | No | App Functionality (activity level, daily logs) |
| **Identifiers → User ID** | Yes | Yes | No | App Functionality (account, purchases via RevenueCat app user id) |
| **Purchases → Purchase History** | Yes | Yes | No | App Functionality (subscription entitlement) |
| **User Content → Other User Content** | Yes | Yes | No | App Functionality (display name, daily-log notes, meal plans) |
| **Diagnostics → Crash Data** | Yes | **No*** | No | App Functionality (stability) |
| **Diagnostics → Performance Data** | Yes | **No*** | No | App Functionality |
| Usage Data | **No** | — | — | We do not collect analytics/clickstream beyond operational logs |
| Location | **No** | — | — | Not collected |
| Contacts / Photos / Browsing / Search / Sensitive Info (beyond health) | **No** | — | — | Not collected |

\* **Diagnostics linked = No**: Sentry events are PHI/PII-scrubbed in `beforeSend`
(`packages/service-core/src/sentry-scrub.ts`, `apps/mobile/src/lib/sentry-scrub.ts`).
Mobile drops the user object entirely; backend attaches only an 8-char salted hash of
the user id (pseudonymous, not joinable across services). If Apple review pushes back,
the conservative fallback is to declare Diagnostics **linked = Yes** (still no tracking).

## 3. Google Play Data Safety mapping (Play Console)

Security: **encrypted in transit (TLS)** = Yes; **users can request deletion** = Yes
(in-app `DELETE /api/users/me`); **data sold** = No.

| Play data type | Collected | Shared | Purpose | Optional? |
|----------------|-----------|--------|---------|-----------|
| Personal info → Email address | Yes | No | Account management, App functionality | Required |
| Personal info → User IDs | Yes | No | App functionality | Required |
| Health and fitness → Health info | Yes | **Yes → OpenAI** (see §5) | App functionality (meal plan generation) | Optional (personalized path only) |
| Financial info → Purchase history | Yes | No | App functionality | Required for paid tiers |
| App activity → Other user-generated content | Yes | No | App functionality | Optional |
| App info & performance → Crash logs | Yes | **Yes → Sentry** (processor) | App functionality (stability) | — |
| App info & performance → Diagnostics | Yes | **Yes → Sentry** | App functionality | — |

> "Shared" in Google's sense includes transfer to a 3rd-party processor. Health info is
> shared with OpenAI **only as a minimized subset** (§5). Crash/diagnostics shared with
> Sentry **after PHI redaction**.

## 4. Diagnostics / Sentry redaction (why Diagnostics is low-risk)

`beforeSend` strips, on every event path: request bodies (bio-profile lands here),
URLs (query dropped, user-id UUIDs masked), cookies/authorization headers, exception
frame locals, breadcrumb fetch data, `user` (email/ip dropped; id → salted hash on
backend, dropped on mobile), and any value under a sensitive key (allergies, biomarkers,
medications, body metrics, email, tokens, …). Sentry `sendDefaultPii: false`.
**Limitation:** free-text PHI deliberately placed under a *novel* key cannot be detected
by value — engineering must not stuff health strings into ad-hoc Sentry context/extra.

## 5. Third-party SDKs / sub-processors

| Processor | Receives | Used for | Notes / action |
|-----------|----------|----------|----------------|
| **AWS Cognito** | email, password, cognito_sub | Authentication | Password never touches our servers. Covered by AWS DPA. |
| **AWS (EC2/S3)** | all data at rest | Hosting | Under AWS infra; BAA **not** signed (hence no PHI sensitive fields in v1 — Decision A). |
| **RevenueCat** | RevenueCat app user id (= our user id), purchase/receipt | Subscription management | App user id is our internal UUID, not email. Confirm RevenueCat DPA. |
| **OpenAI (API)** | **minimized** health subset: per task — `weight_kg`+`height_cm` (calorie/macro), `allergies`+`intolerances` (allergen filter), `weight_kg`+`primary_goal` (GLP-1). No email, no name, no user id. | Meal plan generation | `phi_minimizer.py` enforces the per-task allowlist. Confirm OpenAI API DPA + "no training on API data" (default for API). **This is the one health-data egress to disclose as "shared."** |
| **Sentry** | PHI-redacted crash/error + device context + salted-hash id | Crash/error monitoring | Redaction in `sentry-scrub.ts`. Confirm Sentry DPA. DSN unset until provisioned. |
| **Apple / Google (IAP)** | purchase transactions | Payments | Standard store processing. |

## 6. Not collected in v1 (declare absent)

medical_conditions, medications (beyond a GLP-1 yes/no → `['glp1']`), biomarkers/labs,
precise or coarse location, contacts, photos/camera, microphone, browsing/search history,
advertising identifiers, third-party analytics/clickstream. medical_conditions /
medications / biomarkers **schemas are retained** (AES-256) for post-BAA reintroduction
(`CHORE-PHI-MEDICAL-REINTRODUCE-001`) but carry no v1 UI input.

## 7. Open items (require user / cannot be coded)

- [ ] Transcribe §2 into App Store Connect → App Privacy; §3 into Play Data Safety.
- [ ] Confirm/record DPAs: OpenAI (API, no-training), RevenueCat, Sentry, AWS.
- [ ] Decide Diagnostics linked Yes/No (§2 note) — default No, flip if review objects.
- [ ] Privacy Policy + ToS must enumerate the same categories (CHORE-LEGAL-001) and name
      OpenAI/Sentry/RevenueCat/Cognito as processors.
- [ ] If biomarkers/medical are ever reintroduced → BAA with AWS first + this doc revised.
