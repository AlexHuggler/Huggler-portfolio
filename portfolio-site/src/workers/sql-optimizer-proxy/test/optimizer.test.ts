import { describe, expect, it } from "vitest";
import parity from "../../../../../project-ai-sql-optimizer/tests/fixtures/user_message_parity.json";
import {
  buildUserMessage,
  detectDialect,
  parseSuggestion,
  type Dialect,
  type Finding,
} from "../src/optimizer";

interface ParityCase {
  name: string;
  sql: string;
  dialect: Dialect | null;
  findings: Finding[];
  expected: string;
}

describe("buildUserMessage matches client.py::_build_user_message", () => {
  it.each((parity.cases as ParityCase[]).map((c) => [c.name, c] as const))(
    "%s",
    (_name, c) => {
      const message = buildUserMessage({
        sql: c.sql,
        dialect: detectDialect(c.sql, c.dialect),
        findings: c.findings,
      });
      expect(message).toBe(c.expected);
    },
  );
});

describe("detectDialect matches cli.py::_detect_dialect", () => {
  it("prefers an explicit override", () => {
    expect(detectDialect("SELECT 1 QUALIFY x = 1", "ansi")).toBe("ansi");
  });

  it.each([
    "select * from t qualify row_number() over (order by a) = 1",
    "SELECT * FROM t WHERE name ILIKE 'a%'",
    "SELECT f.value FROM t, LATERAL FLATTEN(input => t.arr) f",
  ])("detects snowflake in %s", (sql) => {
    expect(detectDialect(sql)).toBe("snowflake");
  });

  it("defaults to spark", () => {
    expect(detectDialect("SELECT id FROM events")).toBe("spark");
  });
});

// Same cases as tests/test_client.py's _parse_suggestion tests.
describe("parseSuggestion matches client.py::_parse_suggestion", () => {
  it("extracts a JSON object", () => {
    const s = parseSuggestion(
      '{"rewrite": "SELECT 1", "reasoning": "ok", "confidence": "high"}',
    );
    expect(s.rewrite).toBe("SELECT 1");
    expect(s.confidence).toBe("high");
  });

  it("handles a markdown fence", () => {
    const s = parseSuggestion(
      '```json\n{"rewrite": "SELECT 1", "reasoning": "ok", "confidence": "medium"}\n```',
    );
    expect(s.rewrite).toBe("SELECT 1");
    expect(s.confidence).toBe("medium");
  });

  it("falls back to low confidence", () => {
    const s = parseSuggestion("not json at all");
    expect(s.confidence).toBe("low");
    expect(s.reasoning).toContain("not json");
  });
});
