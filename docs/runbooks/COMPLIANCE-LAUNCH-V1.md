# Compliance Decision Record — CelebBase launch v1

> CHORE-COMPLIANCE-DECISION-RECORD-001 (Gate G2). The single place that records
> **what compliance posture we chose for launch v1 and why**. Pairs with
> `APP-PRIVACY-MAPPING.md` (the data inventory + store-disclosure mapping); this
> doc is the *legal* layer on top of that *engineering* inventory.
>
> ⚠️ **DRAFT — founder must verify each position with counsel before public
> launch.** Authored autonomously (2026-05-27) from the decisions already recorded
> in `docs/PROD-DEPLOY-ROADMAP.md` (Decision A) + spec.md §9.3. Nothing here is
> legal advice; it is a decision *record* for review + sign-off.
>
> **Breach-response owner: JUNWON** (sole full-stack owner, 2026-05-20~).

---

## 0. TL;DR posture

- We are a **consumer wellness / education app**, not a healthcare provider, insurer, or clearinghouse.
- **Launch-v1 PHI minimization (Decision A)**: we deliberately collect **no clinically-sensitive health data** — `medical_conditions`, `medications` (incl. the former GLP-1 indicator, removed in IMPL-PHI-LAUNCH-V1-REMOVAL-001), and `biomarkers` are **not collected**. Only non-clinical health & fitness data (body metrics, activity level, allergies, self-logged daily entries) drives personalization.
- **No tracking, no ad networks, no data sale.** (See `APP-PRIVACY-MAPPING.md` §0.)
- **In-app account deletion** (`DELETE /api/users/me`) honors deletion rights.
- We rely on standard vendor **DPAs** (data processing agreements); we do **not** rely on a HIPAA **BAA** — which is *why* sensitive PHI is excluded at launch.

---

## 1. What we handle (summary — full inventory in APP-PRIVACY-MAPPING.md)

| Category | Examples | Sensitivity |
|----------|----------|-------------|
| Account / identifiers | email, internal user id, cognito_sub | Personal |
| Non-clinical health & fitness | body metrics, activity level, allergies, intolerances, daily logs | Health (non-clinical) |
| Purchases | subscription tier/status (mirror of store/RevenueCat) | Financial |
| Diagnostics | crash/error events (PHI-redacted) | Pseudonymous |
| **Not collected (v1)** | medical_conditions, medications, biomarkers, location, contacts, photos, ad IDs | — (schemas retained, AES-256, for post-BAA) |

---

## 2. HIPAA (US health privacy)

- **Decision: CelebBase is NOT a HIPAA covered entity and NOT a business associate.** We do not bill insurance, are not a provider/plan/clearinghouse, and do not process PHI on behalf of one. A direct-to-consumer wellness app handling user-supplied data is outside HIPAA's scope.
- **Consequence**: with no BAA in place (notably with AWS), we must not store clinically-sensitive PHI. Decision A enforces this at the product layer (no `medical_conditions` / `medications` / `biomarkers` collection in v1).
- **Re-evaluate when**: revenue/usage justifies a BAA + clinical features → `CHORE-HIPAA-BAA-001` + `CHORE-PHI-MEDICAL-REINTRODUCE-001` (gated on users > 1K + BAA signed, per PROD-DEPLOY-ROADMAP).

## 3. FTC Health Breach Notification Rule (HBNR)

- **Decision: HBNR likely APPLIES.** As a consumer health app handling identifiable health information **not** covered by HIPAA, CelebBase is a "vendor of personal health records" under the FTC's expanded HBNR.
- **Obligation**: on a breach of unsecured identifiable health info, notify affected individuals + the FTC (and media if ≥ 500 people) **without unreasonable delay, ≤ 60 days**.
- **Mitigations already in place**: AES-256 at rest for the sensitive schema (even though those fields are uncollected), TLS in transit, PHI-redacted diagnostics, fail-closed audit logging, minimal health surface (Decision A shrinks breach scope).
- **Owner**: JUNWON (detection → assessment → notification). See §7.

## 4. CCPA / CPRA (California)

