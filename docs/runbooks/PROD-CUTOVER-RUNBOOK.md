# Production Cutover Runbook — CelebBase (G3)

> CHORE-PROD-EC2-001 + CHORE-COGNITO-PROD-POOL-001 (Gate G3). Grounded in the
> real staging infra (cd.yml, infra/cognito, docker-compose.yml, Caddyfile,
> migration runner). Authored 2026-05-25 (autonomous).
>
> ⚠️ **PREPARE-ONLY. DO NOT EXECUTE UNATTENDED.** A prod cutover (new EC2 + new
> Cognito pool + DNS + secrets) is high blast-radius and hard to reverse. Execute
> only while awake, with each phase's verification green before the next, and a
> tested rollback in hand. This doc is the plan + go/no-go gates, not an
> automation. SSH access is available but cutover steps were intentionally NOT
> run overnight.

## 0. Go / No-Go gates (ALL must be green before starting)

| Gate | Why | Where |
|------|-----|-------|
| G1 Apple/Google accounts + IAP **not** required for infra cutover, but Cognito prod pool IDs must reach the mobile EAS prod profile | mobile can't auth against prod without the pool | EAS profile env (CHORE-EAS-PROD-BUILD-001) |
| SES production access approved (50K/day) | Cognito prod email verification at scale | CHORE-SES-PROD-ACCESS-001 |
| DB backup + restore tested (≤30 min) | Decision B stop-condition baseline; cutover with no backup = unrecoverable | CHORE-DB-BACKUP-001 |
| Staging green end-to-end on the SAME image SHAs you'll promote | prod should run proven artifacts | `gh run list` + staging `/api/health` |
| Decision B settled: **EC2 docker Postgres vs RDS** | the `db-migrate` service + `.env.prod` PGHOST differ per choice | PROD-DEPLOY-ROADMAP Decision B |
| Rollback rehearsed (DNS TTL low + previous image SHA captured) | abort path must exist | §6 |

If any gate is red → **No-Go**. Do not start a partial cutover.

## 1. Scope + sequence

Mirror staging, isolated as a NEW environment. Order matters — **migrations + secrets before app, DNS last**:

```
A. Cognito prod pool (terraform)         → outputs feed B/C
B. prod EC2 + Elastic IP + Security Group
C. prod secrets (Secrets Manager → .env.prod on box)
D. prod docker-compose + Caddy (prod CA already default)
E. DB first-run migration (db-migrate)
F. deploy images (prod CD or manual pull/up) + healthcheck
G. DNS cutover (celebase.app apex) + smoke E2E   ← LAST, reversible via DNS
```

## 2. Phase A — Cognito prod pool (`infra/cognito`)

Staging backend key is `cognito/staging/terraform.tfstate` (`infra/cognito/main.tf:11`). Prod is a **separate state**.

1. Create `infra/cognito/prod.auto.tfvars` (gitignored, like staging):
   ```hcl
   environment         = "prod"          # drives pool/client names + MFA=OPTIONAL
   enable_smoke_client = false           # REQUIRED — lifecycle.precondition blocks prod smoke client (main.tf:136-143)
   callback_urls       = ["https://celebase.app/api/auth/callback", ...]  # prod, no localhost
   logout_urls         = ["https://celebase.app/", ...]
   mobile_callback_urls = ["celebase://callback/"]
   mobile_logout_urls   = ["celebase://signout/"]
   # social IdP secrets (Google/Apple) — required by IdP preconditions (main.tf:194-199, 226-229)
   ```
2. Point the backend at the prod key (do NOT reuse staging state): change `key = "cognito/prod/terraform.tfstate"` OR use a `-backend-config="key=cognito/prod/terraform.tfstate"` on `terraform init` (preferred — keeps the file diff-free).
3. `terraform init -reconfigure -backend-config=... && terraform plan` — **review the plan; expect a brand-new pool + 2 clients (bff, mobile), NO smoke client**.
4. Apply only after plan review. Capture outputs: `user_pool_id`, `mobile_client_id`, BFF `client_id` + `client_secret`, `issuer`, `jwks_uri`.
5. Propagate outputs → BFF prod env + mobile EAS prod profile (Phase C + CHORE-EAS-PROD-BUILD-001). **Mobile build must embed the PROD pool**, not staging.

