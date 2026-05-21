terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "celebbase-terraform-state"
    key            = "cognito/staging/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "celebbase-terraform-locks"
    encrypt        = true
  }
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
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = false
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

  access_token_validity  = 60 # minutes
  id_token_validity      = 60 # minutes
  refresh_token_validity = 30 # days

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

# ── Social Identity Providers (Google / Apple) — IMPL-MOBILE-SOCIAL-001 ──────
# Each provider materializes ONLY when its credentials are supplied (count
# gate), so `terraform apply` with empty vars is a federation no-op and the
# mobile client stays COGNITO-only. Populate via a gitignored
# staging.auto.tfvars or -var (see docs/runbooks/SOCIAL-LOGIN-SETUP.md).

locals {
  # Gate on the NON-sensitive identifier only. Referencing the sensitive
  # secret/key here (google_oauth_client_secret / apple_private_key) would
  # propagate sensitivity into mobile_identity_providers and break the
  # social_providers_enabled output ("Output refers to sensitive values").
  # The secret's presence is enforced by a lifecycle.precondition on each IdP
  # resource below — so a half-filled config still fails fast and clearly.
  google_enabled = var.google_oauth_client_id != ""

  apple_enabled = (
    var.apple_services_id != "" &&
    var.apple_team_id != "" &&
    var.apple_key_id != ""
  )

  # Cognito provider names. NOTE: Cognito names Apple "SignInWithApple" — this
  # differs from Amplify's client-side 'Apple' alias. COGNITO stays first so
  # email/password SRP keeps working before (and after) any social setup.
  mobile_identity_providers = concat(
    ["COGNITO"],
    local.google_enabled ? ["Google"] : [],
    local.apple_enabled ? ["SignInWithApple"] : [],
  )
}

resource "aws_cognito_identity_provider" "google" {
  count         = local.google_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_oauth_client_id
    client_secret    = var.google_oauth_client_secret
    authorize_scopes = "openid email profile"
  }

  # Map Google's verified email into Cognito's required `email` attribute so it
  # appears in the id_token `email` claim (user-service keys on it).
  attribute_mapping = {
    email = "email"
  }

  lifecycle {
    precondition {
      condition     = var.google_oauth_client_secret != ""
      error_message = "google_oauth_client_secret must be set when google_oauth_client_id is provided."
    }
  }
}

resource "aws_cognito_identity_provider" "apple" {
  count         = local.apple_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    client_id        = var.apple_services_id
    team_id          = var.apple_team_id
    key_id           = var.apple_key_id
    private_key      = var.apple_private_key
    authorize_scopes = "email name"
  }

  # Apple returns `email` ONLY on the user's first consent. Cognito persists it
  # to the (immutable) `email` user attribute, so subsequent id_tokens still
  # carry email. `mutable = false` blocks UPDATES, not the initial federation
  # write — so re-login works.
  attribute_mapping = {
    email = "email"
  }

  lifecycle {
    precondition {
      condition     = var.apple_private_key != ""
      error_message = "apple_private_key must be set when apple_services_id is provided."
    }
  }
}

# ── Mobile Public Client (React Native SRP + Hosted-UI social federation) ────

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "celebbase-mobile-${var.environment}"
  user_pool_id = aws_cognito_user_pool.this.id

  # Mobile app stores cannot safely keep client secret. PKCE (enforced by the
  # Amplify SDK for public clients) protects the authorization code flow.
  generate_secret = false

  # SRP + refresh token only (no USER_PASSWORD_AUTH, no CUSTOM_AUTH)
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Authorization-code flow for Hosted-UI social sign-in. Coexists with SRP
  # above on the same client; email/password login is unaffected.
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = var.mobile_callback_urls
  logout_urls                          = var.mobile_logout_urls

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # Grows as IdP credentials are supplied (see locals above).
  supported_identity_providers = local.mobile_identity_providers

  # Federation resources must exist before the client references their names.
  depends_on = [
    aws_cognito_identity_provider.google,
    aws_cognito_identity_provider.apple,
  ]

  access_token_validity  = 60 # minutes
  id_token_validity      = 60 # minutes
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}
