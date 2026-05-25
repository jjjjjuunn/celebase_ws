terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Mirrors infra/cognito: state lives in the shared bootstrap bucket. Key is
  # staging-pinned here; for prod override at init:
  #   terraform init -backend-config="key=avatars/prod/terraform.tfstate"
  backend "s3" {
    bucket         = "celebbase-terraform-state"
    key            = "avatars/staging/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "celebbase-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  bucket_name = var.bucket_name != "" ? var.bucket_name : "celebbase-avatars-${var.environment}"
  common_tags = {
    ManagedBy = "terraform"
    Purpose   = "user-avatars"
    Project   = "celebbase"
    Env       = var.environment
  }
}

# ── Bucket ────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "avatars" {
  bucket = local.bucket_name
  tags   = local.common_tags
}

# Disable ACLs entirely — access is granted only via the bucket policy below.
resource "aws_s3_bucket_ownership_controls" "avatars" {
  bucket = aws_s3_bucket.avatars.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "avatars" {
  bucket = aws_s3_bucket.avatars.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── Public read (avatars/* only) ───────────────────────────────────────────────
# Profile images are public by nature. ACLs stay fully blocked; only an explicit
# bucket policy grants anonymous s3:GetObject on the avatars/ prefix. For a
# stricter posture, front this with CloudFront + OAC and serve a CDN domain as
# AVATARS_PUBLIC_BASE_URL instead (see README).

resource "aws_s3_bucket_public_access_block" "avatars" {
  bucket                  = aws_s3_bucket.avatars.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "avatars_public_read" {
  statement {
    sid       = "PublicReadAvatars"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.avatars.arn}/avatars/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "avatars_public_read" {
  bucket     = aws_s3_bucket.avatars.id
  policy     = data.aws_iam_policy_document.avatars_public_read.json
  depends_on = [aws_s3_bucket_public_access_block.avatars]
}

# CORS — native React Native fetch is NOT subject to CORS, so this only matters
# for a future browser uploader. Defaults to "*" so presigned PUT works
# everywhere; tighten allowed_origins to your web domain(s) when a browser uploads.
resource "aws_s3_bucket_cors_configuration" "avatars" {
  bucket = aws_s3_bucket.avatars.id
  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ── IAM: presign PutObject ──────────────────────────────────────────────────
# user-service signs presigned PUT URLs with ITS OWN credentials, so its runtime
# role needs s3:PutObject on avatars/*. Attach this policy to that role/task role.

data "aws_iam_policy_document" "avatars_put" {
  statement {
    sid       = "PutAvatars"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.avatars.arn}/avatars/*"]
  }
}

resource "aws_iam_policy" "avatars_put" {
  name   = "celebbase-avatars-put-${var.environment}"
  policy = data.aws_iam_policy_document.avatars_put.json
  tags   = local.common_tags
}