- **Applicability**: CelebBase may fall under CCPA only if it meets a threshold (≥ $25M revenue, or ≥ 100K consumers/households, or ≥ 50% revenue from selling data). At launch we likely meet **none** — but we honor the core rights regardless as good practice.
- **Sale / share of personal information: NONE.** No ad networks, no data brokers (APP-PRIVACY-MAPPING §0).
- **Sensitive personal information**: health data is "sensitive"; we limit use to providing the service (no secondary use), satisfying CPRA's "limit use of SPI" right by design.
- **Rights honored**: access/portability (bio-profile is user-readable), **deletion** (in-app `DELETE /api/users/me`), correction (profile edit). No financial-incentive / opt-out-of-sale needed (no sale).

## 5. GDPR (EU/EEA users, if any)

- **If we have EU users**, health data is **Art. 9 special-category** data → requires an Art. 9 condition. **Lawful basis: explicit consent** for the personalized path (the user opts into the personalized flow; the trend-only path collects no health data).
- **Data minimization (Art. 5)**: Decision A + `phi_minimizer.py` per-task allowlist to OpenAI directly implement minimization.
- **Data subject rights**: access, rectification, **erasure** (in-app delete + 30-day grace), portability — all supported by the existing account/bio-profile surface.
- **Processors**: each sub-processor (§6) must be under a GDPR-compliant DPA + SCCs for US transfer where applicable. **Action: confirm/record DPAs (open item).**
- **International transfer**: data hosted in AWS `us-west-2` → EU→US transfer needs SCCs / DPF reliance per vendor.

## 6. Sub-processors (DPA status — confirm before public launch)

> Authoritative receives/purpose table is `APP-PRIVACY-MAPPING.md` §5. DPA confirmation is an **open item (founder)**.

| Processor | Receives | DPA action |
|-----------|----------|-----------|
| **AWS** (Cognito, EC2, S3) | auth + all data at rest | AWS DPA (standard). **No BAA** (intentional — see §2). |
| **RevenueCat** | internal user id + purchase/receipt | Confirm DPA. App user id = our UUID, not email. |
| **OpenAI (API)** | **minimized** health subset for meal-plan generation (no email/name/id) | Confirm DPA + "no training on API data" (API default). **The one health-data egress disclosed as "shared."** |
| **Sentry** | PHI-redacted crash/error + salted-hash id | Confirm DPA. DSN provisioned 2026-05-27 (CHORE-SENTRY-DSN-WIRING-001). |
| **Apple / Google** (IAP) | purchase transactions | Standard store processing. |
| **Stripe** | — (web/legacy; **disabled** on staging — `STRIPE_ENABLED=false`) | Confirm DPA before enabling (CHORE-STAGING-VENDOR-ENABLE-001). |

## 7. Breach response (owner: JUNWON)

1. **Detect** — Sentry error alerts, anomalous access in `phi_access_logs`, vendor breach notice.
2. **Contain** — rotate affected credentials (`scripts/` rotation), revoke tokens, isolate the service.
3. **Assess** — scope: which data, how many users, was it "unsecured" (unencrypted) identifiable health info?
4. **Notify** — if HBNR-triggering (§3): affected users + FTC ≤ 60 days (+ media if ≥ 500). GDPR: supervisory authority ≤ 72h if EU users affected.
5. **Record** — incident log + post-mortem; revise this doc.

## 8. Open items (founder / cannot be coded)

- [ ] Counsel review + sign-off on §2–§5 positions (HIPAA scope, HBNR applicability, CCPA/GDPR).
- [ ] Confirm + record DPAs: AWS, RevenueCat, OpenAI (no-training), Sentry, Stripe (§6).
- [ ] Confirm whether there are EU users at launch (drives GDPR §5 scope) — geo-gate or accept.
- [ ] Privacy Policy + ToS (`/privacy`, `/terms`, draft on celebase.app) must name the same processors + categories — finalize from draft.
- [ ] Re-confirm against live schemas at store submission (G4); revise if any sensitive field is reintroduced (requires AWS BAA first).

---

## References

- `docs/runbooks/APP-PRIVACY-MAPPING.md` — data inventory + App Store / Play disclosure mapping (CHORE-APP-PRIVACY-MAPPING-001)
- `docs/PROD-DEPLOY-ROADMAP.md` §G2 + Decision A — PHI minimization decision
- `spec.md` §9.3 — PHI handling (AES-256, fail-closed audit, deletion)
- `.claude/rules/security.md` — JWT, PHI deletion procedure, encryption
- IMPL-PHI-LAUNCH-V1-REMOVAL-001 (PR #186) — GLP-1 / medication removal
- CHORE-SENTRY-PHI-REDACTION-001 (#176) — diagnostics PHI redaction
