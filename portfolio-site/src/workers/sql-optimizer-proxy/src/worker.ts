/**
 * sql-optimizer-proxy
 *
 * Optional Cloudflare Worker that fronts the Anthropic Messages API for
 * the portfolio's SQL optimizer demo. Lets visitors run the demo against
 * the live model without ever exposing the API key to the browser.
 *
 * The portfolio site reads PUBLIC_LIVE_DEMO_URL at build time; if it is
 * unset (the default), the demo runs purely from the static fixture and
 * this Worker is not invoked.
 *
 * Hard requirements:
 *   - ANTHROPIC_API_KEY must be a Worker secret (never inlined).
 *   - CORS is restricted to the configured allow-list.
 *   - Per-IP rate limiting via Workers KV (default 10 req/min).
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_PER_MIN: string;
  RATE_LIMIT: KVNamespace;
}

interface OptimizeRequest {
  sql?: unknown;
}

interface ReasoningItem {
  icon: string;
  text: string;
}

interface OptimizeResponse {
  optimized_sql: string;
  reasoning: ReasoningItem[];
  estimated_cost_reduction_pct: number;
  model: string;
}

// Mirror of the optimizer prompt in the project repo
// (`prompts/optimizer_prompt.md`). Duplicated here so the Worker is
// self-contained and can be deployed without checkout-out the repo.
const OPTIMIZER_PROMPT = `You are a senior data engineer reviewing a SQL query for performance.

Rewrite the input query so it runs more efficiently on Spark SQL or
Snowflake while preserving its semantics. Focus on:

- Predicate pushdown into joins and CTEs
- Partition pruning (avoid wrapping partition columns in functions)
- Replacing exact COUNT(DISTINCT) with APPROX_COUNT_DISTINCT when the metric tolerates ~1.6% error
- Broadcast-join hints for small dimension tables
- Flattening pass-through CTEs
- Promoting LEFT JOIN to INNER when the WHERE clause discards null right-hand rows

Return strict JSON with this shape and NO surrounding prose:
{
  "optimized_sql": string,
  "reasoning": [{ "icon": "Filter|Database|Zap|GitBranch|Gauge|Layers|Sparkles|Calendar", "text": string }],
  "estimated_cost_reduction_pct": number  // 0..100, your honest estimate; 0 if no rewrite is warranted
}`;

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
  sql: string,
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
      max_tokens: 1024,
      system: OPTIMIZER_PROMPT,
      messages: [
        {
          role: "user",
          content: `Original query:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nReturn the JSON now.`,
        },
      ],
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
  const textBlock = data.content.find((b) => b.type === "text");
  const raw = textBlock?.text ?? "";
  const trimmed = raw.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(trimmed) as Omit<OptimizeResponse, "model">;
  return { ...parsed, model };
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
    if (sql.length > 4000) {
      return jsonResponse({ error: "sql_too_long" }, 413, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "server_misconfigured" }, 500, cors);
    }

    try {
      const result = await callAnthropic(env, sql);
      return jsonResponse(result, 200, cors);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return jsonResponse({ error: "upstream_error", message }, 502, cors);
    }
  },
} satisfies ExportedHandler<Env>;
