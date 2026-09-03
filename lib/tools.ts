/**
 * The single source of truth for every tool on Toolpit.
 *
 * Nav, homepage grid, per-route metadata, JSON-LD, breadcrumbs, related-tool
 * cross-links and sitemap.xml are all derived from this list, so adding a tool
 * is one entry here plus one `page.tsx`.
 *
 * All marketing/SEO strings come verbatim from docs/toolpit-copy.md.
 */

export type ToolStatus = 'live' | 'soon';

export type CategoryId = 'pdf' | 'svg' | 'image' | 'record' | 'create';

export type Category = {
  id: CategoryId;
  /** URL segment, e.g. /pdf/merge */
  segment: string;
  label: string;
  /** Short line under the category heading on the homepage. */
  blurb: string;
  phase: number;
};

export type Tool = {
  /** Route path, e.g. /pdf/merge */
  href: string;
  category: CategoryId;
  status: ToolStatus;
  /** Short label for nav + cards. */
  name: string;
  /** One-line card description on the homepage / related sections. */
  summary: string;
  /** <title> */
  title: string;
  /** <meta name="description"> */
  description: string;
  /** The page's single <h1> */
  h1: string;
  /** SEO intro paragraph rendered under the h1. */
  intro: string;
  keywords: string[];
  /** Paths of 3-4 related tools, for internal linking. */
  related: string[];
};

export const categories: Category[] = [
  {
    id: 'pdf',
    segment: 'pdf',
    label: 'PDF tools',
    blurb: 'Merge, split, rotate, compress and convert PDFs without uploading them.',
    phase: 1,
  },
  {
    id: 'svg',
    segment: 'svg',
    label: 'Vector & SVG',
    blurb: 'Trace images to vectors, shrink SVGs, and build a full favicon set.',
    phase: 2,
  },
  {
    id: 'image',
    segment: 'image',
    label: 'Image tools',
    blurb:
      'Resize, crop and convert — plus background removal and upscaling that run on your device.',
    phase: 3,
  },
  {
    id: 'record',
    segment: 'record',
    label: 'Screen recorder',
    blurb: 'Capture, trim and annotate your screen with nothing to install.',
    phase: 4,
  },
  {
    id: 'create',
    segment: 'create',
    label: 'Create & design',
    blurb: 'Build a resume, a chart or a QR code from scratch and export it clean.',
    phase: 5,
  },
];

