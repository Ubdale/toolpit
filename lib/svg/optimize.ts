'use client';

import { loadSvgo } from './runtime';

export type OptimizeSettings = {
  /** Decimal places kept on path coordinates. Lower = smaller, less precise. */
  precision: number;
  /** Run the plugin pipeline repeatedly until the output stops shrinking. */
  multipass: boolean;
  /** Drop id attributes. Unsafe if your CSS or JS references them. */
  removeIds: boolean;
  /** Drop width/height so the SVG scales to its container. */
  removeDimensions: boolean;
  /** Keep the output indented and readable instead of minified. */
  prettify: boolean;
};

export const defaultOptimizeSettings: OptimizeSettings = {
  precision: 3,
  multipass: true,
  removeIds: false,
  removeDimensions: false,
  prettify: false,
};

export type OptimizeResult = {
  svg: string;
  originalBytes: number;
  optimizedBytes: number;
};

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Runs SVGO's preset in the browser.
 *
 * Only the choices that actually change the output are exposed — the rest of
 * the preset is safe by default, and surfacing forty plugin toggles would just
 * be a way to break a file.
 */
export async function optimizeSvg(
  source: string,
  settings: OptimizeSettings,
): Promise<OptimizeResult> {
  const { optimize } = await loadSvgo();

  const result = optimize(source, {
    multipass: settings.multipass,
    js2svg: { pretty: settings.prettify, indent: 2 },
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Both are destructive when other files reference the markup, so
            // they stay off unless the visitor opts in.
            cleanupIds: settings.removeIds ? {} : false,
          },
        },
      },
      { name: 'cleanupNumericValues', params: { floatPrecision: settings.precision } },
      { name: 'convertPathData', params: { floatPrecision: settings.precision } },
      { name: 'convertTransform', params: { floatPrecision: settings.precision } },
      ...(settings.removeDimensions ? [{ name: 'removeDimensions' as const }] : []),
    ],
  });

  return {
    svg: result.data,
    originalBytes: byteLength(source),
    optimizedBytes: byteLength(result.data),
  };
}

/** Cheap sanity check before handing anything to SVGO. */
export function looksLikeSvg(source: string): boolean {
  return /<svg[\s>]/i.test(source);
}
