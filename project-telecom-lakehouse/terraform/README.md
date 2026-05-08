# Terraform: AWS deployment

This directory provisions the production-shaped AWS variant of the lakehouse:

- Four S3 buckets (`raw`, `bronze`, `silver`, `gold`) with versioning + AES256
  encryption + public-access blocks.
- A Glue catalog database and a `cdr_bronze` table (parquet, partitioned by
  `ingest_date`) so Athena can query Bronze without dbt.

## Usage

The state backend is `local` so you can `terraform plan` without an S3 bucket.
Switch to a remote backend (S3 + DynamoDB lock) before sharing state.

```bash
# Without AWS credentials - validates HCL only
terraform init -backend=false
terraform validate

# With AWS credentials
export AWS_PROFILE=your-profile
terraform init
terraform plan -var environment=dev
terraform apply -var environment=dev
```

## What is intentionally not provisioned

- IAM roles, KMS keys, and VPC plumbing - too environment-specific to template here.
- An EMR / Glue job for the Bronze->Silver transform - in this stack we run
  that locally via `lakehouse.transform` or via Airflow, so the same job code
  ships everywhere.
- Athena workgroups - assumes the default workgroup.

## Variables

| Variable | Default | Notes |
| --- | --- | --- |
| `aws_region` | `us-east-1` | Region for all resources |
| `project` | `telecom-lakehouse` | Resource name prefix |
| `environment` | `dev` | Tag, also part of bucket names |