export const tools: Tool[] = [
  // ---------------------------------------------------------------- Phase 1
  {
    href: '/pdf/merge',
    category: 'pdf',
    status: 'live',
    name: 'Merge PDF',
    summary: 'Combine several PDFs into one document.',
    title: 'Merge PDF Files Free — No Upload, No Watermark | Toolpit',
    description:
      'Combine multiple PDFs into one file, right in your browser. Free, no signup, no watermark, and your files never leave your device.',
    h1: 'Merge PDF files',
    intro:
      'Combine two or more PDFs into a single document in seconds. Drag your files in, arrange the order, and download the merged PDF — all processed locally in your browser, so nothing is uploaded and nothing is stored.',
    keywords: ['merge pdf', 'combine pdf', 'join pdf files', 'free pdf merger'],
    related: ['/pdf/split', '/pdf/organize', '/pdf/compress', '/pdf/images-to-pdf'],
  },
  {
    href: '/pdf/split',
    category: 'pdf',
    status: 'live',
    name: 'Split PDF',
    summary: 'Extract pages or break a PDF into separate files.',
    title: 'Split PDF Free — Extract or Separate Pages | Toolpit',
    description:
      'Split a PDF into separate files or pull out specific pages. Runs entirely in your browser — free, private, no watermark, no upload.',
    h1: 'Split a PDF',
    intro:
      'Break a PDF into separate documents or extract just the pages you need. Choose your page ranges and download the results instantly. Everything happens on your device — your file is never sent to a server.',
    keywords: ['split pdf', 'extract pdf pages', 'separate pdf pages', 'pdf splitter'],
    related: ['/pdf/merge', '/pdf/organize', '/pdf/to-images', '/pdf/compress'],
  },
  {
    href: '/pdf/organize',
    category: 'pdf',
    status: 'live',
    name: 'Reorder & rotate',
    summary: 'Rearrange, rotate and delete pages with a live preview.',
    title: 'Reorder & Rotate PDF Pages Free Online | Toolpit',
    description:
      'Rearrange, rotate, and delete PDF pages in your browser. Free, no upload, no watermark — your file stays private on your device.',
    h1: 'Reorder & rotate PDF pages',
    intro:
      "Drag pages into the order you want, rotate any that are sideways, and remove the ones you don't need. Preview every change live and download a clean PDF — all without uploading a thing.",
    keywords: ['rotate pdf', 'reorder pdf pages', 'delete pdf pages', 'organize pdf'],
    related: ['/pdf/merge', '/pdf/split', '/pdf/to-images', '/pdf/compress'],
  },
  {
    href: '/pdf/compress',
    category: 'pdf',
    status: 'live',
    name: 'Compress PDF',
    summary: 'Shrink a PDF so it is easy to email.',
    title: 'Compress PDF Free — Reduce File Size, No Upload | Toolpit',
    description:
      'Shrink PDF file size in your browser without losing quality. Free, no watermark, no signup, and nothing is uploaded to a server.',
    h1: 'Compress a PDF',
    intro:
      "Make large PDFs smaller so they're easy to email or upload elsewhere. Toolpit compresses your file locally and lets you download the lighter version immediately — no quality-destroying server round-trip, no watermark.",
    keywords: ['compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf optimizer'],
    related: ['/pdf/merge', '/pdf/split', '/pdf/to-images', '/pdf/organize'],
  },
  {
    href: '/pdf/images-to-pdf',
    category: 'pdf',
    status: 'live',
    name: 'Images to PDF',
    summary: 'Turn JPG and PNG files into one tidy PDF.',
    title: 'Convert Images to PDF Free — JPG & PNG | Toolpit',
    description:
      'Turn JPG, PNG, and other images into a single PDF in your browser. Free, private, no upload, no watermark.',
    h1: 'Convert images to PDF',
    intro:
      'Combine your photos or scans into one tidy PDF. Add multiple images, set the order and page size, and download — processed entirely on your device so your images stay private.',
    keywords: ['jpg to pdf', 'png to pdf', 'images to pdf', 'photo to pdf converter'],
    related: ['/pdf/to-images', '/pdf/merge', '/pdf/compress', '/pdf/organize'],
  },
  {
    href: '/pdf/to-images',
    category: 'pdf',
    status: 'live',
    name: 'PDF to images',
    summary: 'Export every page as a PNG or JPG.',
    title: 'Convert PDF to Images Free — PNG & JPG | Toolpit',
    description:
      'Export every page of a PDF as a PNG or JPG image, right in your browser. Free, no signup, no upload, no watermark.',
    h1: 'Convert a PDF to images',
    intro:
      'Turn each page of your PDF into a high-quality image you can reuse anywhere. Pick your format and resolution, then download the whole set — all done locally, nothing uploaded.',
    keywords: ['pdf to jpg', 'pdf to png', 'pdf to image', 'convert pdf to images'],
    related: ['/pdf/images-to-pdf', '/pdf/split', '/svg/image-to-svg', '/pdf/compress'],
  },

  {
    href: '/pdf/excel-to-pdf',
    category: 'pdf',
    status: 'live',
    name: 'Excel to PDF',
    summary: 'Turn one or many spreadsheets into clean PDFs.',
    title: 'Convert Excel to PDF Free — XLSX & CSV, No Upload | Toolpit',
    description:
      'Convert XLSX, XLS, ODS or CSV spreadsheets into a PDF in your browser. Free, no signup, no watermark, and your data never leaves your device.',
    h1: 'Convert Excel to PDF',
    intro:
      'Turn a spreadsheet into a PDF anyone can open, with columns that line up and headers repeated on every page. Drop in as many workbooks as you like, pick the sheets you want, and take away one combined PDF or a ZIP of one per file. There is no file limit, because there is no server to pay for one — every conversion happens on your own machine, so financial and personal data never goes near one.',
    keywords: ['excel to pdf', 'xlsx to pdf', 'csv to pdf', 'bulk excel to pdf', 'batch convert spreadsheets'],
    related: ['/pdf/pdf-to-excel', '/pdf/merge', '/pdf/compress', '/pdf/images-to-pdf'],
  },
  {
    href: '/pdf/pdf-to-excel',
    category: 'pdf',
    status: 'live',
    name: 'PDF to Excel',
    summary: 'Pull tables out of one or many PDFs.',
    title: 'Convert PDF to Excel Free — Extract Tables, No Upload | Toolpit',
    description:
      'Extract tables from a PDF into an XLSX or CSV spreadsheet, right in your browser. Free, no signup, no watermark, and your document is never uploaded.',
    h1: 'Convert a PDF to Excel',
    intro:
      'Get the numbers out of a PDF and back into a spreadsheet you can actually work with. Toolpit reads the text layer, rebuilds the rows and columns, and hands you an XLSX or CSV. Convert a whole folder at once into one combined workbook or a ZIP of one per document — entirely on your device, which matters when the files are invoices, statements or payroll reports.',
    keywords: ['pdf to excel', 'pdf to xlsx', 'extract table from pdf', 'bulk pdf to excel', 'batch pdf table extraction'],
    related: ['/pdf/excel-to-pdf', '/pdf/to-images', '/pdf/split', '/pdf/merge'],
  },

  // ---------------------------------------------------------------- Phase 2
  {
    href: '/svg/image-to-svg',
    category: 'svg',
    status: 'live',
    name: 'Image to vector',
    summary: 'Trace a PNG or JPG to SVG, PDF, AI or EPS.',
    title: 'Convert PNG & JPG to SVG, AI, EPS & PDF Free | Toolpit',
    description:
      'Trace a PNG or JPG into clean vector artwork and export it as SVG, PDF, Illustrator .ai or EPS. Free, no upload, no watermark — your image never leaves your device.',
    h1: 'Convert an image to vector',
    intro:
      'Turn a logo, icon, photo, or graphic into clean, infinitely scalable artwork. Toolpit traces your image into real vector paths locally in your browser, then exports it as an SVG, a true vector PDF, an Illustrator-compatible .ai, or an EPS for print — without uploading a single pixel.',
    keywords: [
      'png to svg',
      'jpg to svg',
      'image to vector',
      'png to ai',
      'image to eps',
      'convert image to illustrator',
    ],
    related: ['/svg/optimize', '/svg/favicon-generator', '/pdf/to-images', '/image/upscale'],
  },
  {
    href: '/svg/optimize',
    category: 'svg',
    status: 'live',
    name: 'SVG optimizer',
    summary: 'Strip bloat and minify SVG files.',
    title: 'Optimize & Minify SVG Free Online | Toolpit',
    description:
      'Clean up and shrink SVG files by removing bloat, in your browser. Free, private, no upload — smaller SVGs with identical output.',
    h1: 'Optimize an SVG',
    intro:
      'Strip out editor cruft, redundant metadata, and unnecessary precision to make your SVG dramatically smaller without changing how it looks. Paste or drop your SVG in and copy the optimized version straight back out — nothing is uploaded.',
    keywords: ['svg optimizer', 'minify svg', 'compress svg', 'svgo online'],
    related: ['/svg/image-to-svg', '/svg/favicon-generator', '/pdf/compress', '/image/upscale'],
  },
  {
    href: '/svg/favicon-generator',
    category: 'svg',
    status: 'live',
    name: 'Favicon generator',
    summary: 'Every favicon size plus the HTML to paste in.',
    title: 'Free Favicon Generator — All Sizes, No Upload | Toolpit',
    description:
      'Create a full favicon package from any image in your browser. Free, no signup, no watermark, and your image stays on your device.',
    h1: 'Generate a favicon',
    intro:
      'Drop in any image and get a complete favicon set — every size modern browsers and devices need, plus the HTML to drop into your site. Generated locally in your browser, so your artwork is never uploaded.',
    keywords: ['favicon generator', 'favicon package', 'ico generator', 'apple touch icon'],
    related: ['/svg/image-to-svg', '/svg/optimize', '/image/remove-background', '/pdf/to-images'],
  },

  // ---------------------------------------------------------------- Phase 3
  {
    href: '/image/remove-background',
    category: 'image',
    status: 'live',
    name: 'Background remover',
    summary: 'Cut out a background with on-device AI.',
    title: 'Remove Image Background Free — No Upload | Toolpit',
    description:
      'Erase image backgrounds automatically in your browser using on-device AI. Free, no watermark, no signup — your photo never leaves your device.',
    h1: 'Remove an image background',
    intro:
      "Cut out the background from any photo automatically. The AI model runs entirely on your device, so unlike other background removers, your image is never uploaded, never stored, and there's no watermark or paywall to get the full-resolution result.",
    keywords: [
      'remove background',
      'free background remover',
      'transparent background',
      'cut out image',
    ],
    related: [
      '/image/upscale',
      '/image/remove-object',
      '/svg/favicon-generator',
      '/pdf/images-to-pdf',
    ],
  },
  {
    href: '/image/upscale',
    category: 'image',
    status: 'live',
    name: 'Image upscaler',
    summary: 'Enlarge photos while keeping edges crisp.',
    title: 'AI Image Upscaler Free — Enlarge Photos, No Upload | Toolpit',
    description:
      'Upscale and sharpen images with on-device AI in your browser. Free, private, no watermark — your photo is never sent to a server.',
    h1: 'Upscale an image',
    intro:
      'Enlarge photos and artwork while keeping edges crisp, using an AI model that runs right in your browser. No upload, no queue, no subscription — just a bigger, cleaner image downloaded straight to your device.',
    keywords: ['image upscaler', 'ai upscale', 'enlarge photo', 'increase image resolution'],
    related: [
      '/image/remove-background',
      '/image/remove-object',
      '/svg/image-to-svg',
      '/pdf/to-images',
    ],
  },
  {
    href: '/image/remove-object',
    category: 'image',
    status: 'live',
    name: 'Object removal',
    summary: 'Brush something out and let AI fill the gap.',
    title: 'Remove Objects from Photos Free — AI Inpaint | Toolpit',
    description:
      'Brush away unwanted objects and fill the gap with on-device AI, in your browser. Free, no upload, no watermark.',
    h1: 'Remove objects from a photo',
    intro:
      "Paint over anything you want gone — a person, a sign, a blemish — and let on-device AI fill the space to match. Everything runs in your browser, so your photo stays private and there's no watermark on the result.",
    keywords: ['remove object from photo', 'ai inpainting', 'photo cleanup', 'erase object'],
    related: ['/image/remove-background', '/image/upscale', '/record/screen', '/svg/optimize'],
  },

  // ---------------------------------------------------------------- Phase 4
  {
    href: '/record/screen',
    category: 'record',
    status: 'live',
    name: 'Screen recorder',
    summary: 'Record, trim and annotate your screen.',
    title: 'Free Screen Recorder — No Signup, No Watermark | Toolpit',
    description:
      'Record your screen and annotate it, right in your browser. Free, no download, no signup, no watermark — nothing is uploaded.',
    h1: 'Record your screen',
    intro:
      "Capture your screen, trim the clip, and mark it up — no software to install and no account to create. The recording is built on your device and downloads locally, so it's never uploaded to a server or stamped with a watermark.",
    keywords: [
      'screen recorder',
      'record screen online',
      'free screen capture',
      'screen recorder no watermark',
    ],
    related: ['/image/remove-object', '/pdf/to-images', '/image/upscale', '/svg/optimize'],
  },

  // ------------------------------------------------ Phase 5: PDF authoring
  {
    href: '/pdf/edit',
    category: 'pdf',
    status: 'live',
    name: 'PDF editor',
    summary: 'Add text, shapes, highlights and signatures to a page.',
    title: 'Free PDF Editor — Edit PDFs Online, No Upload | Toolpit',
    description:
      'Add text, boxes, highlights, images and signatures to a PDF in your browser. Free, no signup, no watermark, and your document is never uploaded.',
    h1: 'Edit a PDF',
    intro:
      'Type on a page, highlight a paragraph, box a figure, drop in a logo, or sign where it says sign. Toolpit lays your edits over a live preview of the real page and bakes them into a normal PDF anyone can open. Every other online editor asks you to upload the contract first; this one never does, because the whole editor is running in this tab.',
    keywords: [
      'pdf editor',
      'edit pdf online',
      'free pdf editor',
      'annotate pdf',
      'sign pdf online',
      'add text to pdf',
    ],
    related: ['/pdf/organize', '/pdf/watermark', '/pdf/page-numbers', '/pdf/merge'],
  },
  {
    href: '/pdf/watermark',
    category: 'pdf',
    status: 'live',
    name: 'Watermark PDF',
    summary: 'Stamp text or a logo across every page.',
    title: 'Add a Watermark to a PDF Free — No Upload | Toolpit',
    description:
      'Stamp DRAFT, CONFIDENTIAL or your own logo across every page of a PDF, in your browser. Free, no signup, and no watermark of ours on top of yours.',
    h1: 'Watermark a PDF',
    intro:
      'Mark a document as a draft, as confidential, or as yours. Set the text or drop in a logo, choose the angle, size and opacity, and check it on a live preview before you commit. The stamp goes on locally, so a document you are labelling confidential never has to cross somebody else’s server to get the label.',
    keywords: [
      'watermark pdf',
      'add watermark to pdf',
      'pdf watermark online',
      'stamp pdf confidential',
      'draft watermark pdf',
    ],
    related: ['/pdf/edit', '/pdf/page-numbers', '/pdf/compress', '/pdf/merge'],
  },
  {
    href: '/pdf/page-numbers',
    category: 'pdf',
    status: 'live',
    name: 'Page numbers',
    summary: 'Number the pages of any PDF.',
    title: 'Add Page Numbers to a PDF Free — No Upload | Toolpit',
    description:
      'Add page numbers to a PDF in your browser — any position, any format, starting at any number. Free, no signup, no watermark, nothing uploaded.',
    h1: 'Add page numbers to a PDF',
    intro:
      'Put numbers on a merged report, a scanned bundle, or a thesis that lost them somewhere along the way. Pick a corner, a format like “Page 3 of 40”, where to start counting and which pages to skip — then download the numbered PDF. All of it happens on your device.',
    keywords: [
      'add page numbers to pdf',
      'pdf page numbers',
      'number pdf pages',
      'bates numbering pdf',
    ],
    related: ['/pdf/edit', '/pdf/watermark', '/pdf/organize', '/pdf/merge'],
  },
  {
    href: '/pdf/remove-watermark',
    category: 'pdf',
    status: 'live',
    name: 'Remove watermark',
    summary: 'Find and delete a watermark, keeping the text.',
    title: 'Remove a Watermark from a PDF Free — No Upload | Toolpit',
    description:
      'Find and delete watermarks, stamps and layers from a PDF in your browser. The text stays text. Free, no signup, no watermark of ours, nothing uploaded.',
    h1: 'Remove a watermark from a PDF',
    intro:
      'Most watermarks are a separate object in the file — a stamp, a layer, a line of text, or an image repeated on every page. Toolpit reads the document’s structure, shows you exactly what it found, and deletes only what you tick. Because it removes the object rather than painting over it, your document comes back with its text still selectable and searchable. If a mark turns out to be baked into a scan, the tool says so instead of quietly doing nothing.',
    keywords: [
      'remove watermark from pdf',
      'pdf watermark remover',
      'delete watermark pdf',
      'remove draft stamp pdf',
      'free watermark remover',
    ],
    related: ['/pdf/watermark', '/pdf/edit', '/image/remove-watermark', '/pdf/organize'],
  },

  // ----------------------------------------------- Phase 5: image utilities
  {
    href: '/image/resize',
    category: 'image',
    status: 'live',
    name: 'Resize image',
    summary: 'Scale images to an exact size, in bulk.',
    title: 'Resize Images Free Online — Bulk, No Upload | Toolpit',
    description:
      'Resize JPG, PNG, WebP and AVIF images to exact dimensions in your browser. Batch resize dozens at once — free, no signup, no watermark, nothing uploaded.',
    h1: 'Resize an image',
    intro:
      'Scale a photo to the exact width a form demands, or push a whole folder of product shots through the same size in one go. Lock the aspect ratio or set both edges, choose how the image fits, and take away a single file or a ZIP of the lot. There is no file-count limit, because there is no server charging us per upload.',
    keywords: [
      'resize image',
      'image resizer',
      'bulk resize images',
      'change image dimensions',
      'resize jpg online',
    ],
    related: ['/image/crop', '/image/convert', '/image/upscale', '/pdf/images-to-pdf'],
  },
  {
    href: '/image/convert',
    category: 'image',
    status: 'live',
    name: 'Convert image',
    summary: 'Swap between PNG, JPG, WebP and AVIF.',
    title: 'Convert Images Free — PNG, JPG, WebP & AVIF | Toolpit',
    description:
      'Convert images between PNG, JPG, WebP and AVIF in your browser, one at a time or in bulk. Free, no signup, no watermark, and nothing is uploaded.',
    h1: 'Convert an image',
    intro:
      'Move a screenshot to a format an older system will actually accept, or take a folder of PNGs to WebP and halve what your site ships. Pick the target format and quality, convert as many files as you like at once, and download them one by one or as a ZIP — all encoded by your own browser.',
    keywords: [
      'convert image',
      'png to jpg',
      'jpg to webp',
      'webp to png',
      'image converter',
      'bulk image converter',
    ],
    related: ['/image/resize', '/image/crop', '/pdf/images-to-pdf', '/svg/image-to-svg'],
  },
  {
    href: '/image/crop',
    category: 'image',
    status: 'live',
    name: 'Crop image',
    summary: 'Trim to a ratio or an exact box.',
    title: 'Crop Images Free Online — No Upload, No Watermark | Toolpit',
    description:
      'Crop a photo to a square, a 16:9 banner or an exact pixel box, right in your browser. Free, no signup, no watermark, and your image is never uploaded.',
    h1: 'Crop an image',
    intro:
      'Drag a crop box over your photo, or snap it to a ratio — a square for an avatar, 16:9 for a banner, 4:5 for a feed. Type exact numbers when the box has to be exact. The crop is applied by your browser and downloaded straight back to you, at full resolution and with nothing stamped on it.',
    keywords: [
      'crop image',
      'image cropper',
      'crop photo online',
      'square crop tool',
      'crop jpg online',
    ],
    related: [
      '/image/resize',
      '/image/convert',
      '/image/remove-background',
      '/svg/favicon-generator',
    ],
  },
  {
    href: '/image/remove-watermark',
    category: 'image',
    status: 'live',
    name: 'Remove watermark',
    summary: 'Erase a watermark from a whole set of photos.',
    title: 'Remove Watermarks from Images Free — Batch, No Upload | Toolpit',
    description:
      'Erase a watermark from a photo — or from a whole folder at once — with AI that runs on your device. Free, no signup, no watermark of ours, nothing uploaded.',
    h1: 'Remove a watermark from an image',
    intro:
      'Draw a box over the watermark and an on-device AI model repaints what was underneath. The useful part is the batch: a watermark usually sits in the same place on every image in a set, so mark it once and it comes off all of them, scaled to each. The model runs on your own hardware, so a folder of photos is neither uploaded nor counted against a quota.',
    keywords: [
      'remove watermark from image',
      'watermark remover',
      'remove watermark from photo',
      'bulk watermark remover',
      'erase logo from image',
    ],
    related: [
      '/image/remove-object',
      '/pdf/remove-watermark',
      '/image/crop',
      '/image/remove-background',
    ],
  },

  // ------------------------------------------------ Phase 5: create & design
  {
    href: '/create/resume',
    category: 'create',
    status: 'live',
    name: 'Resume builder',
    summary: 'Build a CV from a template and export a real PDF.',
    title: 'Free Resume & CV Builder — Templates, No Signup | Toolpit',
    description:
      'Build a resume from professional templates and download a print-ready PDF with selectable text. Free, no signup, no watermark — your details never leave your device.',
    h1: 'Build a resume',
    intro:
      'Fill in your experience once, then try it in every template until one fits. Toolpit exports a real vector PDF with selectable text, which is what applicant tracking systems actually read — not a picture of a CV. Your employment history, address and phone number stay in this tab: there is no account to make and no server holding a draft of your life.',
    keywords: [
      'resume builder',
      'cv maker',
      'free resume templates',
      'resume pdf',
      'curriculum vitae builder',
      'ats friendly resume',
    ],
    related: ['/create/chart', '/create/qr-code', '/pdf/edit', '/pdf/merge'],
  },
  {
    href: '/create/chart',
    category: 'create',
    status: 'live',
    name: 'Chart maker',
    summary: 'Turn a table of numbers into a clean chart.',
    title: 'Free Chart & Graph Maker — Export PNG & SVG | Toolpit',
    description:
      'Paste a table or drop a CSV and get a bar, line, area, pie or scatter chart you can export as PNG or SVG. Free, no signup, no watermark, nothing uploaded.',
    h1: 'Make a chart',
    intro:
      'Paste your numbers straight out of a spreadsheet, pick a chart type, and get something you can put in a deck without apologising for it — sensible colours, readable labels, no chart-junk. Export a crisp PNG for slides or an SVG that stays sharp in print. Your figures are charted in this tab and never uploaded, which matters when they are revenue.',
    keywords: [
      'chart maker',
      'graph maker',
      'bar chart generator',
      'line graph maker',
      'csv to chart',
      'pie chart maker',
    ],
    related: ['/create/resume', '/create/qr-code', '/pdf/pdf-to-excel', '/svg/optimize'],
  },
  {
    href: '/create/qr-code',
    category: 'create',
    status: 'live',
    name: 'QR code generator',
    summary: 'Make a QR code as a sharp SVG or PNG.',
    title: 'Free QR Code Generator — SVG & PNG, No Signup | Toolpit',
    description:
      'Generate a QR code for a link, Wi-Fi network, contact card or plain text. Export SVG or PNG — free, no signup, no watermark, and no tracking redirect.',
    h1: 'Generate a QR code',
    intro:
      'Make a QR code for a link, a Wi-Fi network, a contact card or any text at all. Toolpit encodes it in your browser and hands you the real code — not a redirect through a service that can expire it, count your scans, or start charging once the poster is printed. Export an SVG for print or a PNG at any size.',
    keywords: [
      'qr code generator',
      'free qr code',
      'qr code svg',
      'wifi qr code generator',
      'vcard qr code',
      'qr code no expiry',
    ],
    related: ['/create/chart', '/create/resume', '/svg/favicon-generator', '/svg/optimize'],
  },
];

const bySlug = new Map(tools.map((t) => [t.href, t]));

export function getTool(href: string): Tool {
  const tool = bySlug.get(href);
  if (!tool) throw new Error(`Unknown tool: ${href}`);
  return tool;
}

export function getCategory(id: CategoryId): Category {
  const category = categories.find((c) => c.id === id);
  if (!category) throw new Error(`Unknown category: ${id}`);
  return category;
}

export function toolsIn(id: CategoryId): Tool[] {
  return tools.filter((t) => t.category === id);
}

export function relatedTools(href: string): Tool[] {
  return getTool(href).related.map(getTool);
}
