terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Local state for CHORE-006 (single-operator).
  # CHORE-007 will migrate this to an S3+DynamoDB backend.
  # See README.md — single-operator lock rules MUST be followed until migration.
}

provider "aws" {
  region = var.aws_region
}

# ── User Pool ────────────────────────────────────────────────────────────────

resource "aws_cognito_user_pool" "this" {
  name = "celebbase-${var.environment}"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # MFA: OFF in staging (no SMS cost), OPTIONAL in prod (Gemini M6 risk accepted)
  mfa_configuration = var.environment == "prod" ? "OPTIONAL" : "OFF"

  # NIST 800-63B: min 8 chars; we use 12 + complexity for defence-in-depth.
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 3
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # email is required, immutable (username change would break cognito_sub linkage)
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = false
    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Ticket      = "CHORE-006"
  }
}

# ── Hosted UI Domain ─────────────────────────────────────────────────────────

resource "aws_cognito_user_pool_domain" "this" {
  # Globally unique; format: <prefix>-<env>.auth.<region>.amazoncognito.com
  domain       = "${var.hosted_ui_prefix}-${var.environment}"
  user_pool_id = aws_cognito_user_pool.this.id
}

# ── BFF Confidential Client (OAuth authorization code flow) ──────────────────

resource "aws_cognito_user_pool_client" "bff" {
  name         = "celebbase-bff-${var.environment}"
  user_pool_id = aws_cognito_user_pool.this.id

  # Server-side BFF: keep client secret for client_secret_basic code exchange
  generate_secret = true

  # Authorization code flow only — no implicit, no client_credentials
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  # SRP for future native-client support; no USER_PASSWORD_AUTH (Gemini M1).
  # ALLOW_ADMIN_USER_PASSWORD_AUTH: Admin API only (requires AWS credentials),
  # used by smoke test so id_token aud == bff_client_id (not smoke_client_id).
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]

  callback_urls                = var.callback_urls
  logout_urls                  = var.logout_urls
  supported_identity_providers = ["COGNITO"]

  # Hides user existence from error messages (prevent user enumeration)
  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60   # minutes
  id_token_validity      = 60   # minutes
  refresh_token_validity = 30   # days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

# ── Smoke Test Client (staging-gated, public) ────────────────────────────────
# No client secret → AdminInitiateAuth requires no SECRET_HASH (Gemini C1 fix).
# ALLOW_ADMIN_USER_PASSWORD_AUTH is Admin API only — cannot be used from browsers.
# Set enable_smoke_client=false in prod to omit entirely (Gemini M1).

resource "aws_cognito_user_pool_client" "smoke" {
  count        = var.enable_smoke_client ? 1 : 0
  name         = "celebbase-smoke-${var.environment}"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  lifecycle {
    precondition {
      condition     = var.environment != "prod"
      error_message = "enable_smoke_client must not be true in production; set enable_smoke_client=false."
    }
  }
}
