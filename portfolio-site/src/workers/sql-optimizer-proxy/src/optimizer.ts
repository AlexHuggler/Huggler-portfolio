/**
 * Request-side and response-side helpers shared with the Python CLI.
 *
 * Each function is a port of its counterpart in project-ai-sql-optimizer so
 * the Worker and `sql-optimizer analyze` send the model the same thing:
 *
 *   detectDialect    <- sql_optimizer/cli.py::_detect_dialect
 *   buildUserMessage <- sql_optimizer/client.py::_build_user_message
 *   parseSuggestion  <- sql_optimizer/client.py::_parse_suggestion
 *
 * buildUserMessage is held byte-for-byte to the Python output by the shared
 * fixture project-ai-sql-optimizer/tests/fixtures/user_message_parity.json,
 * which both test suites assert against.
 */

export const DIALECTS = ["spark", "snowflake", "ansi"] as const;
export type Dialect = (typeof DIALECTS)[number];

// Mirrors sql_optimizer/analyzer.py::Severity.
export const SEVERITIES = ["info", "warn", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

// Mirrors sql_optimizer/analyzer.py::Finding.
export interface Finding {
  rule: string;
  message: string;
  severity: Severity;
}

export interface Suggestion {
  rewrite: string;
  reasoning: string;
  confidence: string;
}

export function detectDialect(sql: string, override?: Dialect | null): Dialect {
  if (override) return override;
  const upper = sql.toUpperCase();
  if (
    upper.includes("QUALIFY ") ||
    upper.includes("ILIKE ") ||
    upper.includes("FLATTEN(")
  ) {
    return "snowflake";
  }
  return "spark";
}

export function buildUserMessage(input: {
  sql: string;
  dialect: Dialect;
  findings: readonly Finding[];
}): string {
  const parts = [`## Dialect\n${input.dialect}`, "## SQL", "```sql", input.sql, "```"];
  if (input.findings.length > 0) {
    parts.push("## Heuristic findings");
    for (const f of input.findings) {
      parts.push(`- (${f.severity}) ${f.rule}: ${f.message}`);
    }
  }
  parts.push(
    "Return your answer as a JSON object with keys `rewrite`, `reasoning`, `confidence`.",
  );
  return parts.join("\n");
}

function field(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return value === undefined ? fallback : String(value);
}

/**
 * Tolerant JSON parse of the model response. The prompt asks for a bare JSON
 * object, but the model occasionally wraps it in a markdown fence.
 */
export function parseSuggestion(text: string): Suggestion {
  let cleaned = text.trim();
  const fence = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(cleaned);
  if (fence) cleaned = fence[1];

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return { rewrite: "", reasoning: text, confidence: "low" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { rewrite: "", reasoning: text, confidence: "low" };
  }
  const record = data as Record<string, unknown>;
  return {
    rewrite: field(record, "rewrite", ""),
    reasoning: field(record, "reasoning", ""),
    confidence: field(record, "confidence", "medium"),
  };
}
