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
  tools/pdf/  tools/svg/  tools/ai/  tools/record/   the tools themselves
  ui/                   dropzone, file list, progress, result panel, fields
lib/
  tools.ts              THE registry — every tool's copy, metadata and links
  pdf/                  pdf-lib + pdf.js operations, lazily loaded
  svg/                  svgo + image tracer, lazily loaded
  ai/                   model loading, caching and MI-GAN inference
  record/               capture, annotation compositing and trimming
  seo.ts  jsonld.ts     per-page metadata and structured data
scripts/                pdf.js worker + ONNX runtime copy, icon generation
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

- No API routes and no server actions — nothing exists that could receive a
  file.
- Two Vercel scripts report something: Analytics (page views) and Speed
  Insights (real-user web-vitals timings). Both are cookieless, and neither
  can see a file — not by policy but by construction, since no file is ever
  part of a request. Both are disclosed on `/privacy`; if you add anything
  else that phones home, disclose it there too or the page becomes a lie.
- **A user's file bytes live in React state and nowhere else** — never written
  to storage, never attached to a request.
- Two things *are* written to the browser, and neither is user content: the
  chosen theme, and downloaded model weights in a named Cache Storage bucket
  (`toolpit-models-v1`) so a 28 MB download happens once rather than per visit.
- The only outbound requests any tool makes are for its own model weights.
  Everything else the tools touch is local.
- Heavy libraries (`pdf-lib`, `pdfjs-dist`, `svgo`, the tracer, the AI runtimes)
  sit behind `import()` in the `runtime.ts` of their `lib/` folder, so they never
  touch first load.

## What is built

All fifteen tools are live.

| Area | Tools | Engine |
|---|---|---|
| PDF | Merge, split, reorder/rotate, compress, images→PDF, PDF→images | `pdf-lib` + `pdfjs-dist` |
| Spreadsheets | Excel→PDF, PDF→Excel (table reconstruction), both in bulk | SheetJS + `pdf-lib` / `pdfjs-dist` |
| Vector | SVG optimizer, image→vector tracer (SVG/PDF/AI/EPS), favicon generator | `svgo`, VTracer wasm, canvas |
| AI image | Background remover (+ matte refinement and backdrops), upscaler (three model sizes), object removal (crop-to-mask, undo/redo) | `@imgly/background-removal`, UpscalerJS/TF.js, MI-GAN via `onnxruntime-web` |
| Capture | Screen recorder with live annotation and trim | `getDisplayMedia` + `MediaRecorder` |

Multi-file output is bundled by a dependency-free store-only ZIP writer in
[`lib/download.ts`](lib/download.ts).

### How the AI models are delivered

Weights are **fetched from a public CDN the first time a tool is opened**, then
cached in the browser — the model travels to the visitor, the visitor's image
never travels anywhere.

| Tool | Weights | Source |
|---|---|---|
| Background remover | 44 MB (ISNet quantized) or 88 MB (fp16) | `staticimgly.com`, the library's own CDN |
| Upscaler | ~1–5 MB (ESRGAN slim / medium / thick) | Bundled — small enough not to warrant a fetch |
| Object removal | 28 MB (MI-GAN pipeline) | Hugging Face, cached via the Cache Storage API |

The ONNX Runtime WebAssembly build is served from our own origin: the `/wasm`
entry (CPU only) rather than the default, which would pull a second, much larger
JSEP binary for no gain. `scripts/copy-pdf-worker.mjs` copies it, and the pdf.js
worker, into `public/` at build time — both are gitignored.

**`onnxruntime-web` is pinned to exactly 1.21.0 and should not be bumped
casually.** `@imgly/background-removal` declares it as an exact peer, loads
ORT's JavaScript from `node_modules`, and fetches the matching wasm binary from
its own CDN. Any other version pairs mismatched glue with that binary and the
background remover dies with `_OrtGetInputOutputMetadata is not a function`
after a 44 MB download. That version ships no `types` conditions in its export
map, which is why [`types/onnxruntime-web.d.ts`](types/onnxruntime-web.d.ts)
hand-declares the small surface we use.

Inference runs single-threaded on purpose: multithreading needs
`SharedArrayBuffer`, which needs cross-origin isolation, which would break the
cross-origin model fetches.

### Two conversions worth understanding

**Image → vector** runs on VTracer, which clusters colour regions and fits real
splines, and exports through [`lib/vector/export.ts`](lib/vector/export.ts) to
SVG, a true vector PDF, an Illustrator-compatible `.ai` (the same PDF bytes —
Illustrator has opened PDF natively since v9), or EPS. Both writers speak only
lines and cubics, so [`lib/vector/path.ts`](lib/vector/path.ts) normalises
relative commands, shorthand curves, quadratics and elliptical arcs first.

Both spreadsheet tools take **any number of files at once**, and either combine
them into one output or return a ZIP of one per input. That is the shape the
architecture wants: with no server, batch costs nothing to offer, so there is no
file cap and no reason to invent one.

**PDF → Excel** is inference, not extraction: a PDF stores glyphs at
coordinates and has no concept of a table. Text is grouped into rows by
baseline, split into cells on horizontal gaps, then aligned by clustering cell
left-edges across the whole page — which is what keeps a value under its own
heading when other rows have blanks. It is honest about its limits: pages with
no text layer are reported as scans rather than returned silently empty.

### Why the AI tools are more than a model call

A segmentation model returns an alpha channel, not a clean one: edge pixels come
back semi-transparent while still carrying the colour of the background they
were cut from, which is why a subject shot against something dark has a dark rim
around the hair. [`lib/ai/matte.ts`](lib/ai/matte.ts) solves that back out by
inverting the compositing equation — knowing alpha and estimating the old
background, it recovers the true foreground colour. That plus edge shrink,
feather and instant backdrop swapping all run on the finished cut-out in
milliseconds, so they are live sliders rather than another model pass.

Inpainting only sends the brushed region plus a margin of context to the model
([`inpaintRegion`](lib/ai/inpaint.ts)). Erasing something small in a large photo
is then a fraction of the work, and every pixel outside the crop stays
bit-for-bit identical. Edit history is kept as PNG blobs rather than ImageData —
a 12-megapixel frame is ~48 MB raw, so a few undo steps would otherwise cost
half a gigabyte.

## Next: what would actually differentiate this

"No upload" is a feature, and a copyable one. The moat is the *structural*
consequence of having no server — no size caps, no rate limits, no queue, and
work that can be chained without the file ever moving. Three directions follow
from that:

1. **Chaining and recipes.** Drop a file once, stack operations on it, and save
   the chain as a shareable URL — the recipe travels, the files never do. Apply
   one recipe to a whole folder. A server product would have to bill for that.
2. **Trust tools.** Redaction that destroys the underlying content instead of
   drawing a black box over live text, and an EXIF/metadata inspector. These are
   exactly the documents nobody uploads.
3. **Creative output.** Click-tracking auto-zoom and GIF export on the recorder,
   photo→poster vector art, zine and contact-sheet layouts.

## Copy

All marketing and SEO strings come from
[`docs/toolpit-copy.md`](docs/toolpit-copy.md) and are stored in
[`lib/tools.ts`](lib/tools.ts). Edit them there, not in the page components.
