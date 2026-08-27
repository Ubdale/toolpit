# Toolpit

Free client-side web tools for PDFs, images and vectors.
**Your files never leave your device** — there is no backend, no upload, no
account, no watermark and no usage limit.

Every tool runs in the visitor's browser. The site is a fully static Next.js
build: no API routes, no server functions, nothing that could receive a file
even by accident.

---

## Running it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

`pnpm dev` and `pnpm build` both run a `pre` step that copies the pdf.js worker
into `public/` and regenerates the icon assets, so a fresh clone needs no extra
setup.

```bash
pnpm build          # production build (all routes prerendered)
pnpm start          # serve the production build
pnpm typecheck      # tsc --noEmit
```

## Deploying to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Vercel detects Next.js; leave the build command (`pnpm build`) and output
   directory at their defaults.
3. Set the production domain, then update `site.url` in
   [`lib/site.ts`](lib/site.ts) to match — canonicals, `sitemap.xml`,
   `robots.txt` and the OG tags are all derived from that one value.

There are no environment variables and no server runtime to configure. Every
route in the build output is marked `○ (Static)`; if one ever isn't, something
has accidentally introduced a server dependency.

## How it is organised

```
app/                    one route per tool, each its own SEO landing page
  pdf/…  svg/…  image/…  record/…
  sitemap.ts  robots.ts  manifest.ts  opengraph-image.tsx
components/
  layout/               header, footer, theme toggle
  tool/                 ToolPage shell, privacy badge, related links, cards
  tools/pdf/            the six working PDF tools (client components)
  ui/                   dropzone, file list, progress, result panel, fields
lib/
  tools.ts              THE registry — every tool's copy, metadata and links
  pdf/                  pdf-lib + pdf.js operations, lazily loaded
  seo.ts  jsonld.ts     per-page metadata and structured data
scripts/                pdf.js worker copy + icon generation
```

**[`lib/tools.ts`](lib/tools.ts) is the spine.** Navigation, the homepage grid,
per-route metadata, JSON-LD, breadcrumbs, related-tool cross-links and the
sitemap are all derived from it, so adding a tool means one entry there plus one
`page.tsx`.

### Design system

Tokens live in [`app/globals.css`](app/globals.css) as `--tp-*` custom
properties for both themes, mapped onto Tailwind colour names through
`@theme inline`. One ember accent, plus a separate "vault" green used *only* for
the privacy promise so the guarantee reads as brand colour rather than as a
disclaimer. Dark mode is class-driven, applied before first paint by a small
inline script.

### Keeping the promise honest

- No API routes, no server actions, no analytics.
- File bytes live in React state and nowhere else — no IndexedDB, no cache.
- The only thing written to the browser is the chosen theme.
- Heavy libraries (`pdf-lib`, `pdfjs-dist`) are behind `import()` in
  [`lib/pdf/runtime.ts`](lib/pdf/runtime.ts) so they never touch first load.

## What is built

**Phase 1 — PDF tools (done).** Merge, split, reorder/rotate, compress, images
to PDF, PDF to images. Multi-file drag and drop, live page previews, progress
for long jobs, ZIP bundling for multi-file output (store-only ZIP writer in
[`lib/download.ts`](lib/download.ts) — no dependency).

Phases 2–4 are **routed placeholders**: real URLs with full metadata, JSON-LD
and genuine copy, already in the sitemap and nav, showing a "coming soon" state.

## Next tool to build

**The SVG optimizer** ([`/svg/optimize`](app/svg/optimize/page.tsx)) — it is the
smallest remaining piece of real work and needs no model download:

```bash
pnpm add svgo
```

Run `optimize()` from a dynamic import, show a before/after byte count, and let
the user paste SVG in as well as drop a file. Then the image tracer, which needs
a tracing library:

```bash
pnpm add imagetracerjs      # or a WASM potrace build
```

### Libraries each remaining phase needs

| Phase | Tools | Install |
|---|---|---|
| 2 | SVG optimizer | `pnpm add svgo` |
| 2 | PNG/JPG → SVG tracer | `pnpm add imagetracerjs` (or a WASM potrace build) |
| 2 | Favicon generator | none — canvas resizing plus the existing ZIP writer |
| 3 | Background removal, upscaling, inpainting | `pnpm add onnxruntime-web`, plus quantized `.onnx` models served from `public/models/` and lazy-loaded when the tool opens |
| 4 | Screen recorder | none — `getDisplayMedia` + `MediaRecorder` |

For Phase 3, load the model only after the visitor picks a file, cache it in the
browser, and keep it out of the initial bundle — the same rule the PDF engines
already follow.

## Copy

All marketing and SEO strings come from
[`docs/toolpit-copy.md`](docs/toolpit-copy.md) and are stored in
[`lib/tools.ts`](lib/tools.ts). Edit them there, not in the page components.
