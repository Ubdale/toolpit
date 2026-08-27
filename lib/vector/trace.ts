'use client';

/**
 * Image tracing on VTracer.
 *
 * The previous engine (imagetracerjs) quantized colours crudely and emitted
 * polygon soup — jagged edges, thousands of nodes, visible banding. VTracer is
 * the visioncortex Rust vectorizer: it clusters colour regions hierarchically
 * and fits actual splines to the boundaries, which is why its output is both
 * smaller and dramatically cleaner.
 *
 * It ships as wasm-pack's "bundler" target, whose entry point is a raw ESM
 * `.wasm` import. Rather than depend on the bundler supporting that, the module
 * is instantiated here by hand against a copy served from `public/` — the same
 * approach already used for the pdf.js worker and ONNX Runtime.
 */

type Glue = {
  __wbg_set_wasm: (exports: unknown) => void;
  ColorImageConverter: {
    new_with_string: (params: string) => Converter;
  };
  BinaryImageConverter: {
    new_with_string: (params: string) => Converter;
  };
};

type Converter = {
  init: () => void;
  /** Returns true once the conversion is finished. */
  tick: () => boolean;
  progress: () => number;
  free: () => void;
};

let gluePromise: Promise<Glue> | null = null;

async function loadVtracer(): Promise<Glue> {
  gluePromise ??= (async () => {
    const glue = (await import('vtracer-webapp/vtracer_webapp_bg.js')) as unknown as Glue;
    const response = await fetch('/vtracer/vtracer_webapp_bg.wasm');
    if (!response.ok) throw new Error('Could not load the tracing engine.');

    // Every one of the module's 34 imports comes from the glue, under this
    // exact specifier.
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {
      './vtracer_webapp_bg.js': glue as unknown as WebAssembly.ModuleImports,
    });

    glue.__wbg_set_wasm(instance.exports);
    (instance.exports as { __wbindgen_start?: () => void }).__wbindgen_start?.();
    return glue;
  })();

  try {
    return await gluePromise;
  } catch (cause) {
    gluePromise = null;
    throw cause;
  }
}

export type TraceMode = 'color' | 'bw';
export type CurveFitting = 'spline' | 'polygon' | 'pixel';

export type TraceSettings = {
  mode: TraceMode;
  /** How boundaries are fitted: smooth curves, straight polygons, or raw pixels. */
  curve: CurveFitting;
  /** 'stacked' keeps layers opaque and overlapping; 'cutout' punches them out. */
  stacked: boolean;
  /** Discards regions smaller than this many pixels. */
  filterSpeckle: number;
  /** Bits of colour kept per channel. See MAX_COLOR_PRECISION for the ceiling. */
  colorPrecision: number;
  /** Gradient step size — larger merges more shades into one layer. */
  layerDifference: number;
  /** Degrees below which a corner stays a corner instead of being smoothed. */
  cornerThreshold: number;
  /** Segments shorter than this get spliced away. */
  lengthThreshold: number;
  /** Decimal places kept in the output path data. */
  pathPrecision: number;
};

/**
 * Highest colour precision this build tolerates.
 *
 * Measured, not guessed: 8 panics the wasm outright at every layer separation,
 * and 7 "succeeds" while collapsing an entire photograph into a single path.
 * 6 is both the last value that produces real output and VTracer's own default.
 */
export const MAX_COLOR_PRECISION = 6;

export const defaultTraceSettings: TraceSettings = {
  mode: 'color',
  curve: 'spline',
  stacked: true,
  filterSpeckle: 4,
  colorPrecision: 6,
  layerDifference: 16,
  cornerThreshold: 60,
  lengthThreshold: 4,
  pathPrecision: 6,
};

/** Presets covering what people actually trace. */
export const TRACE_PRESETS: { id: string; label: string; note: string; settings: TraceSettings }[] =
  [
    {
      id: 'photo',
      label: 'Photograph',
      note: 'Many colour layers, smooth curves. Heavier output.',
      settings: {
        ...defaultTraceSettings,
        colorPrecision: MAX_COLOR_PRECISION,
        layerDifference: 12,
        filterSpeckle: 4,
      },
    },
    {
      id: 'logo',
      label: 'Logo or icon',
      note: 'Few flat colours, crisp corners. The cleanest result.',
      settings: {
        ...defaultTraceSettings,
        colorPrecision: 5,
        layerDifference: 24,
        filterSpeckle: 8,
        cornerThreshold: 80,
      },
    },
    {
      id: 'poster',
      label: 'Poster',
      note: 'Bold, posterised colour blocks. Great for print and stickers.',
      settings: {
        ...defaultTraceSettings,
        colorPrecision: 3,
        layerDifference: 32,
        filterSpeckle: 12,
      },
    },
    {
      id: 'sketch',
      label: 'Black & white',
      note: 'A single-colour silhouette. Smallest file by far.',
      settings: { ...defaultTraceSettings, mode: 'bw', filterSpeckle: 6 },
    },
  ];

