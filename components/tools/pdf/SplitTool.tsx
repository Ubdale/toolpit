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
import { extractPages, toPdfBlob } from '@/lib/pdf/operations';

import { usePdfFiles } from './usePdfFiles';

type Mode = 'extract' | 'per-range' | 'per-page';

type Output = { filename: string; blob: Blob };

export default function SplitTool() {
  const { files, error, setError, isReading, add, remove, clear } = usePdfFiles(false);
  const [mode, setMode] = useState<Mode>('extract');
  const [ranges, setRanges] = useState('1-3, 5');
  const [progress, setProgress] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);

  const file = files[0];
  const isBusy = progress !== null;

  async function run() {
    if (!file) return;
    setError(null);
    setOutputs(null);
    setZip(null);
    setProgress(0);

    try {
      const base = stripExtension(file.name);
      const results: Output[] = [];

      if (mode === 'per-page') {
        for (let index = 0; index < file.pageCount; index += 1) {
          const bytes = await extractPages(file.bytes, [index]);
          results.push({
            filename: `${base}-page-${index + 1}.pdf`,
            blob: toPdfBlob(bytes),
          });
          setProgress((index + 1) / file.pageCount);
        }
      } else if (mode === 'per-range') {
        const chunks = ranges
          .split(',')
          .map((chunk) => chunk.trim())
          .filter(Boolean);
        if (chunks.length === 0) throw new Error('Enter at least one page or range.');

        for (const [index, chunk] of chunks.entries()) {
          const pages = parsePageRanges(chunk, file.pageCount);
          const bytes = await extractPages(file.bytes, pages);
          results.push({
            filename: `${base}-${chunk.replace(/\s+/g, '')}.pdf`,
            blob: toPdfBlob(bytes),
          });
          setProgress((index + 1) / chunks.length);
        }
      } else {
        const pages = parsePageRanges(ranges, file.pageCount);
        const bytes = await extractPages(file.bytes, pages);
        results.push({
          filename: `${base}-extract.pdf`,
          blob: toPdfBlob(bytes),
        });
        setProgress(1);
      }

      // Bundle the ZIP up front so the main Download button always has a real
      // file behind it rather than building one on click.
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
      setError(cause instanceof Error ? cause.message : 'Something went wrong splitting the PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    clear();
    setOutputs(null);
    setZip(null);
  }

  if (outputs && outputs.length > 0) {
    const first = outputs[0]!;
    const zipName = `${stripExtension(file?.name ?? 'split')}-split.zip`;
    const isBundle = outputs.length > 1 && zip !== null;

    return (
      <ResultPanel
        filename={isBundle ? zipName : first.filename}
        size={isBundle ? zip.size : first.blob.size}
        detail={isBundle ? `${outputs.length} PDFs, zipped on your device` : undefined}
        target={
          isBundle ? { blob: zip, filename: zipName } : { blob: first.blob, filename: first.filename }
        }
        onReset={reset}
      >
        {outputs.length > 1 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Or grab them one at a time</p>
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {outputs.map((output) => (
                <li
                  key={output.filename}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{output.filename}</span>
                    <span className="block text-xs text-muted">{formatBytes(output.blob.size)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadBlob(output.blob, output.filename)}
                  >
                    Download
                  </Button>
                </li>
              ))}
            </ul>
          </div>
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
          label="Add a PDF to split"
          hint="One PDF. It is read straight into this tab, never uploaded."
          disabled={isBusy}
        />
      ) : (
        <FileList
          label="PDF to split"
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
            <ToolSectionHeading>What should happen</ToolSectionHeading>
            <RadioCards
              name="split-mode"
              legend="Split mode"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: 'extract',
                  label: 'Extract pages',
                  description: 'One new PDF containing just the pages you pick.',
                },
                {
                  value: 'per-range',
                  label: 'One file per range',
                  description: 'Each comma-separated range becomes its own PDF.',
                },
                {
                  value: 'per-page',
                  label: 'One file per page',
                  description: `Splits all ${file.pageCount} pages into separate PDFs.`,
                },
              ]}
            />

            {mode !== 'per-page' ? (
              <Field
                label="Pages"
                hint={`Use numbers and ranges, e.g. "1-3, 5, 8-". This PDF has ${file.pageCount} pages.`}
              >
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    value={ranges}
                    onChange={(event) => setRanges(event.target.value)}
                    inputMode="numeric"
                    placeholder="1-3, 5"
                  />
                )}
              </Field>
            ) : null}
          </div>

          {isBusy ? <ProgressBar value={progress} label="Building your PDFs…" /> : null}

          <div className="flex flex-wrap gap-3">
            <Button onClick={run} disabled={isBusy} size="lg">
              Split PDF
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
