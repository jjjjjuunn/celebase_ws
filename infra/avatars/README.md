# infra/avatars — user avatar S3 bucket (FEAT-PROFILE-EDIT)

Provisions the S3 bucket that backs profile-photo uploads. user-service issues
short-lived **presigned PUT** URLs (`POST /users/me/avatar/upload-url`); the
client uploads image bytes directly, then persists the public URL via
`PATCH /users/me { avatar_url }`.

## What it creates

- `aws_s3_bucket.avatars` — `celebbase-avatars-<env>` (override with `bucket_name`).
- SSE (AES256), ACLs disabled (`BucketOwnerEnforced`).
- **Public-read on `avatars/*` only** via bucket policy (profile images are public).
- CORS (PUT/GET/HEAD) — only relevant for a future browser uploader; native RN
  fetch is not subject to CORS.
- `aws_iam_policy.avatars_put` — grant `s3:PutObject` on `avatars/*`; attach to
  the **user-service runtime role** so it can sign presigned PUTs.

## Apply

```bash
cd infra/avatars

# staging (backend key is staging-pinned in main.tf)
terraform init
terraform fmt -check
terraform validate
terraform plan  -var='environment=staging'
terraform apply -var='environment=staging'

# prod — override the backend state key at init
terraform init -reconfigure -backend-config="key=avatars/prod/terraform.tfstate"
terraform apply -var='environment=prod'
```

> Terraform was not available in the authoring environment, so `fmt -check` /
> `validate` / `plan` were **not** run here. Run them before applying (per the
> INFRA-MOBILE-001 terraform-only QA pattern: fmt → init → validate → plan).

## Wire into user-service

Set from the module outputs (`terraform output`):

```
AVATARS_BUCKET=<bucket_name>
AVATARS_PUBLIC_BASE_URL=<public_base_url>
AWS_REGION=<region>           # same region the bucket is in
# optional tuning:
AVATAR_MAX_BYTES=5000000
AVATAR_UPLOAD_URL_TTL=300
```

Attach `put_policy_arn` to whatever role runs user-service. When `AVATARS_BUCKET`
is unset, the upload-url route fails closed with `503 AVATAR_UPLOAD_NOT_CONFIGURED`.

## Security notes / follow-ups

- **Size enforcement**: a presigned **PUT** cannot cap object size server-side.
  `AVATAR_MAX_BYTES` is enforced client-side only. For a hard cap, migrate to a
  presigned **POST** with a `content-length-range` policy condition (follow-up).
- **Stricter delivery**: front the bucket with CloudFront + OAC (origin private)
  and set `AVATARS_PUBLIC_BASE_URL` to the CDN domain — removes the public-read
  bucket policy entirely.
- **Old avatars**: replacing a photo writes a new key; previous objects are not
  deleted. Add a lifecycle rule or a cleanup job if storage growth matters.
