'use client';

/**
 * Resize, convert and crop, all through the canvas the browser already has.
 *
 * Two things here are not obvious and matter a lot to the output:
 *
 *  - Large downscales are done in halving steps. A single `drawImage` from
 *    4000px to 400px point-samples the source and throws away most of it, which
 *    is what makes "resized" photos look crunchy; halving repeatedly averages
 *    the pixels in between and costs almost nothing.
 *  - Formats without an alpha channel get an explicit white ground first.
 *    Without it, every transparent pixel in a PNG comes out black in the JPEG.
 */

export type ImageFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

export const imageFormats: { value: ImageFormat; label: string; extension: string; lossy: boolean }[] =
  [
    { value: 'image/png', label: 'PNG', extension: 'png', lossy: false },
    { value: 'image/jpeg', label: 'JPG', extension: 'jpg', lossy: true },
    { value: 'image/webp', label: 'WebP', extension: 'webp', lossy: true },
    { value: 'image/avif', label: 'AVIF', extension: 'avif', lossy: true },
  ];

export function extensionFor(format: ImageFormat): string {
  return imageFormats.find((entry) => entry.value === format)?.extension ?? 'png';
}

export function hasAlpha(format: ImageFormat): boolean {
  return format === 'image/png' || format === 'image/webp' || format === 'image/avif';
}

const supportCache = new Map<ImageFormat, boolean>();

/**
 * Whether this browser can *encode* a format. Firefox reads AVIF but has never
 * written it, and a canvas asked for an unsupported type silently hands back a
 * PNG — so the tool checks rather than promising a conversion it can't do.
 */
export async function canEncode(format: ImageFormat): Promise<boolean> {
  const cached = supportCache.get(format);
  if (cached !== undefined) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, format, 0.8);
  });

  const supported = blob?.type === format;
  supportCache.set(format, supported);
  return supported;
}

export type LoadedImage = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

export async function loadImage(file: File): Promise<LoadedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    throw new Error(`${file.name} could not be read as an image.`);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      format,
      quality,
    );
  });
}

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not open a 2D canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

/** Halving downscale — see the note at the top of the file. */
function drawScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;
  let current: CanvasImageSource = source;

  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));

    const step = newCanvas(nextWidth, nextHeight);
    context2d(step).drawImage(current, 0, 0, nextWidth, nextHeight);

    current = step;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const canvas = newCanvas(targetWidth, targetHeight);
  context2d(canvas).drawImage(current, 0, 0, targetWidth, targetHeight);
  return canvas;
}

export type FitMode = 'contain' | 'cover' | 'stretch';

export const fitModes: { value: FitMode; label: string; description: string }[] = [
  { value: 'contain', label: 'Fit inside', description: 'Whole image, padded to the exact size.' },
  { value: 'cover', label: 'Fill & crop', description: 'Fills the box; the overflow is trimmed.' },
  { value: 'stretch', label: 'Stretch', description: 'Forces both edges, distorting the image.' },
];

export type ResizeOptions = {
  width: number | null;
  height: number | null;
  /** Derive the missing edge from the source ratio instead of padding. */
  keepRatio: boolean;
  fit: FitMode;
  format: ImageFormat;
  quality: number;
  background: string;
  /** Never scale a small image up to meet the target. */
  noUpscale: boolean;
};

export type TransformResult = {
  blob: Blob;
  width: number;
  height: number;
};

