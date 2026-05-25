variable "environment" {
  description = "Deployment environment: staging | prod"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be 'staging' or 'prod'."
  }
}

variable "aws_region" {
  description = "AWS region for the avatars bucket"
  type        = string
  default     = "us-west-2"
}

variable "bucket_name" {
  description = "Override the avatars bucket name. Empty → celebbase-avatars-<environment>. Must be globally unique."
  type        = string
  default     = ""
}

variable "cors_allowed_origins" {
  description = <<-EOT
    Origins allowed to PUT/GET directly against the bucket. Native mobile
    (React Native fetch) is not subject to CORS, so this only affects a future
    web client. Default ["*"] keeps presigned PUT working everywhere; tighten to
    your web domain(s) when a browser uploads avatars.
  EOT
  type        = list(string)
  default     = ["*"]
}
