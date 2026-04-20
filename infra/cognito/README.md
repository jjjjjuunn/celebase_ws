# infra/cognito — AWS Cognito User Pool (CHORE-006)

Terraform module that provisions the CelebBase Cognito User Pool for staging.

## ⚠️ Single-Operator Lock Rule

This module uses **local Terraform state** (`.terraform/`, `terraform.tfstate`).
Two operators running `terraform apply` concurrently against the same AWS account
will conflict on the `aws_cognito_user_pool_domain` prefix and may corrupt state.

**Before applying:**
1. Check that no `.terraform.lock.sentinel` file exists in this directory.
2. Create the sentinel: `touch .terraform.lock.sentinel`
3. Proceed with `terraform apply`.
4. Remove sentinel when done: `rm .terraform.lock.sentinel`

The `.terraform.lock.sentinel` file is `.gitignore`d. Its presence signals
"someone is applying." This is a manual convention — not a real lock.
CHORE-007 will migrate to S3+DynamoDB backend with proper distributed locking.

## Prerequisites

- Terraform >= 1.7
- AWS credentials with permissions:
  - `cognito-idp:CreateUserPool`
  - `cognito-idp:CreateUserPoolClient`
  - `cognito-idp:CreateUserPoolDomain`
  - `cognito-idp:Describe*`
  - `cognito-idp:Update*`
  - `cognito-idp:Delete*`
- AWS region: `us-west-2` (default; override with `-var aws_region=...`)

## Apply (staging)

```bash
cd infra/cognito

# One-time init
terraform init

# Preview changes
terraform plan \
  -var environment=staging \
  -var enable_smoke_client=true

# Apply
terraform apply \
  -var environment=staging \
  -var enable_smoke_client=true

# Capture outputs for .env.staging
terraform output -json
```

## Verify

```bash
POOL_ID=$(terraform output -raw user_pool_id)
aws cognito-idp describe-user-pool \
  --user-pool-id "$POOL_ID" \
  --query 'UserPool.Status'
# Expected: "Enabled"
```

## Populate .env.staging

After `terraform apply`, fill in `services/user-service/.env.staging`:

```
AWS_REGION=us-west-2
COGNITO_USER_POOL_ID=<terraform output -raw user_pool_id>
COGNITO_CLIENT_ID=<terraform output -raw bff_client_id>
COGNITO_JWKS_URI=<terraform output -raw jwks_uri>
COGNITO_ISSUER=<terraform output -raw issuer>
```

Store `bff_client_secret` in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name "celebbase/staging/user-service" \
  --secret-string "{
    \"COGNITO_CLIENT_SECRET\": \"$(terraform output -raw bff_client_secret)\",
    \"COGNITO_SMOKE_CLIENT_ID\": \"$(terraform output -raw smoke_client_id)\",
    \"INTERNAL_JWT_SECRET\": \"$(openssl rand -hex 32)\"
  }"
```

## Tear down

```bash
terraform destroy \
  -var environment=staging \
  -var enable_smoke_client=true
```

## CHORE-007 TODO

- Migrate state to S3 backend:
  ```hcl
  backend "s3" {
    bucket         = "celebbase-terraform-state"
    key            = "cognito/staging/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "celebbase-terraform-locks"
  }
  ```
- Add prod module instance with `enable_smoke_client=false`, MFA=OPTIONAL,
  and a custom ACM domain (CHORE-009).
