'use client';

/**
 * Lazy loaders for the vector engines, memoised per session.
 *
 * Same rule as the PDF engines: nothing here is imported at module scope, so a
 * visitor who never opens a vector tool never downloads svgo or the tracer.
 */

type Svgo = typeof import('svgo/browser');
type ImageTracer = {
  imagedataToSVG: (data: ImageData, options: Record<string, unknown>) => string;
};

let svgoPromise: Promise<Svgo> | null = null;
let tracerPromise: Promise<ImageTracer> | null = null;

export function loadSvgo(): Promise<Svgo> {
  svgoPromise ??= import('svgo/browser');
  return svgoPromise;
}

export function loadImageTracer(): Promise<ImageTracer> {
  // imagetracerjs is a UMD bundle exporting a single ready-made instance.
  tracerPromise ??= import('imagetracerjs').then(
    (module) => (module.default ?? module) as unknown as ImageTracer,
  );
  return tracerPromise;
}
