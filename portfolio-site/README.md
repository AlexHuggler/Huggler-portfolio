# Portfolio Site

Static portfolio for [Alex Huggler](https://github.com/alexhuggler) built with
Astro 5, Tailwind CSS, MDX, React islands, and TypeScript. Deploys to
GitHub Pages, fronted by Cloudflare for HTTPS, analytics, and (optionally)
a Worker that runs the SQL optimizer demo against the live Anthropic API.

## Stack

- Astro 5.x with View Transitions API
- React 18 islands (hydrated `client:visible`) for interactive demos
- Tailwind CSS (custom dark/light palette)
- TypeScript (strict mode, no `any`)
- Inter (body) + JetBrains Mono (code/pills) via `@fontsource`
- Mermaid for inline architecture diagrams
- Recharts (charts), React Flow (DAG/lineage), Framer Motion (motion),
  Monaco editor + react-diff-viewer-continued (SQL demo)

## Getting started

```bash
npm install
npm run dev
```

Site runs at http://localhost:4321.

```bash
npm run build      # production build to ./dist
npm run preview    # preview the production build
```

## Editing content

| To change | Edit |
| --- | --- |
| Hero, stats, focus areas | `src/pages/index.astro` |
| Site name, links, resume path | `src/site.config.ts` |
| Fraud-signals project page | `src/pages/projects/fraud-signals.astro` + `src/components/fraud/*` |
| Lakehouse project page | `src/pages/projects/telecom-lakehouse.astro` + `src/components/lakehouse/*` |
| SQL optimizer project page | `src/pages/projects/ai-sql-optimizer.astro` + `src/components/sqlopt/*` |
| Project metadata (titles, taglines, repo URLs) | `src/content/projects/*.mdx` |
| Static demo data | `src/data/*.json` |
| About page | `src/pages/about.astro` |
| Resume PDF | `public/alex-huggler-resume.pdf` |
| OG image | `public/og-image.svg` (re-export to `og-image.png`) |
| Theme palette | `tailwind.config.mjs` |

The interactive project pages own their routes directly. The legacy
`[slug].astro` dynamic route now skips those three slugs and only
renders any future MDX-only project entries.

## Project demos

Each of the three project pages is an interactive recruiter-facing
showcase, not a static README dump. Components live under
`src/components/<project>/`:

- `fraud/` — animated pipeline canvas, scrolling synthetic feed, throughput chart, anomaly pattern cards.
- `lakehouse/` — Medallion diagram, layer drill-down tabs, animated Airflow DAG, data-quality scorecard, dbt lineage preview.
- `sqlopt/` — query selector, side-by-side Monaco editors with typing animation, inline diff, reasoning panel, benchmark chart.

All animations honor `prefers-reduced-motion` and have keyboard-reachable
controls. Charts include a visually-hidden `<table>` fallback for
screen readers.

## Environment

Copy `.env.example` to `.env` (gitignored) and set:

```
PUBLIC_CF_ANALYTICS_TOKEN=...   # optional; Cloudflare Web Analytics beacon
PUBLIC_LIVE_DEMO_URL=...        # optional; Worker URL for SQL optimizer live mode
```

Both are optional. The site builds and runs without either.

## Deploying to Cloudflare-fronted GitHub Pages

The recommended setup is GitHub Pages for hosting + Cloudflare for DNS,
HTTPS in front, analytics, and the optional API Worker. The order of
operations matters because Cloudflare's proxy will block GitHub's
Let's Encrypt provisioning if enabled too early.

### 1. DNS at Cloudflare (first-time)

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | REPLACE_USERNAME.github.io |

**Critical:** set the orange cloud (proxy) to OFF (DNS only / gray
cloud) for both records initially. GitHub Pages provisions a
Let's Encrypt cert directly, and the Cloudflare proxy interferes with
that handshake.

### 2. GitHub Pages

1. **Settings → Pages** → set source to "GitHub Actions". The included
   `.github/workflows/deploy.yml` builds and publishes on every push to
   `main`.
2. Add your custom domain in the same panel.
3. Wait for the green "DNS check successful" badge.
4. Wait for the "Enforce HTTPS" checkbox to become enabled (Let's Encrypt
   provisioning takes up to ~10 minutes once DNS resolves).
5. Enable "Enforce HTTPS".
6. Verify `https://your-domain.com` loads cleanly.

### 3. Switch Cloudflare to proxied

1. Back in Cloudflare → DNS, flip the orange cloud ON (Proxied) for both
   the apex and `www` records.
2. **SSL/TLS → Overview**: set encryption mode to **Full**. Do NOT use
   Flexible — it causes redirect loops with GitHub Pages' HTTPS.
3. **SSL/TLS → Edge Certificates**: enable "Always Use HTTPS" and
   "Automatic HTTPS Rewrites".

### 4. Cloudflare Web Analytics (cookieless)

1. **Web Analytics → Add a site** → enter your domain.
2. Copy the beacon's site token.
3. Set `PUBLIC_CF_ANALYTICS_TOKEN` in your `.env` (local builds) and as
   a GitHub repo secret (CI builds).
4. The base layout reads the env var and only injects the beacon when
   it is set. Cookieless, no consent banner needed.

### 5. Optional: deploy the SQL optimizer Worker

The Worker at `src/workers/sql-optimizer-proxy/` lets the optimizer
demo run against the live Anthropic API without exposing keys. Off by
default; only deploy if you want live mode.

```bash
cd src/workers/sql-optimizer-proxy
npm install
wrangler login
wrangler kv:namespace create RATE_LIMIT
# paste the printed namespace id into wrangler.toml under [[kv_namespaces]]
wrangler secret put ANTHROPIC_API_KEY
# paste the key when prompted; never commit it
wrangler deploy
```

Then in Cloudflare → Workers Routes, bind the Worker to
`your-domain.com/api/sql-optimize/*`. Set
`PUBLIC_LIVE_DEMO_URL=https://your-domain.com/api/sql-optimize` in the
portfolio's `.env` and rebuild.

See `src/workers/sql-optimizer-proxy/README.md` for the full Worker
setup, response schema, rate-limit knobs, and security checklist.

### Verifying

After all steps:

```bash
curl -sI https://your-domain.com | head -10
# expect: HTTP/2 200, server: cloudflare, strict-transport-security present
```

Also visit `https://your-domain.com` and confirm:
- Each project page interactive demo plays smoothly.
- View transitions animate between routes.
- Cloudflare Web Analytics shows page views (allow ~5 min).
- Reduced-motion mode (system-level) replaces motion with static views.

## Security headers

`public/_headers` ships these on every response:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

GitHub Pages itself ignores `_headers`, but Cloudflare honors it via
the Pages-style format when the site is proxied. If you migrate
hosting to Cloudflare Pages directly, the file becomes authoritative.

## SEO + meta

- Per-page `<title>` and `<meta description>` come from `BaseLayout.astro` props.
- Open Graph and Twitter Card meta tags are emitted on every page.
- JSON-LD `Person` schema renders only on the home page.
- `robots.txt` and `sitemap-index.xml` (via `@astrojs/sitemap`) ship at the root.

## Conventions

- No third-party tracking scripts. Cloudflare Web Analytics is cookieless and is the only analytics permitted.
- No emojis in code, copy, or icons. lucide-react icons throughout.
- No invented benchmark numbers presented as real — all demo charts use clearly-labeled illustrative placeholders.
- No real API keys committed. The optional Worker is the only path to live API calls.
- TypeScript strict; React islands hydrate `client:visible` to keep the initial paint fast.
- Use `[TODO: ...]` markers in MDX for any metric you have not measured personally.

## Performance budget

Per-page Lighthouse desktop targets:

| Metric | Target |
| --- | --- |
| Performance | ≥ 90 |
| Accessibility | ≥ 95 |
| Best Practices | ≥ 95 |
| SEO | 100 |

Verify with `npm run build && npx serve dist` then run Lighthouse on
`http://localhost:3000/projects/fraud-signals` (and the other two).
