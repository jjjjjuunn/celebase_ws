output "bucket_name" {
  description = "Avatars S3 bucket name → set as user-service AVATARS_BUCKET"
  value       = aws_s3_bucket.avatars.bucket
}

output "public_base_url" {
  description = "Public base URL → set as user-service AVATARS_PUBLIC_BASE_URL"
  value       = "https://${aws_s3_bucket.avatars.bucket}.s3.${var.aws_region}.amazonaws.com"
}

output "put_policy_arn" {
  description = "Attach to the user-service runtime role to allow presigning s3:PutObject"
  value       = aws_iam_policy.avatars_put.arn
}
