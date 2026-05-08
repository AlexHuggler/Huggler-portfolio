resource "aws_s3_bucket" "raw" {
  bucket = local.bucket_raw
}

resource "aws_s3_bucket" "bronze" {
  bucket = local.bucket_bronze
}

resource "aws_s3_bucket" "silver" {
  bucket = local.bucket_silver
}

resource "aws_s3_bucket" "gold" {
  bucket = local.bucket_gold
}

resource "aws_s3_bucket_versioning" "all" {
  for_each = {
    raw    = aws_s3_bucket.raw.id
    bronze = aws_s3_bucket.bronze.id
    silver = aws_s3_bucket.silver.id
    gold   = aws_s3_bucket.gold.id
  }
  bucket = each.value
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "all" {
  for_each = {
    raw    = aws_s3_bucket.raw.id
    bronze = aws_s3_bucket.bronze.id
    silver = aws_s3_bucket.silver.id
    gold   = aws_s3_bucket.gold.id
  }
  bucket = each.value
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = {
    raw    = aws_s3_bucket.raw.id
    bronze = aws_s3_bucket.bronze.id
    silver = aws_s3_bucket.silver.id
    gold   = aws_s3_bucket.gold.id
  }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