Verify: `aws cognito-idp describe-user-pool --user-pool-id <prod-id>` shows `mfa_configuration: OPTIONAL`; hosted UI domain `<prefix>-prod` resolves.

## 3. Phase B — prod EC2 + network

1. Provision a SEPARATE prod EC2 (do not co-locate with staging). Size per Decision B (m5.large noted in roadmap CHORE-CAPACITY-BUDGET-001).
2. Elastic IP + Security Group (443 + SSH from your IP only).
3. If meal-plan-engine uses SQS in prod: replicate the staging IAM role + instance profile + **IMDS hop limit 2** (containers need it) — see INFRA-MOBILE-SQS-TERRAFORM-001; staging did this manually (NoCredentialsError otherwise).
4. Add prod SSH secrets to GitHub (a prod CD needs `PROD_SSH_KEY` / `PROD_SERVER_IP` / `PROD_SERVER_USER` / `PROD_DOMAIN` — the current cd.yml only has `STAGING_*`, see §7).

## 4. Phase C — prod secrets

Secrets live as a **raw `.env` on the box** (no runtime SSM loader is wired — CHORE-007 open). Source of truth = AWS Secrets Manager `celebbase/prod/*` (staging uses `celebbase/staging/user-service`, per `services/user-service/.env.staging.example:7-8`).

