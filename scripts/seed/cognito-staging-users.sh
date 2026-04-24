#!/usr/bin/env bash
# scripts/seed/cognito-staging-users.sh
#
# Creates dev-seeded users in the staging Cognito User Pool so that the
# email-bridge in auth.service.ts can merge cognito_sub='dev-%' rows to
# real Cognito sub on first login. (CHORE-006 / Gemini H5)
#
# Prerequisites:
#   - AWS CLI configured with staging credentials
#   - COGNITO_USER_POOL_ID env var (or use -p flag)
#   - User pool already applied via infra/cognito
#
# Usage:
#   COGNITO_USER_POOL_ID=us-west-2_xxx bash scripts/seed/cognito-staging-users.sh
#   bash scripts/seed/cognito-staging-users.sh -p us-west-2_xxx -r us-east-1

set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────────

POOL_ID="${COGNITO_USER_POOL_ID:-}"
REGION="${AWS_REGION:-us-west-2}"
# Default temp password meets the pool's password policy (12+ chars, mix)
TEMP_PASSWORD="${SEED_TEMP_PASSWORD:-Celebbase!Seed1}"

while getopts "p:r:t:" opt; do
  case "$opt" in
    p) POOL_ID="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    t) TEMP_PASSWORD="$OPTARG" ;;
    *) echo "Usage: $0 [-p pool-id] [-r region] [-t temp-password]" >&2; exit 1 ;;
  esac
done

if [[ -z "$POOL_ID" ]]; then
  echo "ERROR: COGNITO_USER_POOL_ID is required (-p or env var)" >&2
  exit 1
fi

# ── Dev-seed email list (mirrors services/user-service/scripts/seed-demo-user.ts) ──

SEED_EMAILS=(
  "demo@celebbase.local"
)

# ── Helper: upsert one user ──────────────────────────────────────────────────

upsert_user() {
  local email="$1"

  echo "→ Seeding $email …"

  # Try to create; skip if already exists
  if aws cognito-idp admin-get-user \
       --user-pool-id "$POOL_ID" \
       --username "$email" \
       --region "$REGION" \
       --output text \
       --query 'UserStatus' 2>/dev/null; then
    echo "  already exists — updating password to permanent"
  else
    aws cognito-idp admin-create-user \
      --user-pool-id "$POOL_ID" \
      --username "$email" \
      --user-attributes \
          Name=email,Value="$email" \
          Name=email_verified,Value=true \
      --message-action SUPPRESS \
      --region "$REGION" \
      --output text > /dev/null
    echo "  created"
  fi

  # Set a permanent password so users can log in without force-change flow
  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$email" \
    --password "$TEMP_PASSWORD" \
    --permanent \
    --region "$REGION"

  echo "  password set (permanent)"
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo "=== Cognito staging seed ==="
echo "Pool:   $POOL_ID"
echo "Region: $REGION"
echo "Users:  ${#SEED_EMAILS[@]}"
echo ""

for email in "${SEED_EMAILS[@]}"; do
  upsert_user "$email"
done

echo ""
echo "✅ Seeding complete."
echo ""
echo "These users have cognito_sub LIKE 'dev-%' in the staging database."
echo "On first Hosted UI login, auth.service.ts email-bridge will merge"
echo "the real Cognito sub (replacing 'dev-%') automatically."
echo ""
echo "To log in via smoke script, set DEMO_EMAIL and run:"
echo "  tsx scripts/smoke/cognito-hosted-ui.ts"
