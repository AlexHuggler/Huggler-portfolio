resource "aws_glue_catalog_database" "telecom" {
  name        = "${var.project}_${var.environment}"
  description = "Telecom lakehouse Glue catalog (bronze/silver/gold)"
}

resource "aws_glue_catalog_table" "cdr_bronze" {
  database_name = aws_glue_catalog_database.telecom.name
  name          = "cdr_bronze"
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    "classification" = "parquet"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.bronze.bucket}/cdr/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }

    columns {
      name = "cdr_id"
      type = "string"
    }
    columns {
      name = "caller_msisdn"
      type = "string"
    }
    columns {
      name = "callee_msisdn"
      type = "string"
    }
    columns {
      name = "start_time"
      type = "timestamp"
    }
    columns {
      name = "duration_sec"
      type = "int"
    }
    columns {
      name = "bytes_used"
      type = "bigint"
    }
    columns {
      name = "call_type"
      type = "string"
    }
    columns {
      name = "market"
      type = "string"
    }
    columns {
      name = "plan_id"
      type = "string"
    }
    columns {
      name = "is_roaming"
      type = "boolean"
    }
  }

  partition_keys {
    name = "ingest_date"
    type = "date"
  }
}
