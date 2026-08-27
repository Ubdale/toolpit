'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, RangeInput } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { formatBytes, stripExtension } from '@/lib/format';
import { compressPdf, toPdfBlob, type CompressMode } from '@/lib/pdf/operations';

import { usePdfFiles } from './usePdfFiles';

/** Rasterise presets, from "still looks sharp" to "just make it small". */
const PRESETS = [
  { id: 'high', label: 'High quality', scale: 2, quality: 0.82 },
  { id: 'balanced', label: 'Balanced', scale: 1.5, quality: 0.72 },
  { id: 'small', label: 'Smallest file', scale: 1.1, quality: 0.6 },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

export default function CompressTool() {
  const { files, error, setError, isReading, add, remove, clear } = usePdfFiles(false);
  const [mode, setMode] = useState<CompressMode>('rasterize');
  const [presetId, setPresetId] = useState<PresetId>('balanced');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Blob | null>(null);

  const file = files[0];
  const isBusy = progress !== null;
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[1]!;

  async function run() {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const bytes = await compressPdf(
        file.bytes,
        { mode, scale: preset.scale, quality: preset.quality },
        (done, total) => setProgress(done / total),
      );
      setResult(toPdfBlob(bytes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not compress this PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    clear();
    setResult(null);
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}-compressed.pdf`;
    const saved = file.size - result.size;
    const percent = Math.round((saved / file.size) * 100);

    return (
      <ResultPanel
        filename={filename}
        size={result.size}
        detail={
          saved > 0
            ? `${percent}% smaller — down from ${formatBytes(file.size)}`
            : `No smaller than the original (${formatBytes(file.size)})`
        }
        target={{ blob: result, filename }}
        onReset={reset}
      >
        {saved <= 0 ? (
          <p className="text-sm text-muted">
            This PDF was already well optimised. Try the rasterise mode, or a lower quality
            preset, if you need it smaller — your original is untouched either way.
          </p>
        ) : null}
      </ResultPanel>
    );
  }

  return (
    <ToolSurface className="flex flex-col gap-6">
      {!file ? (
        <Dropzone
          onFiles={add}
          accept="application/pdf,.pdf"
          label="Add a PDF to compress"
          hint="Large scanned documents shrink the most."
          disabled={isBusy}
        />
      ) : (
        <FileList
          label="PDF to compress"
          files={[
            {
              id: file.id,
              name: file.name,
              size: file.size,
              detail: `${file.pageCount} page${file.pageCount === 1 ? '' : 's'}`,
            },
          ]}
          onRemove={remove}
        />
      )}

      <ErrorMessage>{error}</ErrorMessage>
      {isReading ? <p className="text-sm text-muted">Reading file…</p> : null}

      {file ? (
        <>
          <div className="flex flex-col gap-4">
            <ToolSectionHeading>How hard should we squeeze?</ToolSectionHeading>
            <RadioCards
              name="compress-mode"
              legend="Compression method"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: 'rasterize',
                  label: 'Strong (rasterise pages)',
                  description:
                    'Re-renders each page as an image. Big savings on scans; text stops being selectable.',
                },
                {
                  value: 'lossless',
                  label: 'Safe (rebuild file)',
                  description:
                    'Rewrites the file structure and drops unused objects. Text stays text; savings are modest.',
                },
              ]}
            />

            {mode === 'rasterize' ? (
              <Field
                label={`Quality: ${preset.label}`}
                hint="Higher quality keeps more detail and a larger file. Lower gets you the smallest PDF."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={PRESETS.length - 1}
                    step={1}
                    value={PRESETS.findIndex((item) => item.id === presetId)}
                    onChange={(event) =>
                      setPresetId(PRESETS[Number(event.target.value)]?.id ?? 'balanced')
                    }
                  />
                )}
              </Field>
            ) : null}
          </div>

          {isBusy ? (
            <ProgressBar
              value={progress}
              label={mode === 'rasterize' ? 'Re-rendering pages…' : 'Rebuilding the file…'}
            />
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={run} disabled={isBusy}>
              Compress PDF
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Clear
            </Button>
          </div>
        </>
      ) : null}
    </ToolSurface>
  );
}
