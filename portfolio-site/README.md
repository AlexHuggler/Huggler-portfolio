# Portfolio Site

Static portfolio for [Alex Huggler](https://github.com/alexhuggler) built with
Astro 4, Tailwind CSS, MDX, and TypeScript. Deploys to GitHub Pages.

## Stack

- Astro 4.x (zero-JS by default, MDX content collections)
- Tailwind CSS (custom dark/light palette)
- TypeScript (strict mode)
- Inter (body) + JetBrains Mono (code/pills) via `@fontsource`
- Mermaid for inline architecture diagrams

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
| Project pages | `src/content/projects/*.mdx` |
| About page | `src/pages/about.astro` |
| Resume PDF | `public/alex-huggler-resume.pdf` |
| OG image | `public/og-image.svg` (re-export to `og-image.png`) |
| Theme palette | `tailwind.config.mjs` |

Each project page lives in `src/content/projects/<slug>.mdx`. Frontmatter
drives the project card; the MDX body fills the detail page. Use
`<MermaidBlock code={...} />` for inline architecture diagrams.

## Deploying to GitHub Pages

This repo includes a workflow at `.github/workflows/deploy.yml` that builds
and deploys on every push to `main`.

### One-time setup

1. In the GitHub repo, go to **Settings -> Pages** and set the source to
   "GitHub Actions".
2. Decide on a deployment scenario in `astro.config.mjs`:
   - **Custom domain** (recommended): keep `site` as your https URL, leave
     `base` undefined, and put your domain in `public/CNAME`.
   - **Project page** (e.g. `username.github.io/Huggler-portfolio`): set
     `site` to `https://<username>.github.io` and uncomment the `base`
     line. Delete `public/CNAME`.
3. Optional: set a repo variable `SITE_URL` to override the default.

### Custom domain DNS

If you are using a custom domain (e.g. `alexhuggler.com`), add the following
records at your DNS provider:

**Apex domain (`alexhuggler.com`)**

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

**`www` subdomain**

| Type | Name | Value |
| --- | --- | --- |
| CNAME | www | alexhuggler.github.io |

After DNS propagates (up to 24h), enable "Enforce HTTPS" in
Settings -> Pages.

## SEO + meta

- Per-page `<title>` and `<meta description>` come from `BaseLayout.astro` props.
- Open Graph and Twitter Card meta tags are emitted on every page.
- JSON-LD `Person` schema renders only on the home page.
- `robots.txt` and `sitemap-index.xml` (via `@astrojs/sitemap`) ship at the root.

## Conventions

- No third-party tracking scripts.
- No emojis in copy or commit messages.
- Use `[TODO: ...]` for any metric you have not measured personally.
