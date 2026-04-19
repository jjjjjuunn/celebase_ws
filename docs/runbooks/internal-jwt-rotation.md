# Internal JWT Secret Rotation

> Zero-downtime rotation of `INTERNAL_JWT_SECRET` used by the BFF
> (`apps/web/src/app/api/_lib/session.ts`) and the issuing service
> (`services/user-service`). Applies to production and staging.

## Architecture recap (D18)

- BFF verifies HS256 JWTs using `INTERNAL_JWT_SECRET`.
- user-service signs HS256 JWTs using the same secret.
- Session TTL: **1 hour** (access token). Refresh tokens are a separate
  concern and rotate on every refresh.
- Verifier supports dual-key overlap via `INTERNAL_JWT_SECRET_NEXT`.
  Order: NEXT first, fall back to CURRENT only on a signature-verification
  failure. All other JOSE errors (expiry, audience, issuer, malformed)
  fail fast — they are not a cue to try another key.

## Invariants

- Overlap window ≥ access token TTL (1h). Tokens signed with the OLD
  secret remain valid until they expire; the window must cover the longest
  active-token lifetime at rollout time.
- A secret is never logged. Rotation is audited via deploy records only.
- Both BFF and user-service must observe the same CURRENT/NEXT pair at every
  point in time. Deploy them together within the overlap window.

## Procedure

### 1. Generate the new secret

```bash
openssl rand -base64 48
```

Use the same value in both the BFF and user-service environments.

### 2. Begin overlap (publish NEXT)

Deploy BFF and user-service with:

- `INTERNAL_JWT_SECRET` = **OLD** (unchanged)
- `INTERNAL_JWT_SECRET_NEXT` = **NEW**

Behavior during this phase:

- user-service keeps signing with OLD (CURRENT).
- BFF verifier tries NEW first, OLD second. Currently-active sessions signed
  with OLD continue to validate.
- Duration: ≥ 1 h. Longer is safe; shorter is not.

### 3. Cutover (promote NEW to CURRENT)

Deploy both services with:

- `INTERNAL_JWT_SECRET` = **NEW**
- `INTERNAL_JWT_SECRET_NEXT` = **OLD**

Now:

- user-service signs new tokens with NEW.
- BFF verifier tries NEW (CURRENT) first, OLD (NEXT) second. Tokens signed
  during step 2 with OLD still validate via the NEXT slot.
- Hold for ≥ 1 h so every OLD-signed token has expired.

### 4. Retire OLD

Deploy both services with:

- `INTERNAL_JWT_SECRET` = **NEW**
- `INTERNAL_JWT_SECRET_NEXT` = unset (empty string)

Verifier is now single-key again. Rotation complete.

## Rollback

Before step 3 cutover: revert to step 1 by removing `INTERNAL_JWT_SECRET_NEXT`.
No session invalidation.

After step 3 cutover: re-deploy with NEW/OLD swapped back. Any tokens signed
post-cutover remain valid because OLD is now in the NEXT slot.

After step 4 retirement: the OLD secret is no longer trusted. Rollback requires
re-issuing all active sessions (users must log in again).

## Emergency (compromise of CURRENT)

Skip the overlap. Deploy with:

- `INTERNAL_JWT_SECRET` = fresh random value
- `INTERNAL_JWT_SECRET_NEXT` = unset

All outstanding sessions are invalidated. Expect a burst of 401 responses;
clients clear `cb_access` and re-authenticate via Cognito Hosted UI.

## Verification

After each step:

```bash
# BFF liveness — unauthenticated route
curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/api/slice/home
# Expect: 200

# Authenticated probe with a current cookie
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Cookie: cb_access=<token>" https://<host>/api/users/me
# Expect: 200 post-cutover with a NEW-signed token
```

Grep for residual OLD secret references before declaring done:

```bash
grep -R "INTERNAL_JWT_SECRET" services/ apps/ --include='*.ts'
```

## References

- `apps/web/src/app/api/_lib/session.ts` — `getVerifierSecrets()` + dual-key
  acceptance loop.
- `apps/web/.env.example` — env var contract.
- spec.md §9 (Security) — session token lifetime and rotation policy.
