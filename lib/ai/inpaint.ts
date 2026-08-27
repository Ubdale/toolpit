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
 * Ceiling on the longest edge handed to the model. Anything larger is worked at
 * a reduced size and composited back at full resolution.
 */
export const MAX_INFERENCE_EDGE = 1600;

export type MaskBounds = { x: number; y: number; width: number; height: number };

/** Tight bounding box of the painted area, or null if nothing is painted. */
export function maskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): MaskBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x]! <= 127) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function context2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not open a 2D canvas.');
  return context;
}

/**
 * Repairs only the region that was actually brushed.
 *
 * Inference cost tracks the pixel count handed to the model, and MI-GAN only
 * ever looks at the masked area plus its surroundings — so feeding it a whole
 * 12-megapixel photo to erase a lamp post in one corner is almost entirely
 * wasted work. Cropping to the mask's bounding box plus a margin of real
 * context cuts a multi-second run to a fraction of it, and leaves every pixel
 * outside the crop bit-for-bit untouched.
 *
 * The margin matters: the model needs to see enough of the surrounding scene to
 * invent something plausible. Too tight a crop and it has nothing to go on.
 */
export async function inpaintRegion(
  original: ImageData,
  paintedMask: Uint8Array,
  onProgress?: DownloadProgress,
): Promise<{ image: ImageData; inferencePixels: number } | null> {
  const { width, height } = original;
  const bounds = maskBounds(paintedMask, width, height);
  if (!bounds) return null;

  // Half the mask's longer side as context, never less than 64px.
  const margin = Math.max(64, Math.round(Math.max(bounds.width, bounds.height) * 0.5));
  const x0 = Math.max(0, bounds.x - margin);
  const y0 = Math.max(0, bounds.y - margin);
  const x1 = Math.min(width, bounds.x + bounds.width + margin);
  const y1 = Math.min(height, bounds.y + bounds.height + margin);
  const cropWidth = x1 - x0;
  const cropHeight = y1 - y0;

  const fullContext = context2d(width, height);
  fullContext.putImageData(original, 0, 0);

  const cropContext = context2d(cropWidth, cropHeight);
  cropContext.drawImage(fullContext.canvas, x0, y0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  const cropMask = new Uint8Array(cropWidth * cropHeight);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      cropMask[y * cropWidth + x] = paintedMask[(y + y0) * width + (x + x0)]!;
    }
  }

  // Even a crop can exceed what wasm will happily allocate, so cap it too.
  const scale = Math.min(1, MAX_INFERENCE_EDGE / Math.max(cropWidth, cropHeight));
  const workWidth = Math.max(1, Math.round(cropWidth * scale));
  const workHeight = Math.max(1, Math.round(cropHeight * scale));

  let workImage: ImageData;
  let workMask: Uint8Array;

  if (scale === 1) {
    workImage = cropContext.getImageData(0, 0, cropWidth, cropHeight);
    workMask = cropMask;
  } else {
    const scaled = context2d(workWidth, workHeight);
    scaled.drawImage(cropContext.canvas, 0, 0, workWidth, workHeight);
    workImage = scaled.getImageData(0, 0, workWidth, workHeight);

    const maskContext = context2d(cropWidth, cropHeight);
    const maskImage = new ImageData(cropWidth, cropHeight);
    for (let i = 0; i < cropMask.length; i += 1) {
      maskImage.data[i * 4 + 3] = cropMask[i]!;
    }
    maskContext.putImageData(maskImage, 0, 0);

    const scaledMask = context2d(workWidth, workHeight);
    scaledMask.drawImage(maskContext.canvas, 0, 0, workWidth, workHeight);
    const scaledData = scaledMask.getImageData(0, 0, workWidth, workHeight).data;
    workMask = new Uint8Array(workWidth * workHeight);
    for (let i = 0; i < workMask.length; i += 1) workMask[i] = scaledData[i * 4 + 3]!;
  }

  const repaired = await inpaint({ image: workImage, paintedMask: workMask }, onProgress);

  // Paste the repaired crop back, masked and feathered, so the join is
  // invisible and untouched pixels keep their exact original values.
  const repairedContext = context2d(workWidth, workHeight);
  repairedContext.putImageData(repaired, 0, 0);

  const patch = context2d(cropWidth, cropHeight);
  patch.imageSmoothingQuality = 'high';
  patch.drawImage(repairedContext.canvas, 0, 0, cropWidth, cropHeight);

  const maskLayer = context2d(cropWidth, cropHeight);
  const maskImage = new ImageData(cropWidth, cropHeight);
  for (let i = 0; i < cropMask.length; i += 1) {
    maskImage.data[i * 4] = 255;
    maskImage.data[i * 4 + 1] = 255;
    maskImage.data[i * 4 + 2] = 255;
    maskImage.data[i * 4 + 3] = cropMask[i]!;
  }
  maskLayer.putImageData(maskImage, 0, 0);

  patch.globalCompositeOperation = 'destination-in';
  patch.filter = 'blur(2px)';
  patch.drawImage(maskLayer.canvas, 0, 0);

  fullContext.drawImage(patch.canvas, x0, y0);

  return {
    image: fullContext.getImageData(0, 0, width, height),
    inferencePixels: workWidth * workHeight,
  };
}

