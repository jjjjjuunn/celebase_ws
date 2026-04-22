variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "state_bucket_name" {
  description = "S3 bucket name for Terraform remote state. Must be globally unique."
  type        = string
  default     = "celebbase-terraform-state"
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "celebbase-terraform-locks"
}
