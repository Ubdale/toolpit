'use client';

/**
 * Matte refinement for cut-outs.
 *
 * Segmentation models give you an alpha channel, not a *clean* one. Edge pixels
 * end up semi-transparent while still carrying the colour of the background
 * they were cut from — which is why a subject shot against something dark comes
 * back with a dark rim around the hair and shoulders. The model is not wrong;
 * the compositing is incomplete.
 *
 * Everything here runs on the finished cut-out in a few milliseconds, so the
 * controls can be live sliders rather than another model pass.
 */

export type MatteSettings = {
  /** Pixels to pull the alpha edge inward. Removes halo at the cost of detail. */
  shrink: number;
  /** Pixels of blur on the alpha edge. Softens a hard cut. */
  feather: number;
  /** 0-1: how much of the old background colour to solve out of edge pixels. */
  despill: number;
};

export const defaultMatteSettings: MatteSettings = {
  shrink: 1,
  feather: 1,
  despill: 0.85,
};

/** Sliding-window minimum along rows, then columns. Erodes the alpha edge. */
function erode(
  alpha: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (radius <= 0) return alpha;
  const pass = new Uint8ClampedArray(alpha.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let min = 255;
      const from = Math.max(0, x - radius);
      const to = Math.min(width - 1, x + radius);
      for (let i = from; i <= to; i += 1) {
        const value = alpha[row + i]!;
        if (value < min) min = value;
      }
      pass[row + x] = min;
    }
  }

  const out = new Uint8ClampedArray(alpha.length);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let min = 255;
      const from = Math.max(0, y - radius);
      const to = Math.min(height - 1, y + radius);
      for (let i = from; i <= to; i += 1) {
        const value = pass[i * width + x]!;
        if (value < min) min = value;
      }
      out[y * width + x] = min;
    }
  }

  return out;
}

/** Separable box blur over the alpha channel, via prefix sums. */
function blur(
  alpha: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (radius <= 0) return alpha;
  const pass = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= radius && x < width; x += 1) sum += alpha[row + x]!;
    for (let x = 0; x < width; x += 1) {
      const from = Math.max(0, x - radius);
      const to = Math.min(width - 1, x + radius);
      pass[row + x] = sum / (to - from + 1);
      if (x - radius >= 0) sum -= alpha[row + x - radius]!;
      if (x + radius + 1 < width) sum += alpha[row + x + radius + 1]!;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = 0; y <= radius && y < height; y += 1) sum += pass[y * width + x]!;
    for (let y = 0; y < height; y += 1) {
      const from = Math.max(0, y - radius);
      const to = Math.min(height - 1, y + radius);
      out[y * width + x] = sum / (to - from + 1);
      if (y - radius >= 0) sum -= pass[(y - radius) * width + x]!;
      if (y + radius + 1 < height) sum += pass[(y + radius + 1) * width + x]!;
    }
  }

  return out;
}

/**
 * Average colour of the region the model called background.
 *
 * This is what the halo is made of, so it is what we solve back out of the edge
 * pixels. Sampled from the *original* image, since the cut-out has already
 * zeroed those pixels.
 */
function estimateBackground(
  original: ImageData,
  alpha: Uint8ClampedArray<ArrayBuffer>,
): [number, number, number] | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  // Sample on a grid; a full pass buys no accuracy for a mean.
  for (let i = 0; i < alpha.length; i += 7) {
    if (alpha[i]! > 8) continue;
    r += original.data[i * 4]!;
    g += original.data[i * 4 + 1]!;
    b += original.data[i * 4 + 2]!;
    count += 1;
  }

  if (count < 32) return null;
  return [r / count, g / count, b / count];
}

/**
 * Applies shrink, feather and background-colour decontamination to a cut-out.
 *
 * The despill step inverts the compositing equation. An edge pixel holds
 * `C = a·F + (1-a)·B` — a blend of the true foreground F and the background B
 * it was shot against. Knowing `a` and estimating `B`, we can recover
 * `F = (C - (1-a)·B) / a` and drop the halo. At low alpha that division blows
 * up, so the correction is eased in and clamped.
 */
export function refineCutout(
  cutout: ImageData,
  original: ImageData,
  settings: MatteSettings,
): ImageData {
  const { width, height } = cutout;
  const pixels = width * height;

  let alpha = new Uint8ClampedArray(pixels);
  for (let i = 0; i < pixels; i += 1) alpha[i] = cutout.data[i * 4 + 3]!;

  alpha = erode(alpha, width, height, Math.round(settings.shrink));
  alpha = blur(alpha, width, height, Math.round(settings.feather));

  const background = settings.despill > 0 ? estimateBackground(original, alpha) : null;
  const out = new ImageData(width, height);

  for (let i = 0; i < pixels; i += 1) {
    const a = alpha[i]! / 255;
    const base = i * 4;

    let r = original.data[base]!;
    let g = original.data[base + 1]!;
    let b = original.data[base + 2]!;

    if (background && a > 0.02 && a < 0.98) {
      // Ease the correction in: near-transparent pixels have almost no
      // foreground signal left, and dividing by a tiny alpha just amplifies
      // noise into coloured speckle.
      const strength = settings.despill * Math.min(1, a * 2);
      r = r + ((r - (1 - a) * background[0]) / a - r) * strength;
      g = g + ((g - (1 - a) * background[1]) / a - g) * strength;
      b = b + ((b - (1 - a) * background[2]) / a - b) * strength;
    }

    out.data[base] = r;
    out.data[base + 1] = g;
    out.data[base + 2] = b;
    out.data[base + 3] = alpha[i]!;
  }

  return out;
}

export type Backdrop =
  | { kind: 'transparent' }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string }
  /** The visitor's own photo, blurred — the portrait-mode look. */
  | { kind: 'blur'; radius: number };

/** Composites a refined cut-out onto a backdrop. Pure canvas work, instant. */
export function composite(
  cutout: ImageData,
  original: ImageData,
  backdrop: Backdrop,
): HTMLCanvasElement {
  const { width, height } = cutout;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not open a 2D canvas.');

  if (backdrop.kind === 'color') {
    context.fillStyle = backdrop.color;
    context.fillRect(0, 0, width, height);
  } else if (backdrop.kind === 'gradient') {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, backdrop.from);
    gradient.addColorStop(1, backdrop.to);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  } else if (backdrop.kind === 'blur') {
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    source.getContext('2d')?.putImageData(original, 0, 0);
    context.filter = `blur(${backdrop.radius}px)`;
    // Overdraw slightly so the blur does not pull transparent edges inward.
    const bleed = backdrop.radius * 2;
    context.drawImage(source, -bleed, -bleed, width + bleed * 2, height + bleed * 2);
    context.filter = 'none';
  }

  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  layer.getContext('2d')?.putImageData(cutout, 0, 0);
  context.drawImage(layer, 0, 0);

  return canvas;
}
