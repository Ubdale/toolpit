'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, RangeInput } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { canvasToBlob } from '@/lib/pdf/operations';
import {
  composite,
  defaultMatteSettings,
  refineCutout,
  type Backdrop,
  type MatteSettings,
} from '@/lib/ai/matte';
import { loadBackgroundRemoval } from '@/lib/ai/runtime';

import { ModelNotice, ModelProgress } from './ModelNotice';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

// Sizes are the real byte counts from the library's resources.json, not
// estimates: this is the number a visitor on a metered connection is agreeing
// to, so it has to be right.
const QUALITIES = {
  isnet_quint8: {
    label: 'Fast',
    bytes: 44_348_940,
    note: 'Quantized. Quickest, and half the download. Softer on hair and fur.',
  },
  isnet_fp16: {
    label: 'Balanced',
    bytes: 88_152_708,
    note: 'Cleaner edges on fine detail, at twice the download.',
  },
  isnet: {
    label: 'Best',
    bytes: 176_149_806,
    note: 'Full precision. The sharpest matte, and a serious download.',
  },
} as const;

type Quality = keyof typeof QUALITIES;

/**
 * Inference device for the segmentation model.
 *
 * 'cpu' means the wasm backend. Not 'gpu': this library loads ORT's JS glue
 * from node_modules but fetches the matching wasm binary from its own CDN, so
 * the two only agree when onnxruntime-web is exactly the 1.21.0 it pins as a
 * peer. The wasm path is the pairing that is tested; WebGPU is not.
 */
const INFERENCE_DEVICE = 'cpu' as const;

const GRADIENTS: { label: string; from: string; to: string }[] = [
  { label: 'Ember', from: '#f0743d', to: '#d1541f' },
  { label: 'Dusk', from: '#4c1d95', to: '#db2777' },
  { label: 'Mint', from: '#0f766e', to: '#84cc16' },
  { label: 'Slate', from: '#1e293b', to: '#64748b' },
];

type BackdropKind = 'transparent' | 'color' | 'gradient' | 'blur';

