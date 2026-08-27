'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { canvasToBlob } from '@/lib/pdf/operations';
import {
  MAX_INFERENCE_EDGE,
  MODEL_BYTES,
  compositeRepair,
  inpaint,
  inpaintModelUrl,
} from '@/lib/ai/inpaint';
import { isModelCached } from '@/lib/ai/runtime';

import { ModelNotice, ModelProgress } from './ModelNotice';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

type Loaded = {
  file: File;
  /** Current full-resolution pixels — replaced after each successful repair. */
  image: ImageData;
  url: string;
};

export default function ObjectRemoverTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [brush, setBrush] = useState(36);
  const [hasMask, setHasMask] = useState(false);
  const [stage, setStage] = useState<'download' | 'run' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [edits, setEdits] = useState(0);

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    void isModelCached(inpaintModelUrl()).then(setCached);
  }, []);

  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const track = useCallback((url: string) => {
    urlsRef.current.push(url);
    return url;
  }, []);

  async function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP or AVIF.`);
      return;
    }

    const bitmap = await createImageBitmap(picked);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('This browser could not open a 2D canvas.');
      return;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    setError(null);
    setEdits(0);
    setLoaded({
      file: picked,
      image: context.getImageData(0, 0, canvas.width, canvas.height),
      url: track(URL.createObjectURL(picked)),
    });
  }

  // Size the mask overlay to the image every time the source changes.
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !loaded) return;
    canvas.width = loaded.image.width;
    canvas.height = loaded.image.height;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  }, [loaded]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      // Keep the brush the same visual size regardless of how far the image is
      // scaled down to fit the page.
      radius: (brush / 2) * (canvas.width / rect.width),
    };
  }

  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = maskCanvasRef.current;
    const point = pointFrom(event);
    if (!canvas || !point) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.fillStyle = 'rgba(209, 84, 31, 0.55)';
    context.beginPath();
    context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    context.fill();
    setHasMask(true);
  }

  function clearMask() {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  }

  /** Alpha channel of the overlay → one byte per pixel, 255 = erase. */
  function readMask(width: number, height: number): Uint8Array | null {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;

    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const context = scaled.getContext('2d');
    if (!context) return null;
    context.drawImage(canvas, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3]!;
    return mask;
  }

  async function run() {
    if (!loaded || !hasMask) return;
    setError(null);
    setStage(cached ? 'run' : 'download');
    setProgress(0);

    try {
      const { width, height } = loaded.image;
      const scale = Math.min(1, MAX_INFERENCE_EDGE / Math.max(width, height));
      const workWidth = Math.max(1, Math.round(width * scale));
      const workHeight = Math.max(1, Math.round(height * scale));

      // Downscale the image for inference when it is large; the mask is scaled
      // to match so the two stay aligned.
      const workCanvas = document.createElement('canvas');
      workCanvas.width = workWidth;
      workCanvas.height = workHeight;
      const workContext = workCanvas.getContext('2d');
      if (!workContext) throw new Error('This browser could not open a 2D canvas.');

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = width;
      fullCanvas.height = height;
      fullCanvas.getContext('2d')?.putImageData(loaded.image, 0, 0);
      workContext.drawImage(fullCanvas, 0, 0, workWidth, workHeight);

      const workMask = readMask(workWidth, workHeight);
      const fullMask = readMask(width, height);
      if (!workMask || !fullMask) throw new Error('Could not read the mask.');

      const repaired = await inpaint(
        {
          image: workContext.getImageData(0, 0, workWidth, workHeight),
          paintedMask: workMask,
        },
        (received, total) => {
          setStage('download');
          setProgress(total > 0 ? received / total : null);
        },
      );

      setStage('run');
      setProgress(null);
      setCached(true);

      const merged =
        scale === 1 ? repaired : compositeRepair(loaded.image, repaired, fullMask);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = width;
      outCanvas.height = height;
      outCanvas.getContext('2d')?.putImageData(merged, 0, 0);
      const blob = await canvasToBlob(outCanvas, 'image/png');

      setLoaded({ file: loaded.file, image: merged, url: track(URL.createObjectURL(blob)) });
      setEdits((count) => count + 1);
      clearMask();
    } catch (cause) {
      setError(
        cause instanceof Error ? `Could not repair the photo: ${cause.message}` : 'Could not repair the photo.',
      );
    } finally {
      setStage(null);
      setProgress(null);
    }
  }

  async function download() {
    if (!loaded) return;
    const canvas = document.createElement('canvas');
    canvas.width = loaded.image.width;
    canvas.height = loaded.image.height;
    canvas.getContext('2d')?.putImageData(loaded.image, 0, 0);
    downloadBlob(
      await canvasToBlob(canvas, 'image/png'),
      `${stripExtension(loaded.file.name)}-cleaned.png`,
    );
  }

  function reset() {
    setLoaded(null);
    setError(null);
    setEdits(0);
  }

  const isBusy = stage !== null;

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!loaded ? (
          <Dropzone
            onFiles={addFile}
            accept={ACCEPTED.join(',')}
            label="Add a photo"
            hint="Then brush over whatever you want gone — a person, a sign, a blemish."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <ToolSectionHeading>Brush over what to remove</ToolSectionHeading>
                <p className="text-sm text-muted">
                  {loaded.image.width}×{loaded.image.height}
                  {edits > 0 ? ` · ${edits} repair${edits === 1 ? '' : 's'} applied` : ''}
                </p>
              </div>
              <Button variant="ghost" onClick={reset} disabled={isBusy}>
                Clear
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-sunken p-3">
              <label className="flex items-center gap-2 text-sm">
                Brush
                <input
                  type="range"
                  min={8}
                  max={120}
                  step={2}
                  value={brush}
                  onChange={(event) => setBrush(Number(event.target.value))}
                  className="w-32 accent-[var(--tp-accent)]"
                />
                <span className="tabular-nums text-muted">{brush}px</span>
              </label>
              <Button size="sm" variant="secondary" onClick={clearMask} disabled={!hasMask}>
                Clear mask
              </Button>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-line bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
              <img
                ref={displayRef}
                src={loaded.url}
                alt="Photo being repaired"
                className="block w-full"
              />
              <canvas
                ref={maskCanvasRef}
                onPointerDown={(event) => {
                  if (isBusy) return;
                  drawingRef.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  paint(event);
                }}
                onPointerMove={(event) => {
                  if (!drawingRef.current || isBusy) return;
                  paint(event);
                }}
                onPointerUp={() => {
                  drawingRef.current = false;
                }}
                onPointerCancel={() => {
                  drawingRef.current = false;
                }}
                className="absolute inset-0 size-full cursor-crosshair touch-none"
                aria-label="Mask canvas. Brush over the area you want removed."
              />
            </div>
          </>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {loaded ? (
          <>
            <ModelNotice bytes={MODEL_BYTES} cached={cached} label="MI-GAN inpainting model" />

            {isBusy ? <ModelProgress stage={stage} value={progress} /> : null}

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={run} disabled={!hasMask || isBusy}>
                {isBusy ? 'Working…' : 'Remove what I brushed'}
              </Button>
              {edits > 0 ? (
                <Button variant="secondary" onClick={download} disabled={isBusy}>
                  Download PNG
                </Button>
              ) : null}
            </div>

            {edits > 0 ? (
              <p className="text-sm text-muted">
                Not quite right? Brush over what is left and run it again — each pass works on the
                repaired image, so you can clean up in stages.
              </p>
            ) : null}
          </>
        ) : null}
      </ToolSurface>
    </div>
  );
}
