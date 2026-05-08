terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
  # Local backend so `terraform plan` works without an S3 bucket configured.
  backend "local" {
    path = "terraform.tfstate"
  }
}

variable "aws_region" {
  description = "AWS region for the lakehouse"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Resource name prefix"
  type        = string
  default     = "telecom-lakehouse"
}

variable "environment" {
  description = "Environment tag"
  type        = string
  default     = "dev"
}

provider "aws" {
  region                      = var.aws_region
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  bucket_raw    = "${var.project}-raw-${var.environment}"
  bucket_bronze = "${var.project}-bronze-${var.environment}"
  bucket_silver = "${var.project}-silver-${var.environment}"
  bucket_gold   = "${var.project}-gold-${var.environment}"
}

output "buckets" {
  value = {
    raw    = local.bucket_raw
    bronze = local.bucket_bronze
    silver = local.bucket_silver
    gold   = local.bucket_gold
  }
}
