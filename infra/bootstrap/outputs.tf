output "state_bucket_name" {
  description = "S3 bucket name — copy to infra/cognito/main.tf backend block"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "lock_table_name" {
  description = "DynamoDB table name — copy to infra/cognito/main.tf backend block"
  value       = aws_dynamodb_table.terraform_locks.name
}
