variable "environment" {
  description = "Deployment environment: staging | prod"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be 'staging' or 'prod'."
  }
}

variable "aws_region" {
  description = "AWS region for the Cognito User Pool"
  type        = string
  default     = "us-west-2"
}

variable "hosted_ui_prefix" {
  description = "Prefix for the Cognito Hosted UI subdomain (must be globally unique)"
  type        = string
  default     = "celebbase"
}

variable "callback_urls" {
  description = <<-EOT
    Allowed OAuth callback URLs for the BFF client.

    The first entry uses `staging.celebbase.example` as a placeholder until
    the real staging domain is registered (CHORE-MOBILE-STAGING-BFF-001 P2).
    Override at apply time once the domain is decided:

      terraform apply -var=environment=staging \\
        -var='callback_urls=["https://staging.celebbase.com/api/auth/callback","http://localhost:3000/api/auth/callback","http://localhost:3001/api/auth/callback"]'

    Or commit the values to a gitignored `staging.auto.tfvars` for the
    staging working tree.

    Localhost entries MUST be preserved across environments — they back the
    local dev Hosted UI flow.
  EOT
  type        = list(string)
  default = [
    # TBD: replace with real staging domain via -var or staging.auto.tfvars
    "https://staging.celebbase.example/api/auth/callback",
    "http://localhost:3000/api/auth/callback",
    "http://localhost:3001/api/auth/callback",
  ]
}

variable "logout_urls" {
  description = <<-EOT
    Allowed logout redirect URLs for the BFF client. Same override pattern
    as `callback_urls`. Localhost entries preserved.
  EOT
  type        = list(string)
  default = [
    # TBD: replace with real staging domain via -var or staging.auto.tfvars
    "https://staging.celebbase.example",
    "http://localhost:3000",
    "http://localhost:3001",
  ]
}

variable "enable_smoke_client" {
  description = "Whether to create the public smoke-test client (staging only; never true in prod)"
  type        = bool
  default     = false
}

# ── Social federation (Google / Apple) — IMPL-MOBILE-SOCIAL-001 ──────────────
# All default to "" so `terraform apply` without credentials is a federation
# no-op (count gate in main.tf). Supply via a gitignored `staging.auto.tfvars`
# or `-var` at apply time. Never commit real values. See
# docs/runbooks/SOCIAL-LOGIN-SETUP.md for how to obtain each value.

variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 Web client ID (from Google Cloud console). Empty disables Google."
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Google OAuth 2.0 Web client secret. Empty disables Google."
  type        = string
  default     = ""
  sensitive   = true
}

variable "apple_services_id" {
  description = "Apple 'Services ID' (the OAuth client_id, e.g. com.celebase.mobile.signin). Empty disables Apple."
  type        = string
  default     = ""
}

variable "apple_team_id" {
  description = "Apple Developer Team ID (10 chars). Empty disables Apple."
  type        = string
  default     = ""
}

variable "apple_key_id" {
  description = "Apple Sign-in private key ID (Key ID of the .p8 key). Empty disables Apple."
  type        = string
  default     = ""
}

variable "apple_private_key" {
  description = "Apple Sign-in private key — full PEM contents of the .p8 file. Empty disables Apple."
  type        = string
  default     = ""
  sensitive   = true
}

variable "mobile_callback_urls" {
  description = <<-EOT
    OAuth callback URLs for the mobile public client. Must EXACTLY match the
    Amplify `redirectSignIn` value in apps/mobile/src/lib/cognito.ts. Uses the
    app's custom URL scheme (app.json `scheme`), not https.
  EOT
  type        = list(string)
  default     = ["celebase://callback/"]
}

variable "mobile_logout_urls" {
  description = "OAuth logout redirect URLs for the mobile client (custom scheme). Must match Amplify `redirectSignOut`."
  type        = list(string)
  default     = ["celebase://signout/"]
}