export async function resizeImage(file: File, options: ResizeOptions): Promise<TransformResult> {
  const image = await loadImage(file);

  try {
    let targetWidth = options.width ?? 0;
    let targetHeight = options.height ?? 0;

    if (options.keepRatio || !targetWidth || !targetHeight) {
      const ratio = image.width / image.height;
      if (targetWidth && !targetHeight) targetHeight = targetWidth / ratio;
      else if (targetHeight && !targetWidth) targetWidth = targetHeight * ratio;
      else if (targetWidth && targetHeight && options.keepRatio) {
        const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
        targetWidth = image.width * scale;
        targetHeight = image.height * scale;
      }
    }

    if (!targetWidth || !targetHeight) {
      throw new Error('Set a width, a height, or both.');
    }

    if (options.noUpscale) {
      const scale = Math.min(1, targetWidth / image.width, targetHeight / image.height);
      targetWidth *= scale;
      targetHeight *= scale;
    }

    targetWidth = Math.max(1, Math.round(targetWidth));
    targetHeight = Math.max(1, Math.round(targetHeight));

    let canvas: HTMLCanvasElement;

    if (options.keepRatio || options.fit === 'stretch') {
      canvas = drawScaled(image.bitmap, image.width, image.height, targetWidth, targetHeight);
    } else if (options.fit === 'cover') {
      // Scale to cover, then take the middle. Covering a box larger than the
      // source necessarily enlarges it, so "never enlarge" caps the factor at 1
      // and the result is simply a centre crop at native resolution.
      const cover = Math.max(targetWidth / image.width, targetHeight / image.height);
      const scale = options.noUpscale ? Math.min(1, cover) : cover;
      const scaled = drawScaled(
        image.bitmap,
        image.width,
        image.height,
        Math.round(image.width * scale),
        Math.round(image.height * scale),
      );
      canvas = newCanvas(targetWidth, targetHeight);
      context2d(canvas).drawImage(
        scaled,
        Math.round((scaled.width - targetWidth) / 2),
        Math.round((scaled.height - targetHeight) / 2),
        targetWidth,
        targetHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );
    } else {
      const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
      const innerWidth = Math.round(image.width * scale);
      const innerHeight = Math.round(image.height * scale);
      const scaled = drawScaled(image.bitmap, image.width, image.height, innerWidth, innerHeight);

      canvas = newCanvas(targetWidth, targetHeight);
      const context = context2d(canvas);
      if (!hasAlpha(options.format) || options.background !== 'transparent') {
        context.fillStyle = options.background === 'transparent' ? '#ffffff' : options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(
        scaled,
        Math.round((targetWidth - innerWidth) / 2),
        Math.round((targetHeight - innerHeight) / 2),
      );
    }

    const flattened = flatten(canvas, options.format, options.background);
    return {
      blob: await canvasToBlob(flattened, options.format, options.quality),
      width: flattened.width,
      height: flattened.height,
    };
  } finally {
    image.bitmap.close();
  }
}

/** Puts a ground under the image when the target format has no alpha channel. */
function flatten(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  background: string,
): HTMLCanvasElement {
  if (hasAlpha(format) && background === 'transparent') return canvas;

  const output = newCanvas(canvas.width, canvas.height);
  const context = context2d(output);
  context.fillStyle = background === 'transparent' ? '#ffffff' : background;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);
  return output;
}

export type ConvertOptions = {
  format: ImageFormat;
  quality: number;
  background: string;
  /** Cap the long edge, for the common "convert and shrink" case. */
  maxEdge: number | null;
};

export async function convertImage(file: File, options: ConvertOptions): Promise<TransformResult> {
  const image = await loadImage(file);

  try {
    let width = image.width;
    let height = image.height;

    if (options.maxEdge && Math.max(width, height) > options.maxEdge) {
      const scale = options.maxEdge / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const scaled = drawScaled(image.bitmap, image.width, image.height, width, height);
    const flattened = flatten(scaled, options.format, options.background);

    return {
      blob: await canvasToBlob(flattened, options.format, options.quality),
      width: flattened.width,
      height: flattened.height,
    };
  } finally {
    image.bitmap.close();
  }
}

export type CropRect = { x: number; y: number; width: number; height: number };

export type CropOptions = {
  rect: CropRect;
  format: ImageFormat;
  quality: number;
  background: string;
};

export async function cropImage(file: File, options: CropOptions): Promise<TransformResult> {
  const image = await loadImage(file);

  try {
    // Clamp to the image so a box dragged past the edge crops rather than throws.
    const x = Math.max(0, Math.min(image.width - 1, Math.round(options.rect.x)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(options.rect.y)));
    const width = Math.max(1, Math.min(image.width - x, Math.round(options.rect.width)));
    const height = Math.max(1, Math.min(image.height - y, Math.round(options.rect.height)));

    const canvas = newCanvas(width, height);
    context2d(canvas).drawImage(image.bitmap, x, y, width, height, 0, 0, width, height);

    const flattened = flatten(canvas, options.format, options.background);
    return {
      blob: await canvasToBlob(flattened, options.format, options.quality),
      width,
      height,
    };
  } finally {
    image.bitmap.close();
  }
}

export const aspectRatios: { value: string; label: string; ratio: number | null }[] = [
  { value: 'free', label: 'Free', ratio: null },
  { value: '1:1', label: 'Square 1:1', ratio: 1 },
  { value: '4:5', label: 'Portrait 4:5', ratio: 4 / 5 },
  { value: '3:2', label: 'Photo 3:2', ratio: 3 / 2 },
  { value: '4:3', label: 'Standard 4:3', ratio: 4 / 3 },
  { value: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
];