export type TraceResult = {
  svg: string;
  width: number;
  height: number;
  paths: number;
};

let sequence = 0;

/**
 * Traces a canvas to SVG.
 *
 * VTracer's web build reads its input from a canvas already in the document and
 * writes its output into another element, both looked up by id — so the two
 * hosts are created here, kept off-screen, and removed once the SVG has been
 * read back out.
 */
export async function traceImage(
  source: HTMLCanvasElement,
  settings: TraceSettings,
  onProgress?: (fraction: number) => void,
): Promise<TraceResult> {
  const glue = await loadVtracer();

  const id = (sequence += 1);
  const canvasId = `toolpit-trace-src-${id}`;
  const svgId = `toolpit-trace-out-${id}`;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden';

  const canvas = source;
  canvas.id = canvasId;

  // The converter creates <path> elements and prepends them into whatever
  // `svg_id` names — it never creates the <svg> itself, and never sets a
  // viewBox. Hand it a real, correctly-sized SVG root to fill.
  const output = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  output.id = svgId;
  output.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  output.setAttribute('width', String(canvas.width));
  output.setAttribute('height', String(canvas.height));
  output.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);

  host.append(canvas, output);
  document.body.append(host);

  let converter: Converter | null = null;

  try {
    const params = JSON.stringify({
      canvas_id: canvasId,
      svg_id: svgId,
      // VTracer names the no-simplification mode "none"; its match arm ends in
      // `unreachable!()`, so any other spelling is a Rust panic rather than a
      // rejected value.
      mode: settings.curve === 'pixel' ? 'none' : settings.curve,
      hierarchical: settings.stacked ? 'stacked' : 'cutout',
      filter_speckle: settings.filterSpeckle,
      // Clamped here as well as in the UI: a value above this traps the wasm,
      // and a trap is not something a slider should be able to cause.
      color_precision: Math.max(1, Math.min(MAX_COLOR_PRECISION, settings.colorPrecision)),
      layer_difference: settings.layerDifference,
      corner_threshold: settings.cornerThreshold,
      length_threshold: settings.lengthThreshold,
      splice_threshold: 45,
      max_iterations: 10,
      path_precision: settings.pathPrecision,
    });

    converter =
      settings.mode === 'bw'
        ? glue.BinaryImageConverter.new_with_string(params)
        : glue.ColorImageConverter.new_with_string(params);

    converter.init();

    // The converter is deliberately incremental so a long trace does not freeze
    // the tab. Yielding between ticks keeps the progress bar honest and the UI
    // responsive.
    for (let step = 0; ; step += 1) {
      if (converter.tick()) break;
      if (step % 12 === 0) {
        onProgress?.(Math.min(0.99, converter.progress() / 100));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    onProgress?.(1);

    if (output.childElementCount === 0) {
      throw new Error('The tracer produced no output.');
    }

    const svg = new XMLSerializer().serializeToString(output);
    return {
      svg,
      width: canvas.width,
      height: canvas.height,
      paths: (svg.match(/<path/g) ?? []).length,
    };
  } catch (cause) {
    // A Rust panic aborts: the module's allocator and wasm-bindgen's heap are
    // left in an undefined state, so every later call would fail too. Drop the
    // instance and let the next attempt build a clean one.
    gluePromise = null;
    throw new Error(describeTraceFailure(cause));
  } finally {
    try {
      converter?.free();
    } catch {
      // Freeing a converter whose module already trapped throws again.
    }
    host.remove();
  }
}

/** Turns a wasm trap into something a person can act on. */
function describeTraceFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);

  if (/unreachable|RuntimeError|memory access out of bounds/i.test(message)) {
    return (
      'The tracing engine stopped unexpectedly on this image. Try a smaller ' +
      'colour count or a different preset — and if it keeps happening, the ' +
      'black & white preset handles almost anything.'
    );
  }

  if (/out of memory|Cannot enlarge/i.test(message)) {
    return 'This image needs more memory than the tab has. Try a smaller image or fewer colours.';
  }

  return message || 'Could not trace this image.';
}

/**
 * Draws a file into a canvas, downscaling if it is very large.
 *
 * Tracing cost grows with pixel count, and beyond a couple of megapixels the
 * extra detail mostly becomes node count rather than visible quality.
 */
export async function canvasFromFile(file: File, maxEdge: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not open a 2D canvas.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas;
}
