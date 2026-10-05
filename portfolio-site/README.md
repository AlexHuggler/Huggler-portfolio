# Portfolio Site

Static portfolio for [Alex Huggler](https://github.com/alexhuggler) built with
Astro 5, Tailwind CSS, MDX, React islands, and TypeScript. Deploys to
GitHub Pages, fronted by Cloudflare for HTTPS and analytics. See
[CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## Stack

- Astro 5 with view transitions (`ClientRouter`)
- React 19 islands, hydrated `client:visible`, only where state is needed
- Tailwind CSS 3 mapped onto CSS-variable design tokens (`src/styles/global.css`)
- TypeScript strict
- Space Grotesk (display), Inter (body), JetBrains Mono (code, labels) via `@fontsource-variable`
- Apache ECharts 5, tree-shaken through `src/components/viz/EChart.tsx`
- Shiki with a CSS-variables theme, so code blocks follow light and dark mode

## Getting started

```bash
npm install
npm run dev        # http://localhost:4321
```

| Script | What it does |
| --- | --- |
| `npm run build` | Production build to `./dist` |
| `npm run preview` | Serve the production build |
| `npm run check` | `astro check` (types and templates) |
| `npm run validate` | Guardrail: no hard-coded colours, no banned claims, every metric id resolves, data files agree |
| `npm run data:check` | Regenerates the telecom scenario in memory and fails if `src/data/viz/telecom.json` drifts |
| `npm run data:viz` | Regenerates `src/data/viz/telecom.json` |
| `npm run measure` | Re-runs every project's make targets and rewrites `measured.json` (needs `uv` and PyPI access) |
| `npm run measure:render` | Re-renders metric labels from the stored evaluations only |
| `npm run qa` | Release QA against `npm run preview`: axe (WCAG 2.2 AA) in both themes at 1280 and 375 wide, keyboard flows, reduced motion, console errors, third-party requests, CLS, two-page résumé print. `--shots <dir>` also saves screenshots at four widths. Needs Chromium: `npx playwright install chromium`, or point `CHROMIUM_PATH` at an existing Chromium |

CI (`.github/workflows/site-ci.yml`) runs `check`, `validate`, `data:check` and
`build` on every pull request that touches the site.

## Where the numbers come from

Every figure on the site traces to one of three sources, and the site says
which:

1. **Measured** — `src/data/measured.json`, written only by
   `scripts/measure.py`. It runs each project's own make targets, keeps the
   raw transcripts in `src/data/measurements/`, and cross-checks the
   exporters against them. Components read it through `src/data/measured.ts`
   (`metric(id)`, `projectMetrics()`, `evaluation()`). Never hand-edit it.
2. **Exported artifacts** — `scripts/artifacts/{sqlopt,fraud,telecom}.py`
   export the real corpus, evaluation set, DAGs, dbt graph and sample rows
   into `src/data/{sqlopt,fraud,lakehouse}/`. Each has `--check`.
3. **Scenario** — `scripts/generate_viz_data.py` simulates a year of telecom
   traffic with the lakehouse's dbt pricing and churn rules (seed 42). Charts
   built on it carry a "Scenario" chip.

Career figures from AT&T appear only on narrative pages (Home, About,
Résumé) and are kept visibly apart from the reproducible numbers. The
`/evidence` page lists every metric, its method, its transcript, and what is
not measured.

## Editing content

| To change | Edit |
| --- | --- |
| Site name, links, résumé path | `src/site.config.ts` |
| Homepage sections | `src/pages/index.astro` + `src/components/home/*` |
| Experience, credentials, stack, principles | `src/data/{experience,credentials,stack,principles}.ts` |
| Project copy and narrative | `src/content/projects/*.mdx` |
| Case-study pages | `src/pages/projects/*.astro` + `src/components/{sqlopt,fraud,lakehouse}/*` |
| Architecture diagrams | `src/data/architecture.ts` |
| Capability matrix | `src/data/capability-matrix.ts` |
| Command-palette index | `src/data/search-index.ts` |
| SQL reference rewrites | `src/data/sqlopt/rewrites/*.sql` + `rewrite-notes.ts` |
| Dashboards | `src/pages/visualizations.astro` + `src/components/viz/*` |
| Résumé PDF | `public/Alexandre_Huggler_Resume.pdf` |
| OG image | edit `scripts/og-template.html`, then `node scripts/generate-og.mjs` |
| Favicons | `node scripts/generate-icons.mjs` |
| Colours, type, spacing | tokens in `src/styles/global.css` (Tailwind maps them in `tailwind.config.mjs`) |

## Interactive surfaces

- **Command palette** (⌘K, Ctrl+K or `/`): pages, case-study sections,
  dashboard tabs and metrics, plus quick actions. Vanilla script, no React.
- **SQL optimizer:** a query workbench over the five corpus queries with the
  analyzer's real findings, a labelled reference rewrite with a diff, and the
  exact payload Claude would receive.
- **Fraud signals:** a replay of the real evaluation feed with verdicts, the
  real detector source, and a precision/recall threshold explorer.
- **Telecom lakehouse:** medallion tiers with real schemas and masked rows,
  the three Airflow DAGs, a clickable dbt lineage graph, and the data-contract
  surface.
- **Dashboards:** tabbed and hash-linked. Every chart has a computed takeaway,
  a provenance chip, a data table, CSV export, full-screen view and a copy-link
  action; the telecom dashboard cross-filters by market.

All motion follows one policy (`src/scripts/motion.ts`,
`src/hooks/usePausable.ts`): it respects `prefers-reduced-motion`, pauses
off-screen and in hidden tabs, and every animation has a pause control.

## Environment

Copy `.env.example` to `.env` (gitignored) and set:

```
PUBLIC_CF_ANALYTICS_TOKEN=...   # optional; Cloudflare Web Analytics beacon
```

The site builds and runs without it.

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

The Worker at `src/workers/sql-optimizer-proxy/` proxies the Anthropic
API without exposing keys. **The site does not call it as of 0.2.0**: the
SQL workbench shows the exact payload Claude would receive instead of a
live response. The Worker is kept for a future live mode.

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
`your-domain.com/api/sql-optimize/*`.

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
- No emojis in code, copy, or icons.
- No hard-coded colours in components; read tokens (`npm run validate` enforces it).
- No number in copy that isn't in `measured.json` or computed from an exported artifact. Simulated data always carries a chip.
- No real API keys committed. The optional Worker is the only path to live API calls.
- Every chart has a table view; every animation has a pause control.

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