1. Create `celebbase/prod/user-service` (and per-service equivalents) in Secrets Manager with prod values: `COGNITO_CLIENT_SECRET` (Phase A), `INTERNAL_JWT_*`, DB creds, OpenAI key, RevenueCat live key, etc.
2. On the prod box, populate `/app/.env.prod` + `/app/apps/web/.env.prod` from those secrets (mirror the staging `.env.staging` tail in HANDOFF-CHORE-STAGING-BE-DEPLOY-001.md). **Use literal values — docker-compose `env_file` does NOT expand `${VAR}`** (staging gotcha #3).
3. Run `scripts/preflight-env.sh` against the prod web env — it validates 7 keys + SHA-compares `INTERNAL_JWT_SECRET` between web env and the running user-service. Must pass before deploy.
4. **Issuer alignment**: `INTERNAL_JWT_ISSUER` must match across user-service + BFF + docker-compose (the 2026-04-20 login-failure trap). Confirm before first login test.

## 5. Phase D — compose + Caddy

1. The EC2 keeps a box-local `/app/docker-compose.yml` (CD does NOT scp it — cd.yml:336-341). Build the prod compose from the repo `docker-compose.yml` (11 services) + append web/caddy blocks, pointing `db-migrate` PGHOST/PGDATABASE/PGPASSWORD + service DB URLs at the prod DB (RDS endpoint or local postgres per Decision B).
2. Caddy: `docker/caddy/Caddyfile` already defaults to **LE prod CA** (staging-CA line commented, :29). Domain comes from `{$STAGING_DOMAIN}` env — set the prod env's domain var to `celebase.app`. Do the LE dry-run (Caddyfile inline procedure :10-26) once to avoid rate-limit lockout, then prod CA.
3. Fix the placeholder domain drift: repo references `staging.celebbase.com` (double-b, NXDOMAIN) in some examples; real is `celebase.app`. Use `celebase.app` for prod everywhere.

## 6. Phase E — DB first-run migration

The `db-migrate` compose service (`docker-compose.yml:33-63`) is an idempotent psql loop over `db/migrations/*.sql` tracked in a `pgmigrations` table; `scripts/migration-sanity.sh` smoke-checks 5 critical columns.

1. A fresh prod DB has empty `pgmigrations` → first run applies ALL migrations in sorted order. Run:
   ```bash
   docker compose run --rm -T db-migrate </dev/null     # -T + </dev/null are MANDATORY
   MIGRATION_DB_SERVICE=db bash /app/scripts/migration-sanity.sh
   ```
   ⚠️ The `-T </dev/null` is the CHORE-CD-DEPLOY-SILENT-EXIT-001 fix — without it `docker compose run` eats stdin and the deploy silently aborts.
2. Confirm `migration 0023` (apple_refresh_token_enc) + the latest allergen/credits migrations are present. Verify sanity check exits 0.

## 7. Phase F — deploy images + healthcheck

The current `.github/workflows/cd.yml` is **staging-only / hardcoded** (no environment input; SSH target = `STAGING_SERVER_IP`). Two options:

- **(Recommended) Add a prod path**: parameterize cd.yml by environment (or a `cd-prod.yml` copy) using `PROD_*` secrets + a manual `workflow_dispatch` gate. Keep the same migration→pull→up→healthcheck→rollback flow.
- **(Interim) Manual deploy**: SSH to prod, `docker compose pull` + `docker compose up -d --force-recreate <services>`, mirroring the staging recovery in HANDOFF-CHORE-STAGING-BE-DEPLOY-001.md §6.

Capture the previous web image digest before pulling (cd.yml:399-418 pattern → `/app/.web-previous-ref`) so the web-only auto-rollback works. **Promote the exact SHAs proven on staging.**

Verify (mirror staging final snapshot): `docker compose ps` all healthy; memory < 75%; 5 BE `/health` 200 on ports 3001-3005; BFF `/api/health` 200.

## 8. Phase G — DNS cutover (LAST) + smoke

1. Lower the `celebase.app` apex TTL beforehand (fast rollback).
2. Point the apex A record at the prod Elastic IP (Cloudflare).
3. Smoke E2E against prod: `curl https://celebase.app/api/health` 200; mobile signup → `/api/users/me` 200 → bio-profile → `/auth/refresh` 200 (mirror the staging L10-a verification block).
4. Watch Sentry (now wired — set prod `SENTRY_DSN` + `EXPO_PUBLIC_SENTRY_DSN`) + logs for 30 min.

## 9. Rollback / abort

- **DNS**: repoint apex back to staging/maintenance (low TTL makes this fast) — the cleanest abort before users land.
- **Image**: web auto-rolls-back to `/app/.web-previous-ref` on healthcheck fail; BE services + caddy have NO auto-rollback — `docker compose up -d --force-recreate <svc>` with the prior tag manually.
- **DB**: migrations are forward-only. A bad migration → restore from the S3 backup (must be tested first — go/no-go gate). Do NOT hand-edit prod tables.
- **Cognito**: the prod pool is independent; aborting = just don't point clients at it. Do not delete a pool that has real users.

## 10. Open decisions for the operator (not decided here)

- **Decision B**: EC2 docker Postgres vs RDS — drives `db-migrate` target + backup strategy. Roadmap leans docker-Postgres + S3 `pg_dump` for <1K users with RDS stop-conditions.
- **Prod CD**: parameterize cd.yml vs separate `cd-prod.yml` vs manual (§7).
- **Runtime secrets loader** (CHORE-007): wire SSM/Secrets-Manager fetch at boot instead of raw `.env` on the box (CHORE-STAGING-ENV-MANAGEMENT-001 covers staging too).
- **Terraform-ize staging SQS/IAM** (INFRA-MOBILE-SQS-TERRAFORM-001) before relying on it in prod.

## 11. Post-cutover acceptance (from PROD-DEPLOY-ROADMAP G3)

- [ ] `curl https://celebase.app/api/health` 200
- [ ] 5 BE + web + caddy healthy in prod
- [ ] migration auto-runner ran (prod `pgmigrations` populated) + sanity 0
- [ ] DB daily backup → S3 + restore test ≤30 min
- [ ] Sentry collecting (prod DSN) + credit card on file
- [ ] Capacity budget worksheet + stop-condition baseline recorded
- [ ] prod Cognito pool active + mobile EAS prod profile env injected
