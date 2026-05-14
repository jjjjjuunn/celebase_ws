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
