'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { mergePdfs, toPdfBlob } from '@/lib/pdf/operations';

import { usePdfFiles } from './usePdfFiles';

export default function MergeTool() {
  const { files, error, setError, isReading, add, remove, move, clear } = usePdfFiles(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null);

  const totalPages = files.reduce((sum, file) => sum + file.pageCount, 0);
  const isBusy = progress !== null;

  async function run() {
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const bytes = await mergePdfs(
        files.map((file) => ({ name: file.name, bytes: file.bytes })),
        (done, total) => setProgress(done / total),
      );
      setResult({
        blob: toPdfBlob(bytes),
        pages: totalPages,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong merging the files.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    clear();
    setResult(null);
  }

  if (result) {
    return (
      <ResultPanel
        filename="merged.pdf"
        size={result.blob.size}
        detail={`${result.pages} pages from ${files.length} files`}
        target={{ blob: result.blob, filename: 'merged.pdf' }}
        onReset={reset}
      />
    );
  }

  return (
    <ToolSurface className="flex flex-col gap-6">
      <Dropzone
        onFiles={add}
        accept="application/pdf,.pdf"
        multiple
        label={files.length === 0 ? 'Add your PDFs' : 'Add more PDFs'}
        hint="Two or more PDF files. They are read straight into this tab."
        disabled={isBusy}
      />

      <ErrorMessage>{error}</ErrorMessage>
      {isReading ? <p className="text-sm text-muted">Reading files…</p> : null}

      {files.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <ToolSectionHeading>Merge order</ToolSectionHeading>
            <p className="text-sm text-muted">
              {files.length} files · {totalPages} pages
            </p>
          </div>
          <FileList
            label="PDFs to merge, in order"
            files={files.map((file) => ({
              id: file.id,
              name: file.name,
              size: file.size,
              detail: `${file.pageCount} page${file.pageCount === 1 ? '' : 's'}`,
            }))}
            onRemove={remove}
            onMove={move}
          />
        </div>
      ) : null}

      {isBusy ? <ProgressBar value={progress} label="Merging pages…" /> : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={run} disabled={files.length < 2 || isBusy} size="lg">
          Merge {files.length > 1 ? `${files.length} PDFs` : 'PDFs'}
        </Button>
        {files.length > 0 ? (
          <Button variant="ghost" onClick={reset} disabled={isBusy}>
            Clear
          </Button>
        ) : null}
      </div>
    </ToolSurface>
  );
}
