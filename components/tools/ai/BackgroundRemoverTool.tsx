'use client';

import { useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, RadioCards } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { canvasToBlob } from '@/lib/pdf/operations';
import { loadBackgroundRemoval } from '@/lib/ai/runtime';

import { ModelNotice, ModelProgress } from './ModelNotice';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

// isnet_fp16 is the quality/size sweet spot; quint8 halves the download again
// at a visible cost on hair and soft edges.
const QUALITIES = {
  isnet_fp16: { label: 'Balanced', bytes: 44_000_000, note: 'Best all-round. ~44 MB model.' },
  isnet_quint8: { label: 'Light', bytes: 22_000_000, note: 'Half the download, softer edges. ~22 MB.' },
} as const;

type Quality = keyof typeof QUALITIES;
type Backdrop = 'transparent' | '#ffffff' | '#000000' | 'custom';

export default function BackgroundRemoverTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>('isnet_fp16');
  const [backdrop, setBackdrop] = useState<Backdrop>('transparent');
  const [customColor, setCustomColor] = useState('#d1541f');
  const [cutout, setCutout] = useState<{ blob: Blob; url: string } | null>(null);
  const [composed, setComposed] = useState<{ blob: Blob; url: string } | null>(null);
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

  function track(url: string) {
    urlsRef.current.push(url);
    return url;
  }

  function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP or AVIF.`);
      return;
    }
    setError(null);
    setCutout(null);
    setComposed(null);
    setFile(picked);
    setSourceUrl(track(URL.createObjectURL(picked)));
  }

  async function run() {
    if (!file) return;
    setError(null);
    setCutout(null);
    setComposed(null);
    setStage('download');
    setProgress(0);

    try {
      const { removeBackground } = await loadBackgroundRemoval();

      const blob = await removeBackground(file, {
        model: quality,
        output: { format: 'image/png' },
        // WebGPU where the browser has it; the library falls back on its own.
        device: typeof navigator !== 'undefined' && 'gpu' in navigator ? 'gpu' : 'cpu',
        progress: (key: string, current: number, total: number) => {
          // Keys look like "fetch:/models/isnet" during download and
          // "compute:inference" once the model is running.
          setStage(key.startsWith('fetch') ? 'download' : 'run');
          setProgress(total > 0 ? current / total : null);
        },
      });

      setCutout({ blob, url: track(URL.createObjectURL(blob)) });
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

  // Compositing the cutout onto a colour is instant and local, so it re-runs
  // whenever the backdrop changes rather than needing another model pass.
  useEffect(() => {
    if (!cutout) {
      setComposed(null);
      return;
    }
    if (backdrop === 'transparent') {
      setComposed(null);
      return;
    }

    let cancelled = false;
    const color = backdrop === 'custom' ? customColor : backdrop;

    (async () => {
      const bitmap = await createImageBitmap(cutout.blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      bitmap.close();

      const blob = await canvasToBlob(canvas, 'image/png');
      if (cancelled) return;
      setComposed({ blob, url: track(URL.createObjectURL(blob)) });
    })();

    return () => {
      cancelled = true;
    };
  }, [cutout, backdrop, customColor]);

  function reset() {
    setFile(null);
    setSourceUrl(null);
    setCutout(null);
    setComposed(null);
    setError(null);
  }

  const output = composed ?? cutout;
  const isBusy = stage !== null;

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
              <p className="text-sm text-muted">{formatBytes(file.size)}</p>
            </div>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Clear
            </Button>
          </div>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {file ? (
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

            <ModelNotice bytes={QUALITIES[quality].bytes} cached={cached} label="segmentation model" />

            {isBusy ? <ModelProgress stage={stage} value={progress} /> : null}

            <Button size="lg" onClick={run} disabled={isBusy}>
              {isBusy ? 'Working…' : cutout ? 'Run again' : 'Remove background'}
            </Button>
          </>
        ) : null}
      </ToolSurface>

      {cutout && output && file ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">{stripExtension(file.name)}-cutout.png</p>
              <p className="text-sm text-muted">{formatBytes(output.blob.size)} · full resolution</p>
            </div>
            <Button
              onClick={() => downloadBlob(output.blob, `${stripExtension(file.name)}-cutout.png`)}
            >
              Download PNG
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <ToolSectionHeading>Backdrop</ToolSectionHeading>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['transparent', 'Transparent'],
                  ['#ffffff', 'White'],
                  ['#000000', 'Black'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={backdrop === value}
                  onClick={() => setBackdrop(value)}
                  className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                    backdrop === value
                      ? 'border-accent bg-accent-soft font-medium'
                      : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  {label}
                </button>
              ))}
              <label
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  backdrop === 'custom' ? 'border-accent bg-accent-soft font-medium' : 'border-line bg-surface'
                }`}
              >
                <input
                  type="color"
                  value={customColor}
                  aria-label="Custom backdrop colour"
                  onChange={(event) => {
                    setCustomColor(event.target.value);
                    setBackdrop('custom');
                  }}
                  className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                Colour
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Original</figcaption>
              <div className="grid h-56 place-items-center overflow-hidden rounded-lg bg-sunken">
                {sourceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL
                  <img src={sourceUrl} alt="Original photo" className="max-h-full max-w-full object-contain" />
                ) : null}
              </div>
            </figure>
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Cut out</figcaption>
              <div
                className="grid h-56 place-items-center overflow-hidden rounded-lg"
                style={{
                  // Checkerboard, so transparency reads as transparency rather
                  // than as whatever colour the theme happens to be.
                  backgroundImage:
                    'linear-gradient(45deg,#c9c4bb 25%,transparent 25%),linear-gradient(-45deg,#c9c4bb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c9c4bb 75%),linear-gradient(-45deg,transparent 75%,#c9c4bb 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
                  backgroundColor: '#f4f1ec',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                <img src={output.url} alt="Background removed" className="max-h-full max-w-full object-contain" />
              </div>
            </figure>
          </div>
        </section>
      ) : null}
    </div>
  );
}
