'use client';

/**
 * Lazy loaders for the two PDF engines.
 *
 * Neither library is imported at module scope: `pdf-lib` and `pdfjs-dist`
 * together are well over a megabyte, and pulling them into a page chunk would
 * wreck LCP on tool pages that the visitor may never actually use. Each loader
 * memoises its import so repeated calls within a session are free.
 */

type PdfLib = typeof import('pdf-lib');
type PdfJs = typeof import('pdfjs-dist');

let pdfLibPromise: Promise<PdfLib> | null = null;
let pdfJsPromise: Promise<PdfJs> | null = null;

export function loadPdfLib(): Promise<PdfLib> {
  pdfLibPromise ??= import('pdf-lib');
  return pdfLibPromise;
}

export function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    // The worker is copied to /public by scripts/copy-pdf-worker.mjs, so it is
    // fetched as a plain static asset rather than bundled into a page chunk.
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfJsPromise;
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * pdf.js takes ownership of (and detaches) the buffer it is given, which breaks
 * any later pdf-lib pass over the same bytes. Always hand it a copy.
 */
export function copyBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}
