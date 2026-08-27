'use client';

import { loadImageTracer } from './runtime';

export type TraceSettings = {
  /** Palette size the tracer quantizes down to. */
  colors: number;
  /**
   * Straight-line and curve error thresholds. Higher values give fewer, looser
   * path segments; lower values hug the pixels.
   */
  detail: number;
  /** Discards traced shapes smaller than this many pixels — kills speckle. */
  despeckle: number;
  /** Gaussian blur applied before tracing, to calm down noisy photos. */
  blur: number;
};

export const defaultTraceSettings: TraceSettings = {
  colors: 8,
  detail: 1,
  despeckle: 8,
  blur: 0,
};

export type TraceResult = {
  svg: string;
  width: number;
  height: number;
  /** Number of <path> elements produced — a decent proxy for complexity. */
  paths: number;
};

/**
 * Reads an image file into ImageData, downscaling first if it is large.
 *
 * Tracing cost grows with pixel count, and a 12-megapixel photo would lock the
 * tab up for a minute to produce an unusable million-node SVG. Capping the long
 * edge keeps it interactive and the output sane.
 */
export async function readImageData(file: File, maxEdge: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not open a 2D canvas.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export async function traceToSvg(
  imageData: ImageData,
  settings: TraceSettings,
): Promise<TraceResult> {
  const tracer = await loadImageTracer();

  const svg = tracer.imagedataToSVG(imageData, {
    numberofcolors: settings.colors,
    ltres: settings.detail,
    qtres: settings.detail,
    pathomit: settings.despeckle,
    blurradius: settings.blur,
    blurdelta: 20,
    // The tracer emits a stroke around every filled shape by default, which
    // shows up as hairlines between colour regions when the SVG is scaled up.
    strokewidth: 0,
    linefilter: true,
    roundcoords: 2,
    viewbox: true,
    desc: false,
  });

  return {
    svg,
    width: imageData.width,
    height: imageData.height,
    paths: (svg.match(/<path/g) ?? []).length,
  };
}
