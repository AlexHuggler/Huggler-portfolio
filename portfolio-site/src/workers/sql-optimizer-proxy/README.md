# sql-optimizer-proxy

Cloudflare Worker that fronts the Anthropic Messages API for the
portfolio site's SQL optimizer demo. Optional and OFF by default — the
demo runs purely from a static fixture unless `PUBLIC_LIVE_DEMO_URL` is
set in the portfolio's environment.

## Why this exists

The portfolio site is fully static. Any "live AI" demo needs an API
proxy because client-side calls would require shipping a key. This
Worker handles three things:

1. Holds the Anthropic API key as a Worker secret (never client-visible).
2. Restricts CORS to the portfolio domain.
3. Rate-limits per IP (default 10 req/min) via Workers KV.

## Files

- `src/worker.ts` — the Worker entry point.
- `wrangler.toml` — deployment config. Replace placeholders before deploy.
- `package.json` — dev dependencies (wrangler, types).
- `tsconfig.json` — strict TypeScript, Worker types.

The optimizer prompt is duplicated inline in `src/worker.ts` (mirrored
from `prompts/optimizer_prompt.md` in the project repo) so this Worker
is self-contained.

## Deploy

From this directory:

```bash
npm install
wrangler login
wrangler kv:namespace create RATE_LIMIT
# paste the printed namespace id into wrangler.toml under [[kv_namespaces]]

wrangler secret put ANTHROPIC_API_KEY
# paste your key when prompted; it is stored encrypted, never in source

wrangler deploy
```

Then in the Cloudflare dashboard, bind the Worker to a route on your
domain — e.g. `your-domain.com/api/sql-optimize/*`.

## Wire into the portfolio

Set this in the portfolio's GitHub repo secrets / `.env`:

```
PUBLIC_LIVE_DEMO_URL=https://your-domain.com/api/sql-optimize
```

Rebuild the portfolio (`npm run build`). The SQL optimizer demo now
fetches from the Worker on user-initiated runs; without the env var it
falls back to the pre-computed fixture.

## Local dev

```bash
wrangler dev
# Worker runs at http://localhost:8787
```

POST a JSON body:

```bash
curl -s http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM events WHERE date_format(ts, '\''yyyy-MM'\'') = '\''2026-04'\''"}'
```

## Response shape

```json
{
  "optimized_sql": "...",
  "reasoning": [
    {"icon": "Filter", "text": "..."}
  ],
  "estimated_cost_reduction_pct": 42,
  "model": "claude-sonnet-4-6"
}
```

## Limits

- Body must be < 4 KB.
- Rate limit: `RATE_LIMIT_PER_MIN` (default 10) per IP per 60s window.
- Allowed origins: `ALLOWED_ORIGINS` (comma-separated) in `wrangler.toml`.

## Security checklist before deploy

- [ ] `ANTHROPIC_API_KEY` set as a secret, not in `wrangler.toml`.
- [ ] `ALLOWED_ORIGINS` does NOT contain `*`.
- [ ] KV namespace bound and id pasted into `wrangler.toml`.
- [ ] Route in Cloudflare dashboard restricts the public path you intend to expose.
- [ ] Cloudflare WAF rules consider this endpoint (optional, recommended).
