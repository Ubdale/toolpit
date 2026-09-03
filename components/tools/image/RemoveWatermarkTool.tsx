'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { ModelNotice, ModelProgress } from '@/components/tools/ai/ModelNotice';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MODEL_BYTES, inpaintModelUrl, inpaintRegion } from '@/lib/ai/inpaint';
import { isModelCached } from '@/lib/ai/runtime';
import { stripExtension } from '@/lib/format';
import { canvasToBlob } from '@/lib/pdf/operations';

import { BatchResultPanel, type BatchOutput } from './BatchResultPanel';
import { IMAGE_ACCEPT, useImageFiles } from './useImageFiles';

/**
 * Regions are stored as fractions of the image, not pixels.
 *
 * That is what makes the batch case work: a stock watermark sits in the same
 * *relative* place on every photo in a set, even when the photos are different
 * sizes. Marking it once and applying it everywhere is the entire point of this
 * tool as distinct from the object remover.
 */
type Region = { id: string; x: number; y: number; width: number; height: number };

let counter = 0;
const nextId = () => `region-${(counter += 1)}`;

type Drag =
  | { kind: 'none' }
  | { kind: 'draw'; id: string; originX: number; originY: number };

export default function RemoveWatermarkTool() {
  const { files, error, setError, isReading, add, remove, clear } = useImageFiles(true);
  const first = files[0];

  const [regions, setRegions] = useState<Region[]>([]);
  const [feather, setFeather] = useState(6);
  const [cached, setCached] = useState<boolean | null>(null);

  const [stage, setStage] = useState<'download' | 'run' | null>(null);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<BatchOutput[] | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>({ kind: 'none' });

  useEffect(() => {
    void isModelCached(inpaintModelUrl()).then(setCached);
  }, []);

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = surfaceRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function startDraw(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(event);
    const id = nextId();
    dragRef.current = { kind: 'draw', id, originX: point.x, originY: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setRegions((current) => [...current, { id, x: point.x, y: point.y, width: 0, height: 0 }]);
  }

  function moveDraw(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.kind !== 'draw') return;
    const point = pointFromEvent(event);

    setRegions((current) =>
      current.map((region) =>
        region.id === drag.id
          ? {
              ...region,
              x: Math.min(drag.originX, point.x),
              y: Math.min(drag.originY, point.y),
              width: Math.abs(point.x - drag.originX),
              height: Math.abs(point.y - drag.originY),
            }
          : region,
      ),
    );
  }

  function endDraw() {
    if (dragRef.current.kind !== 'draw') return;
    const { id } = dragRef.current;
    dragRef.current = { kind: 'none' };
    // A click with no drag would otherwise leave an invisible zero-size region.
    setRegions((current) =>
      current.filter((region) => region.id !== id || (region.width > 0.01 && region.height > 0.01)),
    );
  }

  /** Builds the paint mask for one image from the fractional regions. */
  const buildMask = useCallback(
    (width: number, height: number): Uint8Array => {
      const mask = new Uint8Array(width * height);
      const pad = feather;

      for (const region of regions) {
        const x0 = Math.max(0, Math.floor(region.x * width) - pad);
        const y0 = Math.max(0, Math.floor(region.y * height) - pad);
        const x1 = Math.min(width, Math.ceil((region.x + region.width) * width) + pad);
        const y1 = Math.min(height, Math.ceil((region.y + region.height) * height) + pad);

        for (let y = y0; y < y1; y += 1) {
          mask.fill(255, y * width + x0, y * width + x1);
        }
      }

      return mask;
    },
    [regions, feather],
  );

  async function run() {
    if (files.length === 0 || regions.length === 0) return;
    setError(null);
    setBatchProgress(0);

    const results: BatchOutput[] = [];
    const failed: string[] = [];

    for (const [index, entry] of files.entries()) {
      try {
        const bitmap = await createImageBitmap(entry.file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('This browser could not open a 2D canvas.');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();

        const source = context.getImageData(0, 0, canvas.width, canvas.height);
        const mask = buildMask(canvas.width, canvas.height);

        setStage(cached ? 'run' : 'download');
        const painted = await inpaintRegion(source, mask, (loaded, total) => {
          setModelProgress(total ? loaded / total : null);
          if (loaded >= total) setStage('run');
        });
        setStage(null);
        setModelProgress(null);
        setCached(true);

        if (painted) context.putImageData(painted.image, 0, 0);

        // PNG keeps the repaired area free of the blocking artefacts a re-encode
        // to JPEG would stamp straight back over the patch.
        const blob = await canvasToBlob(canvas, 'image/png');
        results.push({
          id: entry.id,
          name: `${stripExtension(entry.name)}-clean.png`,
          blob,
          originalSize: entry.size,
          detail: `${canvas.width}×${canvas.height}`,
        });
      } catch (cause) {
        failed.push(entry.name);
        if (results.length === 0 && files.length === 1) {
          setError(cause instanceof Error ? cause.message : 'Could not process that image.');
        }
      }
      setBatchProgress((index + 1) / files.length);
    }

    setBatchProgress(null);
    setStage(null);

    if (results.length === 0) {
      setError((current) => current ?? 'None of those images could be processed.');
      return;
    }
    if (failed.length > 0) {
      setError(`${failed.length} image${failed.length === 1 ? '' : 's'} could not be processed.`);
    }
    setOutputs(results);
  }

  function reset() {
    clear();
    setOutputs(null);
    setRegions([]);
    setError(null);
  }

  if (outputs) {
    return (
      <BatchResultPanel
        outputs={outputs}
        zipName="toolpit-watermarks-removed.zip"
        onReset={reset}
        note="Repainted by a model running on your own device. None of these images were uploaded."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <ToolSurface className="flex flex-col gap-4">
        {!first ? (
          <Dropzone
            onFiles={add}
            accept={IMAGE_ACCEPT}
            multiple
            label="Drop your images here, or click to choose them"
            hint="Add a whole set at once — mark the watermark on the first and it is erased from all of them."
            disabled={isReading}
          />
        ) : (
          <>
            <div
              ref={surfaceRef}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              className="relative w-full touch-none select-none overflow-hidden rounded-xl bg-sunken"
              style={{ aspectRatio: `${first.width} / ${first.height}`, cursor: 'crosshair' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
              <img
                src={first.url}
                alt={first.name}
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full object-contain"
              />

              {regions.map((region) => (
                <span
                  key={region.id}
                  className="absolute border-2 border-accent bg-accent/20"
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.width * 100}%`,
                    height: `${region.height * 100}%`,
                  }}
                />
              ))}
            </div>

            <p className="text-xs text-muted">
              Drag a box over each watermark. Draw as many as you need — a tiled watermark wants one
              box per tile, or one big box across the lot.
            </p>
          </>
        )}

        {batchProgress !== null ? (
          <ProgressBar value={batchProgress} label="Erasing across the set" />
        ) : null}
        {stage ? <ModelProgress stage={stage} value={modelProgress} /> : null}
        <ErrorMessage>{error}</ErrorMessage>
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>Erase</ToolSectionHeading>

        {first ? (
          <>
            <div className="rounded-xl border border-line bg-sunken px-3 py-2.5 text-sm">
              <p className="font-medium">
                {files.length} image{files.length === 1 ? '' : 's'} · {regions.length} region
                {regions.length === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs text-muted">
                {files.length > 1
                  ? 'Every region is applied to all of them, scaled to each image.'
                  : 'Add more images to erase the same spot from all of them at once.'}
              </p>
            </div>

            {regions.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setRegions([])}>
                Clear the regions
              </Button>
            ) : null}

            <Field
              label={`Spread — ${feather}px`}
              hint="Grows each box outwards. A watermark's soft edge usually extends a little past where you drew."
            >
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={0}
                  max={24}
                  value={feather}
                  onChange={(event) => setFeather(Number(event.target.value))}
                />
              )}
            </Field>

            <ModelNotice bytes={MODEL_BYTES} cached={cached} label="inpainting model" />

            <Button
              size="lg"
              onClick={run}
              disabled={regions.length === 0 || batchProgress !== null}
            >
              {batchProgress !== null
                ? 'Erasing…'
                : `Erase from ${files.length} image${files.length === 1 ? '' : 's'}`}
            </Button>

            <Dropzone
              onFiles={add}
              accept={IMAGE_ACCEPT}
              multiple
              label="Add more images"
              hint="They all get the same regions."
            />

            {files.length > 1 ? (
              <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {files.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs" title={entry.name}>
                      {entry.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => remove(entry.id)}
                      className="shrink-0 rounded px-1 text-muted hover:text-text"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <Button variant="ghost" onClick={reset}>
              Start over
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted">
            Drop in the images you want cleaned up and the controls appear here.
          </p>
        )}

        <p className="border-t border-line pt-4 text-xs text-muted">
          Erasing a box works best on a watermark sitting over a simple background. For something
          tangled up with the subject, the freehand brush in{' '}
          <Link href="/image/remove-object" className="text-accent underline underline-offset-2">
            object removal
          </Link>{' '}
          gives you finer control on a single image.
        </p>
      </ToolSurface>
    </div>
  );
}
