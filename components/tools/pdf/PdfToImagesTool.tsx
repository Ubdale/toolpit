'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, TextInput } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { createZip, downloadBlob, type ZipEntry } from '@/lib/download';
import { formatBytes, parsePageRanges, stripExtension } from '@/lib/format';
import { renderPages } from '@/lib/pdf/operations';

import { usePdfFiles } from './usePdfFiles';

type Format = 'image/png' | 'image/jpeg';
type Resolution = '1' | '2' | '3';

const RESOLUTIONS: Record<Resolution, { label: string; description: string }> = {
  '1': { label: 'Screen (72 DPI)', description: 'Smallest files, fine for the web.' },
  '2': { label: 'High (144 DPI)', description: 'A good default for most uses.' },
  '3': { label: 'Print (216 DPI)', description: 'Large files, best for printing.' },
};

type Output = { filename: string; blob: Blob; previewUrl: string };

export default function PdfToImagesTool() {
  const { files, error, setError, isReading, add, remove, clear } = usePdfFiles(false);
  const [format, setFormat] = useState<Format>('image/png');
  const [resolution, setResolution] = useState<Resolution>('2');
  const [allPages, setAllPages] = useState(true);
  const [ranges, setRanges] = useState('1-');
  const [progress, setProgress] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);

  const file = files[0];
  const isBusy = progress !== null;
  const extension = format === 'image/png' ? 'png' : 'jpg';

  async function run() {
    if (!file) return;
    setError(null);
    setOutputs(null);
    setZip(null);
    setProgress(0);

    try {
      const pageIndices = allPages ? undefined : parsePageRanges(ranges, file.pageCount);
      const rendered = await renderPages(
        file.bytes,
        {
          scale: Number(resolution),
          format,
          quality: format === 'image/jpeg' ? 0.9 : undefined,
          pageIndices,
        },
        (done, total) => setProgress(done / total),
      );

      const base = stripExtension(file.name);
      const results: Output[] = rendered.map((page) => ({
        filename: `${base}-page-${page.pageNumber}.${extension}`,
        blob: page.blob,
        previewUrl: URL.createObjectURL(page.blob),
      }));

      if (results.length > 1) {
        const entries: ZipEntry[] = [];
        for (const output of results) {
          entries.push({
            name: output.filename,
            data: new Uint8Array(await output.blob.arrayBuffer()),
          });
        }
        setZip(createZip(entries));
      }

      setOutputs(results);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not convert this PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    for (const output of outputs ?? []) URL.revokeObjectURL(output.previewUrl);
    clear();
    setOutputs(null);
    setZip(null);
  }

  if (outputs && outputs.length > 0 && file) {
    const first = outputs[0]!;
    const zipName = `${stripExtension(file.name)}-images.zip`;
    const isBundle = outputs.length > 1 && zip !== null;

    return (
      <ResultPanel
        filename={isBundle ? zipName : first.filename}
        size={isBundle ? zip.size : first.blob.size}
        detail={`${outputs.length} image${outputs.length === 1 ? '' : 's'} · ${extension.toUpperCase()}`}
        target={
          isBundle
            ? { blob: zip, filename: zipName }
            : { blob: first.blob, filename: first.filename }
        }
        onReset={reset}
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {outputs.map((output) => (
            <li
              key={output.filename}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <div className="grid aspect-3/4 place-items-center bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- local
                    object URL for a bitmap we just rendered in this tab. */}
                <img
                  src={output.previewUrl}
                  alt={output.filename}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-2">
                <span className="min-w-0 text-xs text-muted">
                  {formatBytes(output.blob.size)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadBlob(output.blob, output.filename)}
                >
                  Save
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </ResultPanel>
    );
  }

  return (
    <ToolSurface className="flex flex-col gap-6">
      {!file ? (
        <Dropzone
          onFiles={add}
          accept="application/pdf,.pdf"
          label="Add a PDF to convert"
          hint="Pages are rendered on your own machine, one at a time."
          disabled={isBusy}
        />
      ) : (
        <FileList
          label="PDF to convert"
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
            <ToolSectionHeading>Output</ToolSectionHeading>

            <RadioCards
              name="image-format"
              legend="Format"
              value={format}
              onChange={setFormat}
              options={[
                {
                  value: 'image/png',
                  label: 'PNG',
                  description: 'Lossless, sharp text, larger files.',
                },
                {
                  value: 'image/jpeg',
                  label: 'JPG',
                  description: 'Much smaller, best for photo-heavy pages.',
                },
              ]}
            />

            <Field label="Resolution" hint={RESOLUTIONS[resolution].description}>
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value as Resolution)}
                  className="h-11 w-full rounded-xl border border-line bg-surface px-3 pr-8 text-sm hover:border-line-strong focus:border-accent"
                >
                  {Object.entries(RESOLUTIONS).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allPages}
                  onChange={(event) => setAllPages(event.target.checked)}
                  className="size-4 accent-[var(--tp-accent)]"
                />
                Convert every page
              </label>

              {!allPages ? (
                <Field
                  label="Pages"
                  hint={`Numbers and ranges, e.g. "1-3, 5". This PDF has ${file.pageCount} pages.`}
                >
                  {({ id, describedBy }) => (
                    <TextInput
                      id={id}
                      aria-describedby={describedBy}
                      value={ranges}
                      onChange={(event) => setRanges(event.target.value)}
                      placeholder="1-3, 5"
                    />
                  )}
                </Field>
              ) : null}
            </div>
          </div>

          {isBusy ? <ProgressBar value={progress} label="Rendering pages…" /> : null}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={run} disabled={isBusy}>
              Convert to {extension.toUpperCase()}
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
