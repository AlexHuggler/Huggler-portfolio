# sql-optimizer-proxy

Cloudflare Worker that fronts the Anthropic Messages API for the
portfolio site's SQL optimizer demo. Optional and OFF by default — as
of v0.2.0 the demo replays a static fixture and does not call this
Worker (see [Wire into the portfolio](#wire-into-the-portfolio)).

## Why this exists

The portfolio site is fully static. Any "live AI" demo needs an API
proxy because client-side calls would require shipping a key. This
Worker handles three things:

1. Holds the Anthropic API key as a Worker secret (never client-visible).
2. Restricts CORS to the portfolio domain.
3. Rate-limits per IP (default 10 req/min) via Workers KV.

## Files

- `src/worker.ts` — the Worker entry point: CORS, rate limit, request
  validation, the Anthropic call.
- `src/optimizer.ts` — TypeScript ports of the CLI's dialect detection,
  user-message builder, and response parser.
- `src/prompt.generated.ts` — the system prompt. **Generated; do not edit.**
- `scripts/generate-prompt.mjs` — writes (or `--check`s) the generated prompt.
- `test/` — vitest suites (parity with the CLI, request handling).
- `wrangler.toml` — deployment config. Replace placeholders before deploy.
- `package.json` — scripts and dev dependencies (wrangler, types, vitest).
- `tsconfig.json` — strict TypeScript, Worker types.

## Prompt provenance

The Worker sends the model exactly what the CLI in
[`project-ai-sql-optimizer`](../../../../project-ai-sql-optimizer) sends:

- **System prompt.** `src/prompt.generated.ts` is generated from the
  versioned prompt at
  `project-ai-sql-optimizer/src/sql_optimizer/prompts/optimizer_prompt.md`
  (byte-for-byte, line endings normalized to LF). The generated file is
  committed, so this directory still deploys on its own.
- **User message.** `buildUserMessage` in `src/optimizer.ts` is a port of
  `client.py::_build_user_message`, and a missing `dialect` is resolved
  with a port of `cli.py::_detect_dialect`.

To change the prompt, edit the `.md` file, then regenerate:

```bash
npm run generate:prompt   # rewrite src/prompt.generated.ts
npm run check:prompt      # exit 1 if it is stale
```

Drift is caught in three places:

- The `sql-optimizer-proxy CI` workflow
  (`.github/workflows/ci-sql-optimizer-proxy.yml`) runs `check:prompt`
  whenever the Worker, the prompt, `client.py`, or `cli.py` changes.
- `npm run deploy` runs `check:prompt` first (`predeploy`), so a stale
  prompt is never deployed. `npm run dev` regenerates it (`predev`).
- The user-message format is pinned by the shared fixture
  `project-ai-sql-optimizer/tests/fixtures/user_message_parity.json`.
  Both `tests/test_client.py` (Python) and `test/optimizer.test.ts`
  (Worker) assert against it, so a change on either side fails until
  both sides and the fixture agree.

## Deploy

From this directory:

```bash
npm install
wrangler login
wrangler kv:namespace create RATE_LIMIT
# paste the printed namespace id into wrangler.toml under [[kv_namespaces]]

wrangler secret put ANTHROPIC_API_KEY
# paste your key when prompted; it is stored encrypted, never in source

npm run deploy
# runs check:prompt, then wrangler deploy
```

Then in the Cloudflare dashboard, bind the Worker to a route on your
domain — e.g. `your-domain.com/api/sql-optimize/*`.

## Wire into the portfolio

Not wired yet. As of v0.2.0 the site reads `PUBLIC_LIVE_DEMO_URL` at
build time (`portfolio-site/src/components/sqlopt/SqlOptimizerDemo.tsx`) but never
calls the Worker; the demo always replays
`portfolio-site/src/data/sql-optimizations.json`. That fixture's shape
(`optimized_sql`, `reasoning[]` with icons, `estimated_cost_reduction_pct`)
is also not what this Worker returns (see [Response shape](#response-shape)),
so turning on live mode needs a fetch path plus an adapter in the demo
component, not just the env var.

## Local dev

```bash
npm run dev
# regenerates the prompt, then runs `wrangler dev` at http://localhost:8787
```

POST a JSON body:

```bash
curl -s http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM events WHERE date_format(ts, '\''yyyy-MM'\'') = '\''2026-04'\''","dialect":"spark"}'
```

## Tests

```bash
npm run check:prompt   # generated prompt matches optimizer_prompt.md
npm run typecheck      # tsc --noEmit over src/ and test/
npm test               # vitest: CLI parity fixture, parser, request handling
```

## Request shape

```json
{
  "sql": "SELECT ...",
  "dialect": "spark",
  "findings": [
    {"rule": "select_star", "message": "SELECT * fans out columns ...", "severity": "warn"}
  ]
}
```

- `sql` (required): the query, trimmed, at most 4000 characters.
- `dialect` (optional): `spark`, `snowflake`, or `ansi`. When omitted it
  is detected the way the CLI does it: `QUALIFY`, `ILIKE`, or `FLATTEN(`
  means `snowflake`, otherwise `spark`.
- `findings` (optional): heuristic findings in the shape of
  `sql_optimizer.analyzer.Finding`. The Worker does not run the sqlglot
  analyzer, so these are whatever the caller supplies. At most 20, each
  with a `rule` matching `^[a-z0-9_]{1,64}$`, a single-line `message` of
  at most 500 characters, and a `severity` of `info`, `warn`, or `high`.

Invalid input returns `400` with `invalid_json`, `missing_sql`,
`invalid_dialect`, or `invalid_findings`; an oversized query returns
`413 sql_too_long`.

## User message

Built by `buildUserMessage`, identical to the CLI's
`_build_user_message` (lines joined with `\n`; the findings section only
appears when there are findings):

````text
## Dialect
spark
## SQL
```sql
SELECT ...
```
## Heuristic findings
- (warn) select_star: SELECT * fans out columns ...
Return your answer as a JSON object with keys `rewrite`, `reasoning`, `confidence`.
````

The request uses `max_tokens: 2048`, matching the CLI.

## Response shape

The versioned prompt asks for `rewrite`, `reasoning`, and `confidence`,
and the Worker returns them as-is plus the model id:

```json
{
  "rewrite": "SELECT ...",
  "reasoning": "2-4 sentences on the changes and the assumptions behind them.",
  "confidence": "medium",
  "model": "claude-sonnet-4-6"
}
```

Parsing mirrors `client.py::_parse_suggestion`: a fenced ```` ```json ````
block is unwrapped, and output that is not a JSON object comes back as
`{"rewrite": "", "reasoning": "<raw model text>", "confidence": "low"}`
rather than an error. Upstream API failures return `502 upstream_error`.

## Limits

- `sql` at most 4000 characters; at most 20 `findings`.
- Rate limit: `RATE_LIMIT_PER_MIN` (default 10) per IP per 60s window.
- Allowed origins: `ALLOWED_ORIGINS` (comma-separated) in `wrangler.toml`.

## Security checklist before deploy

- [ ] `npm run check:prompt` passes (`npm run deploy` runs it for you).
- [ ] `ANTHROPIC_API_KEY` set as a secret, not in `wrangler.toml`.
- [ ] `ALLOWED_ORIGINS` does NOT contain `*`.
- [ ] KV namespace bound and id pasted into `wrangler.toml`.
- [ ] Route in Cloudflare dashboard restricts the public path you intend to expose.
- [ ] Cloudflare WAF rules consider this endpoint (optional, recommended).
