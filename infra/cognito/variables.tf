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
  description = "Allowed OAuth callback URLs for the BFF client"
  type        = list(string)
  default = [
    "https://staging.celebbase.example/api/auth/callback",
    "http://localhost:3000/api/auth/callback",
    "http://localhost:3001/api/auth/callback",
  ]
}

variable "logout_urls" {
  description = "Allowed logout redirect URLs for the BFF client"
  type        = list(string)
  default = [
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
