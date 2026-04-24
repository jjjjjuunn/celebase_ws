output "user_pool_id" {
  description = "Cognito User Pool ID (COGNITO_USER_POOL_ID)"
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.this.arn
}

output "issuer" {
  description = "JWT issuer URL (COGNITO_ISSUER) — no trailing slash"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "jwks_uri" {
  description = "JWKS endpoint (COGNITO_JWKS_URI) — equals issuer + /.well-known/jwks.json"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}/.well-known/jwks.json"
}

output "hosted_ui_domain" {
  description = "Hosted UI base domain (COGNITO_HOSTED_UI_DOMAIN)"
  value       = "${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}

# BFF confidential client
output "bff_client_id" {
  description = "BFF app client ID (COGNITO_CLIENT_ID)"
  value       = aws_cognito_user_pool_client.bff.id
}

output "bff_client_secret" {
  description = "BFF app client secret (COGNITO_CLIENT_SECRET) — sensitive"
  value       = aws_cognito_user_pool_client.bff.client_secret
  sensitive   = true
}

# Smoke client (only present when enable_smoke_client=true)
output "smoke_client_id" {
  description = "Smoke test client ID (COGNITO_SMOKE_CLIENT_ID) — empty when smoke client not enabled"
  value       = length(aws_cognito_user_pool_client.smoke) > 0 ? aws_cognito_user_pool_client.smoke[0].id : ""
}

# Derived convenience values for .env.staging
output "token_endpoint" {
  description = "OAuth token endpoint (COGNITO_TOKEN_ENDPOINT)"
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/token"
}
