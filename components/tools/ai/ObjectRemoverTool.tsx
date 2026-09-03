'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { BeforeAfter } from '@/components/ui/BeforeAfter';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { canvasToBlob } from '@/lib/pdf/operations';
import { MODEL_BYTES, inpaintModelUrl, inpaintRegion } from '@/lib/ai/inpaint';
import { isModelCached } from '@/lib/ai/runtime';

import { ModelNotice, ModelProgress } from './ModelNotice';
import { Slider } from '@/components/ui/Slider';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

/**
 * One step of edit history.
 *
 * PNG blobs rather than ImageData: a 12-megapixel frame is ~48 MB raw, so a
 * handful of undo steps would be half a gigabyte. Compressed they are a couple
 * of megabytes each and decode in milliseconds when actually needed.
 */
type Step = { blob: Blob; url: string };

type Tool = 'brush' | 'eraser';

export default function ObjectRemoverTool() {
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [history, setHistory] = useState<Step[]>([]);
  const [index, setIndex] = useState(-1);

  const [tool, setTool] = useState<Tool>('brush');
  const [brush, setBrush] = useState(36);
  const [hasMask, setHasMask] = useState(false);

  const [stage, setStage] = useState<'download' | 'run' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<{ seconds: number; pixels: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
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

  const current = index >= 0 ? history[index] : undefined;
  const original = history[0];
  const isBusy = stage !== null;
  const canUndo = index > 0;
  const canRedo = index >= 0 && index < history.length - 1;

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

    const blob = await canvasToBlob(canvas, 'image/png');
    setError(null);
    setLastRun(null);
    setFile(picked);
    setSize({ width: canvas.width, height: canvas.height });
    setHistory([{ blob, url: track(URL.createObjectURL(blob)) }]);
    setIndex(0);
  }

  // Size the mask overlay to the image whenever the image changes.
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !size) return;
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  }, [size, index]);

  const undo = useCallback(() => {
    setIndex((value) => Math.max(0, value - 1));
  }, []);

  const redo = useCallback(() => {
    setHistory((steps) => {
      setIndex((value) => Math.min(steps.length - 1, value + 1));
      return steps;
    });
  }, []);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, the shortcuts anyone editing an image
  // reaches for without thinking.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      // Keep the brush a constant visual size however far the image is scaled
      // down to fit the page.
      radius: (brush / 2) * (canvas.width / rect.width),
    };
  }

  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = maskCanvasRef.current;
    const point = pointFrom(event);
    if (!canvas || !point) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.fillStyle = 'rgba(209, 84, 31, 0.55)';
    context.beginPath();
    context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';
    setHasMask(tool === 'brush' ? true : hasAnyMask(canvas));
  }

  function hasAnyMask(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) return false;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 127) return true;
    return false;
  }

  function clearMask() {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  }

  function readMask(width: number, height: number): Uint8Array | null {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const { data } = context.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3]!;
    return mask;
  }

  async function run() {
    if (!current || !size || !hasMask) return;
    setError(null);
    setStage(cached ? 'run' : 'download');
    setProgress(0);
    const started = Date.now();

    try {
      const bitmap = await createImageBitmap(current.blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser could not open a 2D canvas.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const mask = readMask(canvas.width, canvas.height);
      if (!mask) throw new Error('Could not read the mask.');

      const repaired = await inpaintRegion(image, mask, (received, total) => {
        setStage('download');
        setProgress(total > 0 ? received / total : null);
      });
      if (!repaired) throw new Error('Nothing was brushed.');

      setStage('run');
      setProgress(null);
      setCached(true);

      const out = document.createElement('canvas');
      out.width = repaired.image.width;
      out.height = repaired.image.height;
      out.getContext('2d')?.putImageData(repaired.image, 0, 0);
      const blob = await canvasToBlob(out, 'image/png');

      // A new edit truncates any redo branch, the way every editor behaves.
      setHistory((steps) => [
        ...steps.slice(0, index + 1),
        { blob, url: track(URL.createObjectURL(blob)) },
      ]);
      setIndex((value) => value + 1);
      setLastRun({
        seconds: Math.max(1, Math.round((Date.now() - started) / 1000)),
        pixels: repaired.inferencePixels,
      });
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

  function reset() {
    setFile(null);
    setSize(null);
    setHistory([]);
    setIndex(-1);
    setError(null);
    setLastRun(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!current || !size ? (
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
                  {size.width}×{size.height}
                  {index > 0 ? ` · ${index} repair${index === 1 ? '' : 's'}` : ''}
                  {lastRun
                    ? ` · last run ${lastRun.seconds}s on ${(lastRun.pixels / 1000).toFixed(0)}k pixels`
                    : ''}
                </p>
              </div>
              <Button variant="ghost" onClick={reset} disabled={isBusy}>
                Clear
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-sunken p-3">
              <div className="flex items-center gap-1">
                {(['brush', 'eraser'] as Tool[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tool === value}
                    onClick={() => setTool(value)}
                    className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
                      tool === value
                        ? 'bg-accent text-accent-contrast font-medium'
                        : 'text-muted hover:bg-surface hover:text-text'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <Slider
                className="w-48"
                label="Size"
                value={brush}
                min={8}
                max={160}
                step={2}
                suffix="px"
                onInput={(value) => setBrush(value as number)}
                onChange={(value) => setBrush(value as number)}
              />

              <Button size="sm" variant="secondary" onClick={clearMask} disabled={!hasMask}>
                Clear mask
              </Button>

              <span className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo || isBusy}>
                  Undo
                </Button>
                <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo || isBusy}>
                  Redo
                </Button>
              </span>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-line bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
              <img src={current.url} alt="Photo being repaired" className="block w-full" />
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

        {current ? (
          <>
            <ModelNotice bytes={MODEL_BYTES} cached={cached} label="MI-GAN inpainting model" />

            {isBusy ? <ModelProgress stage={stage} value={progress} /> : null}

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={run} disabled={!hasMask || isBusy}>
                {isBusy ? 'Working…' : 'Remove what I brushed'}
              </Button>
              {index > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadBlob(current.blob, `${stripExtension(file?.name ?? 'photo')}-cleaned.png`)
                  }
                  disabled={isBusy}
                >
                  Download PNG · {formatBytes(current.blob.size)}
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted">
              Only the brushed area plus a margin of surrounding context is sent to the model, so
              erasing something small stays fast even in a large photo. Cover the whole object —
              a mask that stops short leaves its edge as context, and the model will faithfully
              paint more of it back.
            </p>
          </>
        ) : null}
      </ToolSurface>

      {original && current && index > 0 ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>
          <div className="mt-4">
            <BeforeAfter
              beforeSrc={original.url}
              afterSrc={current.url}
              beforeLabel="Original"
              afterLabel="Repaired"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