export default function BackgroundRemoverTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [original, setOriginal] = useState<ImageData | null>(null);
  const [rawCutout, setRawCutout] = useState<ImageData | null>(null);

  const [quality, setQuality] = useState<Quality>('isnet_fp16');
  const [matte, setMatte] = useState<MatteSettings>(defaultMatteSettings);
  const [backdropKind, setBackdropKind] = useState<BackdropKind>('transparent');
  const [color, setColor] = useState('#ffffff');
  const [gradient, setGradient] = useState(0);
  const [blurRadius, setBlurRadius] = useState(18);

  const [output, setOutput] = useState<{ blob: Blob; url: string } | null>(null);
  const [stage, setStage] = useState<'download' | 'run' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);

  const urlsRef = useRef<string[]>([]);
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
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setError('This browser could not open a 2D canvas.');
      return;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    setError(null);
    setRawCutout(null);
    setOutput(null);
    setFile(picked);
    setOriginal(context.getImageData(0, 0, canvas.width, canvas.height));
    setSourceUrl(track(URL.createObjectURL(picked)));
  }

  async function run() {
    if (!file) return;
    setError(null);
    setRawCutout(null);
    setOutput(null);
    setStage('download');
    setProgress(0);

    try {
      const { removeBackground } = await loadBackgroundRemoval();

      const blob = await removeBackground(file, {
        model: quality,
        output: { format: 'image/png' },
        device: INFERENCE_DEVICE,
        progress: (key: string, current: number, total: number) => {
          setStage(key.startsWith('fetch') ? 'download' : 'run');
          setProgress(total > 0 ? current / total : null);
        },
      });

      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser could not open a 2D canvas.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();

      setRawCutout(context.getImageData(0, 0, canvas.width, canvas.height));
      setCached(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not remove the background: ${cause.message}`
          : 'Could not remove the background.',
      );
    } finally {
      setStage(null);
      setProgress(null);
    }
  }

  // Refine + composite run on every settings change. Both are pure canvas and
  // typed-array work on an image already in memory, so the sliders stay live
  // without ever touching the model again. Debounced so a drag does not queue
  // up a re-render per pixel of travel.
  useEffect(() => {
    if (!rawCutout || !original) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const refined = refineCutout(rawCutout, original, matte);

      const backdrop: Backdrop =
        backdropKind === 'color'
          ? { kind: 'color', color }
          : backdropKind === 'gradient'
            ? {
                kind: 'gradient',
                from: GRADIENTS[gradient]!.from,
                to: GRADIENTS[gradient]!.to,
              }
            : backdropKind === 'blur'
              ? { kind: 'blur', radius: blurRadius }
              : { kind: 'transparent' };

      const canvas = composite(refined, original, backdrop);
      const blob = await canvasToBlob(canvas, 'image/png');
      if (cancelled) return;
      setOutput({ blob, url: track(URL.createObjectURL(blob)) });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rawCutout, original, matte, backdropKind, color, gradient, blurRadius, track]);

  function reset() {
    setFile(null);
    setSourceUrl(null);
    setOriginal(null);
    setRawCutout(null);
    setOutput(null);
    setError(null);
  }

  const isBusy = stage !== null;
  const filename = file ? `${stripExtension(file.name)}-cutout.png` : 'cutout.png';

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!file ? (
          <Dropzone
            onFiles={addFile}
            accept={ACCEPTED.join(',')}
            label="Add a photo"
            hint="People, products and pets cut out best. Full resolution, no watermark."
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken">
              {sourceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL
                <img src={sourceUrl} alt={file.name} className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-sm text-muted">
                {formatBytes(file.size)}
                {original ? ` · ${original.width}×${original.height}` : ''}
              </p>
            </div>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Clear
            </Button>
          </div>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {file && !rawCutout ? (
          <>
            <RadioCards
              name="bg-quality"
              legend="Model"
              value={quality}
              onChange={(value) => setQuality(value)}
              options={(Object.keys(QUALITIES) as Quality[]).map((key) => ({
                value: key,
                label: QUALITIES[key].label,
                description: QUALITIES[key].note,
              }))}
            />

            <ModelNotice
              bytes={QUALITIES[quality].bytes}
              cached={cached}
              label="segmentation model"
            />

            {isBusy ? <ModelProgress stage={stage} value={progress} /> : null}

            <Button size="lg" onClick={run} disabled={isBusy}>
              {isBusy ? 'Working…' : 'Remove background'}
            </Button>
          </>
        ) : null}
      </ToolSurface>

      {rawCutout && output ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">{filename}</p>
              <p className="text-sm text-muted">
                {formatBytes(output.blob.size)} · {rawCutout.width}×{rawCutout.height}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadBlob(output.blob, filename)}>Download PNG</Button>
              <Button variant="secondary" onClick={run} disabled={isBusy}>
                Re-run model
              </Button>
              <Button variant="ghost" onClick={reset}>
                Clear
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Original</figcaption>
              <div className="grid h-72 place-items-center overflow-hidden rounded-lg bg-sunken">
                {sourceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL
                  <img
                    src={sourceUrl}
                    alt="Original photo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
            </figure>
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Result</figcaption>
              <div
                className="grid h-72 place-items-center overflow-hidden rounded-lg"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg,#c9c4bb 25%,transparent 25%),linear-gradient(-45deg,#c9c4bb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c9c4bb 75%),linear-gradient(-45deg,transparent 75%,#c9c4bb 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
                  backgroundColor: '#f4f1ec',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                <img
                  src={output.url}
                  alt="Background removed"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </figure>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div>
                <ToolSectionHeading>Fix the edges</ToolSectionHeading>
                <p className="mt-1 text-xs text-muted">
                  A dark or coloured rim around hair means edge pixels are still carrying the old
                  background. Despill solves it back out; shrink trims the last of it.
                </p>
              </div>

              <Field
                label={`Despill: ${Math.round(matte.despill * 100)}%`}
                hint="Removes the old background's colour from semi-transparent edge pixels."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={1}
                    step={0.05}
                    value={matte.despill}
                    onChange={(event) =>
                      setMatte((c) => ({ ...c, despill: Number(event.target.value) }))
                    }
                  />
                )}
              </Field>

              <Field
                label={`Shrink edge: ${matte.shrink}px`}
                hint="Pulls the cut inward. Clears stubborn halo, at the cost of fine strands."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={4}
                    step={1}
                    value={matte.shrink}
                    onChange={(event) =>
                      setMatte((c) => ({ ...c, shrink: Number(event.target.value) }))
                    }
                  />
                )}
              </Field>

              <Field
                label={`Feather: ${matte.feather}px`}
                hint="Softens the cut so it sits naturally on a new backdrop."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={4}
                    step={1}
                    value={matte.feather}
                    onChange={(event) =>
                      setMatte((c) => ({ ...c, feather: Number(event.target.value) }))
                    }
                  />
                )}
              </Field>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMatte(defaultMatteSettings)}
                className="w-fit"
              >
                Reset edge settings
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <ToolSectionHeading>Backdrop</ToolSectionHeading>
                <p className="mt-1 text-xs text-muted">
                  Swapped instantly — the model does not run again.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['transparent', 'Transparent'],
                    ['color', 'Solid colour'],
                    ['gradient', 'Gradient'],
                    ['blur', 'Blurred photo'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={backdropKind === kind}
                    onClick={() => setBackdropKind(kind)}
                    className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                      backdropKind === kind
                        ? 'border-accent bg-accent-soft font-medium'
                        : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {backdropKind === 'color' ? (
                <label className="flex w-fit items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <input
                    type="color"
                    value={color}
                    aria-label="Backdrop colour"
                    onChange={(event) => setColor(event.target.value)}
                    className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  Pick a colour
                </label>
              ) : null}

              {backdropKind === 'gradient' ? (
                <div className="flex flex-wrap gap-2">
                  {GRADIENTS.map((preset, index) => (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={gradient === index}
                      aria-label={`${preset.label} gradient`}
                      onClick={() => setGradient(index)}
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${preset.from}, ${preset.to})`,
                      }}
                      className={`size-11 rounded-xl border-2 transition-transform ${
                        gradient === index ? 'scale-105 border-text' : 'border-line'
                      }`}
                    />
                  ))}
                </div>
              ) : null}

              {backdropKind === 'blur' ? (
                <Field
                  label={`Blur: ${blurRadius}px`}
                  hint="Your own photo, blurred behind the subject — the portrait-mode look."
                >
                  {({ id, describedBy }) => (
                    <RangeInput
                      id={id}
                      aria-describedby={describedBy}
                      min={2}
                      max={60}
                      step={2}
                      value={blurRadius}
                      onChange={(event) => setBlurRadius(Number(event.target.value))}
                    />
                  )}
                </Field>
              ) : null}

              <p className="text-xs text-muted">
                Still not clean enough? Re-run with a heavier model — the download is the only
                cost, and it is cached after the first time.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
