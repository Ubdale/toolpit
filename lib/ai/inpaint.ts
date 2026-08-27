'use client';

import { fetchModel, loadOrt, type DownloadProgress } from './runtime';

/**
 * MI-GAN (ICCV 2023), the "pipeline" export that does its own cropping,
 * resizing, normalisation and blend-back internally.
 *
 * That matters: the plain export needs the caller to crop around the mask,
 * resize to 512, normalise, run, then composite the result back — five steps
 * that are easy to get subtly wrong. This one takes the full image at any size
 * and returns the full image at the same size.
 */
const MODEL_URL =
  'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';

export const MODEL_BYTES = 28_079_181;

let sessionPromise: Promise<import('onnxruntime-web/wasm').InferenceSession> | null = null;

export function inpaintModelUrl(): string {
  return MODEL_URL;
}

export async function loadInpaintSession(onProgress?: DownloadProgress) {
  sessionPromise ??= (async () => {
    const [ort, weights] = await Promise.all([loadOrt(), fetchModel(MODEL_URL, onProgress)]);
    return ort.InferenceSession.create(weights, { executionProviders: ['wasm'] });
  })();

  try {
    return await sessionPromise;
  } catch (cause) {
    // Never cache a failed load, or a retry after a dropped connection can
    // never succeed.
    sessionPromise = null;
    throw cause;
  }
}

export type InpaintInput = {
  /** The full source image. */
  image: ImageData;
  /**
   * One byte per pixel: 255 where the mask was painted (erase this),
   * 0 elsewhere. Inverted for the model below.
   */
  paintedMask: Uint8Array;
};

/**
 * Runs one inpainting pass.
 *
 * The model reads NCHW planar uint8 and treats mask 0 as "reconstruct this",
 * which is the opposite polarity to how a paint mask is naturally built — hence
 * the inversion here rather than in the UI, where it would be a trap.
 */
export async function inpaint(
  { image, paintedMask }: InpaintInput,
  onProgress?: DownloadProgress,
): Promise<ImageData> {
  const ort = await loadOrt();
  const session = await loadInpaintSession(onProgress);

  const { width, height, data } = image;
  const pixels = width * height;

  const rgb = new Uint8Array(pixels * 3);
  const mask = new Uint8Array(pixels);

  for (let i = 0; i < pixels; i += 1) {
    rgb[i] = data[i * 4]!;
    rgb[pixels + i] = data[i * 4 + 1]!;
    rgb[pixels * 2 + i] = data[i * 4 + 2]!;
    mask[i] = paintedMask[i]! > 127 ? 0 : 255;
  }

  const output = await session.run({
    image: new ort.Tensor('uint8', rgb, [1, 3, height, width]),
    mask: new ort.Tensor('uint8', mask, [1, 1, height, width]),
  });

  const result = output.result?.data as Uint8Array | undefined;
  if (!result) throw new Error('The model returned no result.');

  const out = new ImageData(width, height);
  for (let i = 0; i < pixels; i += 1) {
    out.data[i * 4] = result[i]!;
    out.data[i * 4 + 1] = result[pixels + i]!;
    out.data[i * 4 + 2] = result[pixels * 2 + i]!;
    out.data[i * 4 + 3] = 255;
  }

  return out;
}

/**
 * Inference cost scales with pixel count, and a 12-megapixel phone photo would
 * exhaust the wasm heap. Large images are worked at a reduced size and the
 * repaired region is composited back into the full-resolution original.
 */
export const MAX_INFERENCE_EDGE = 1600;

function makeCanvas(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not open a 2D canvas.');
  return context;
}

/**
 * Pastes the repaired region back into the full-resolution original.
 *
 * Only the painted area is replaced, so everything the visitor did not brush
 * over keeps its original pixels — a 4000px photo does not silently come back
 * as a 1600px one. The mask is blurred a little first so the seam between
 * repaired and untouched pixels is not a hard edge.
 */
export function compositeRepair(
  original: ImageData,
  repairedSmall: ImageData,
  paintedMaskFull: Uint8Array,
  feather = 2,
): ImageData {
  const { width, height } = original;

  const repaired = makeCanvas(repairedSmall.width, repairedSmall.height);
  repaired.putImageData(repairedSmall, 0, 0);

  const maskImage = new ImageData(width, height);
  for (let i = 0; i < width * height; i += 1) {
    maskImage.data[i * 4] = 255;
    maskImage.data[i * 4 + 1] = 255;
    maskImage.data[i * 4 + 2] = 255;
    maskImage.data[i * 4 + 3] = paintedMaskFull[i]!;
  }

  const mask = makeCanvas(width, height);
  mask.putImageData(maskImage, 0, 0);

  const patch = makeCanvas(width, height);
  patch.imageSmoothingQuality = 'high';
  patch.drawImage(repaired.canvas, 0, 0, width, height);
  patch.globalCompositeOperation = 'destination-in';
  patch.filter = `blur(${feather}px)`;
  patch.drawImage(mask.canvas, 0, 0);

  const out = makeCanvas(width, height);
  out.putImageData(original, 0, 0);
  out.drawImage(patch.canvas, 0, 0);

  return out.getImageData(0, 0, width, height);
}
