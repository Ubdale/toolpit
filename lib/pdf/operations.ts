'use client';

import { copyBytes, loadPdfJs, loadPdfLib } from './runtime';

export type Progress = (done: number, total: number) => void;

const LOAD_OPTIONS = { ignoreEncryption: true } as const;

export type PdfSource = { name: string; bytes: Uint8Array };

/** Wraps saved PDF bytes in a Blob ready for download. */
export function toPdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

/** Page count without keeping a document handle around. */
export async function readPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  return doc.getPageCount();
}

export async function mergePdfs(
  sources: PdfSource[],
  onProgress?: Progress,
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();

  for (const [index, source] of sources.entries()) {
    const doc = await PDFDocument.load(copyBytes(source.bytes), LOAD_OPTIONS);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
    onProgress?.(index + 1, sources.length);
  }

  return out.save({ useObjectStreams: true });
}

/** Builds a new PDF from the given zero-based page indices, in order. */
export async function extractPages(
  bytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const source = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(source, pageIndices);
  for (const page of pages) out.addPage(page);
  return out.save({ useObjectStreams: true });
}

export type PageEdit = {
  /** Index of the page in the original document. */
  sourceIndex: number;
  /** Clockwise rotation to add, in degrees. */
  rotation: number;
};

/** Applies a reorder/rotate/delete plan produced by the organize tool. */
export async function applyPageEdits(
  bytes: Uint8Array,
  edits: PageEdit[],
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await loadPdfLib();
  const source = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const out = await PDFDocument.create();

  const pages = await out.copyPages(
    source,
    edits.map((edit) => edit.sourceIndex),
  );

  for (const [index, page] of pages.entries()) {
    const added = edits[index]!.rotation;
    const current = page.getRotation().angle;
    page.setRotation(degrees(((current + added) % 360 + 360) % 360));
    out.addPage(page);
  }

  return out.save({ useObjectStreams: true });
}

export type RenderedPage = {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
};

export type RasterOptions = {
  /** Multiplier over the PDF's natural size. 2 ≈ 144 DPI. */
  scale: number;
  format: 'image/png' | 'image/jpeg';
  /** JPEG only, 0-1. */
  quality?: number;
  /** Zero-based page indices; defaults to every page. */
  pageIndices?: number[];
};

/**
 * Renders pages to image blobs with pdf.js. Pages are drawn one at a time and
 * each canvas is released immediately — a 200-page document at 3x would
 * otherwise hold hundreds of megabytes of bitmaps at once.
 */
export async function renderPages(
  bytes: Uint8Array,
  options: RasterOptions,
  onProgress?: Progress,
): Promise<RenderedPage[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: copyBytes(bytes) });
  const doc = await task.promise;

  try {
    const indices =
      options.pageIndices ?? Array.from({ length: doc.numPages }, (_, i) => i);
    const results: RenderedPage[] = [];

    for (const [step, index] of indices.entries()) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: options.scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not open a 2D canvas.');

      // JPEG has no alpha; without a white ground, transparent PDF areas would
      // come out black.
      if (options.format === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const blob = await canvasToBlob(canvas, options.format, options.quality);
      results.push({
        pageNumber: index + 1,
        blob,
        width: canvas.width,
        height: canvas.height,
      });

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(step + 1, indices.length);
    }

    return results;
  } finally {
    await task.destroy();
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      format,
      quality,
    );
  });
}

export type Thumbnail = {
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
};

/**
 * Renders every page to a small data URL for the organize tool's live preview.
 * The document is opened once for the whole run rather than per page.
 */
export async function renderThumbnails(
  bytes: Uint8Array,
  maxEdge = 200,
  onProgress?: Progress,
): Promise<Thumbnail[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: copyBytes(bytes) });
  const doc = await task.promise;

  try {
    const thumbnails: Thumbnail[] = [];

    for (let index = 0; index < doc.numPages; index += 1) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: maxEdge / Math.max(base.width, base.height),
      });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not open a 2D canvas.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: context, viewport }).promise;

      thumbnails.push({
        pageIndex: index,
        dataUrl: canvas.toDataURL('image/jpeg', 0.7),
        width: canvas.width,
        height: canvas.height,
      });

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(index + 1, doc.numPages);
    }

    return thumbnails;
  } finally {
    await task.destroy();
  }
}

export type PageSize = 'fit' | 'a4' | 'letter';

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export type ImageToPdfOptions = {
  pageSize: PageSize;
  /** Points of white space around the image on fixed page sizes. */
  margin: number;
};

/** Embeds images into a PDF, one image per page. */
export async function imagesToPdf(
  files: File[],
  options: ImageToPdfOptions,
  onProgress?: Progress,
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();

  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);

    // pdf-lib embeds PNG and JPEG natively; anything else (WebP, AVIF, GIF…)
    // is re-encoded to JPEG through a canvas first.
    const embedded = isPng
      ? await out.embedPng(bytes)
      : file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)
        ? await out.embedJpg(bytes)
        : await out.embedJpg(new Uint8Array(await (await reencodeToJpeg(file)).arrayBuffer()));

    if (options.pageSize === 'fit') {
      const page = out.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    } else {
      const [pageWidth, pageHeight] = PAGE_DIMENSIONS[options.pageSize];
      const page = out.addPage([pageWidth, pageHeight]);
      const boxWidth = Math.max(1, pageWidth - options.margin * 2);
      const boxHeight = Math.max(1, pageHeight - options.margin * 2);
      const scale = Math.min(boxWidth / embedded.width, boxHeight / embedded.height, 1);
      const width = embedded.width * scale;
      const height = embedded.height * scale;
      page.drawImage(embedded, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height,
      });
    }

    onProgress?.(index + 1, files.length);
  }

  return out.save({ useObjectStreams: true });
}

async function reencodeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not open a 2D canvas.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

export type CompressMode = 'lossless' | 'rasterize';

export type CompressOptions = {
  mode: CompressMode;
  /** rasterize only: resolution multiplier. */
  scale: number;
  /** rasterize only: JPEG quality, 0-1. */
  quality: number;
};

/**
 * Two honest strategies, because "compress PDF" means two different things:
 *
 * - `lossless` rewrites the file with object streams and drops orphaned
 *   objects. Text stays text; the saving is modest but nothing degrades.
 * - `rasterize` re-renders each page to a JPEG and rebuilds the document. It
 *   shrinks scan-heavy files dramatically, at the cost of selectable text.
 */
export async function compressPdf(
  bytes: Uint8Array,
  options: CompressOptions,
  onProgress?: Progress,
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib();

  if (options.mode === 'lossless') {
    const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
    onProgress?.(1, 2);
    const saved = await doc.save({ useObjectStreams: true });
    onProgress?.(2, 2);
    return saved;
  }

  const pages = await renderPages(
    bytes,
    { scale: options.scale, format: 'image/jpeg', quality: options.quality },
    onProgress,
  );

  const out = await PDFDocument.create();
  for (const rendered of pages) {
    const jpg = await out.embedJpg(new Uint8Array(await rendered.blob.arrayBuffer()));
    // Keep the page geometry the original had, independent of render scale.
    const width = rendered.width / options.scale;
    const height = rendered.height / options.scale;
    const page = out.addPage([width, height]);
    page.drawImage(jpg, { x: 0, y: 0, width, height });
  }

  return out.save({ useObjectStreams: true });
}
