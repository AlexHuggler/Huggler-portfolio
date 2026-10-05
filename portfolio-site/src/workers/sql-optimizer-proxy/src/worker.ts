/**
 * sql-optimizer-proxy
 *
 * Optional Cloudflare Worker that fronts the Anthropic Messages API for
 * the portfolio's SQL optimizer demo. Lets visitors run the demo against
 * the live model without ever exposing the API key to the browser.
 *
 * As of v0.2.0 the portfolio site does not call this Worker: the demo
 * replays a static fixture even when PUBLIC_LIVE_DEMO_URL is set.
 *
 * The system prompt and user message match the Python CLI: the prompt is
 * generated from project-ai-sql-optimizer's versioned optimizer_prompt.md
 * (see scripts/generate-prompt.mjs) and the user message is a port of
 * client.py::_build_user_message (see src/optimizer.ts).
 *
 * Hard requirements:
 *   - ANTHROPIC_API_KEY must be a Worker secret (never inlined).
 *   - CORS is restricted to the configured allow-list.
 *   - Per-IP rate limiting via Workers KV (default 10 req/min).
 */

import {
  DIALECTS,
  SEVERITIES,
  buildUserMessage,
  detectDialect,
  parseSuggestion,
  type Dialect,
  type Finding,
  type Suggestion,
} from "./optimizer";
import { OPTIMIZER_PROMPT } from "./prompt.generated";

interface Env {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_PER_MIN: string;
  RATE_LIMIT: KVNamespace;
}

interface OptimizeRequest {
  sql?: unknown;
  dialect?: unknown;
  findings?: unknown;
}

interface OptimizeResponse extends Suggestion {
  model: string;
}

const MAX_SQL_CHARS = 4000;
const MAX_FINDINGS = 20;
const MAX_FINDING_MESSAGE_CHARS = 500;
const FINDING_RULE_RE = /^[a-z0-9_]{1,64}$/;

function parseDialect(value: unknown): Dialect | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return (DIALECTS as readonly unknown[]).includes(value)
    ? (value as Dialect)
    : undefined;
}

// Findings are client-supplied (the Worker does not run the sqlglot
// analyzer), so keep them to the analyzer's shape and one line each: a
// newline in a message could otherwise forge its own "## " section.
function parseFindings(value: unknown): Finding[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_FINDINGS) return undefined;
  const findings: Finding[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return undefined;
    const { rule, message, severity } = item as Record<string, unknown>;
    if (typeof rule !== "string" || !FINDING_RULE_RE.test(rule)) return undefined;
    if (
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > MAX_FINDING_MESSAGE_CHARS ||
      /[\r\n]/.test(message)
    ) {
      return undefined;
    }
    if (!(SEVERITIES as readonly unknown[]).includes(severity)) return undefined;
    findings.push({ rule, message, severity: severity as Finding["severity"] });
  }
  return findings;
}

function corsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  const allowOrigin =
    origin && allowed.includes(origin) ? origin : allowed[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  cors: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function checkRateLimit(
  env: Env,
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const limit = Number.parseInt(env.RATE_LIMIT_PER_MIN ?? "10", 10);
  const windowSec = 60;
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${ip}:${bucket}`;
  const current = Number.parseInt((await env.RATE_LIMIT.get(key)) ?? "0", 10);
  if (current >= limit) {
    const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
    return { ok: false, retryAfter };
  }
  await env.RATE_LIMIT.put(key, String(current + 1), {
    expirationTtl: windowSec * 2,
  });
  return { ok: true };
}

async function callAnthropic(
  env: Env,
  userMessage: string,
): Promise<OptimizeResponse> {
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: OPTIMIZER_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upstream ${res.status}: ${text.slice(0, 500)}`);
  }
  type MessagesResponse = {
    content: Array<{ type: string; text?: string }>;
  };
  const data = (await res.json()) as MessagesResponse;
  const text = data.content.map((b) => b.text ?? "").join("");
  return { ...parseSuggestion(text), model };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, cors);
    }
    if (origin && !allowed.includes(origin)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403, cors);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await checkRateLimit(env, ip);
    if (!rl.ok) {
      return jsonResponse(
        { error: "rate_limited", retry_after_seconds: rl.retryAfter },
        429,
        { ...cors, "Retry-After": String(rl.retryAfter) },
      );
    }

    let body: OptimizeRequest;
    try {
      body = (await request.json()) as OptimizeRequest;
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, cors);
    }
    const sql = typeof body.sql === "string" ? body.sql.trim() : "";
    if (!sql) {
      return jsonResponse({ error: "missing_sql" }, 400, cors);
    }
    if (sql.length > MAX_SQL_CHARS) {
      return jsonResponse({ error: "sql_too_long" }, 413, cors);
    }
    const dialect = parseDialect(body.dialect);
    if (dialect === undefined) {
      return jsonResponse({ error: "invalid_dialect" }, 400, cors);
    }
    const findings = parseFindings(body.findings);
    if (findings === undefined) {
      return jsonResponse({ error: "invalid_findings" }, 400, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "server_misconfigured" }, 500, cors);
    }

    try {
      const userMessage = buildUserMessage({
        sql,
        dialect: detectDialect(sql, dialect),
        findings,
      });
      const result = await callAnthropic(env, userMessage);
      return jsonResponse(result, 200, cors);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return jsonResponse({ error: "upstream_error", message }, 502, cors);
    }
  },
} satisfies ExportedHandler<Env>;
