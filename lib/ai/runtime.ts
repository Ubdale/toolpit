'use client';

/**
 * Lazy loaders and model plumbing for the on-device AI tools.
 *
 * The rule that governs this whole file: the *model* travels to the visitor,
 * the visitor's image never travels anywhere. Weights are fetched from a public
 * CDN the first time a tool is opened and then cached by the browser, so the
 * second run is instant and an offline run still works.
 */

type BackgroundRemoval = typeof import('@imgly/background-removal');
type Ort = typeof import('onnxruntime-web/wasm');

let backgroundRemovalPromise: Promise<BackgroundRemoval> | null = null;
let ortPromise: Promise<Ort> | null = null;

export function loadBackgroundRemoval(): Promise<BackgroundRemoval> {
  backgroundRemovalPromise ??= import('@imgly/background-removal');
  return backgroundRemovalPromise;
}

export function loadOrt(): Promise<Ort> {
  // The `/wasm` entry is the CPU-only build. The default entry pulls the JSEP
  // (WebGPU) loader, which then fetches a second 26MB binary we would have to
  // host as well — for no gain, since inference here runs on the wasm provider.
  ortPromise ??= import('onnxruntime-web/wasm').then((ort) => {
    // Served from our own origin by scripts/copy-pdf-worker.mjs.
    ort.env.wasm.wasmPaths = '/ort/';
    // Multithreading needs SharedArrayBuffer, which needs cross-origin
    // isolation, which would break the cross-origin model fetches. One thread
    // is the honest trade.
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = 'error';
    return ort;
  });
  return ortPromise;
}

/** UpscalerJS needs a tfjs backend registered before a model can run. */
export async function loadUpscaler(scale: 2 | 3 | 4) {
  const [{ default: Upscaler }, model] = await Promise.all([
    import('upscaler'),
    scale === 2
      ? import('@upscalerjs/esrgan-slim/2x')
      : scale === 3
        ? import('@upscalerjs/esrgan-slim/3x')
        : import('@upscalerjs/esrgan-slim/4x'),
    import('@tensorflow/tfjs'),
  ]);

  return new Upscaler({ model: model.default });
}

const MODEL_CACHE = 'toolpit-models-v1';

export type DownloadProgress = (received: number, total: number) => void;

/**
 * Fetches a model file, reporting real byte progress and caching the result in
 * the Cache Storage API.
 *
 * A 28MB download with no feedback reads as a hung tab, and re-downloading it
 * on every visit would make the tool unusable on a metered connection.
 */
export async function fetchModel(
  url: string,
  onProgress?: DownloadProgress,
): Promise<ArrayBuffer> {
  const cache = await openCache();

  const cached = await cache?.match(url);
  if (cached) {
    onProgress?.(1, 1);
    return cached.arrayBuffer();
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the model (HTTP ${response.status}).`);
  }

  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Store a copy so a repeat visit skips the download entirely. A full cache or
  // a private window makes this fail, which is not worth failing the run over.
  try {
    await cache?.put(url, new Response(buffer.slice()));
  } catch {
    /* no cache, no problem */
  }

  return buffer.buffer as ArrayBuffer;
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(MODEL_CACHE);
  } catch {
    return null;
  }
}

/** Whether a model is already cached, so the UI can say "ready" vs "28 MB download". */
export async function isModelCached(url: string): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  return (await cache.match(url)) !== undefined;
}
