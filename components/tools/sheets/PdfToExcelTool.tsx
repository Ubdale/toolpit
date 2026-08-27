'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, RangeInput } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { createZip, downloadBlob, type ZipEntry } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { usePdfFiles } from '@/components/tools/pdf/usePdfFiles';
import { defaultExtractOptions, pdfToTables, type ExtractOptions } from '@/lib/sheets/fromPdf';
import { writeCsv, type SheetTable } from '@/lib/sheets/runtime';
import {
  defaultExcelStyleOptions,
  writeStyledWorkbook,
  type ExcelStyleOptions,
} from '@/lib/sheets/toExcel';

type Output = 'combined' | 'separate';

export default function PdfToExcelTool() {
  const { files, error, setError, isReading, add, remove, move, clear } = usePdfFiles(true);
  const [options, setOptions] = useState<ExtractOptions>(defaultExtractOptions);
  const [output, setOutput] = useState<Output>('separate');
  const [style, setStyle] = useState<ExcelStyleOptions>(defaultExcelStyleOptions);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState('Reading the pages…');
  const [preview, setPreview] = useState<SheetTable | null>(null);
  const [firstTable, setFirstTable] = useState<SheetTable | null>(null);
  const [emptyPages, setEmptyPages] = useState<string[]>([]);
  const [result, setResult] = useState<{ blob: Blob; filename: string; detail: string } | null>(
    null,
  );

  const isBusy = progress !== null;

  async function run() {
    if (files.length === 0) return;
    setError(null);
    setResult(null);
    setPreview(null);
    setProgress(0);

    const warnings: string[] = [];

    try {
      if (output === 'combined') {
        const all: SheetTable[] = [];

        for (const [index, file] of files.entries()) {
          setProgressLabel(`Reading ${file.name}…`);
          const extracted = await pdfToTables(file.bytes, options);
          if (extracted.emptyPages.length > 0) {
            warnings.push(`${file.name}: page ${extracted.emptyPages.join(', ')}`);
          }
          // Prefix sheet names with the source file when several PDFs land in
          // one workbook, or every book would be full of "Page 1".
          all.push(
            ...extracted.tables.map((table) => ({
              ...table,
              name:
                files.length > 1 ? `${stripExtension(file.name)} ${table.name}` : table.name,
            })),
          );
          setProgress((index + 1) / files.length);
        }

        if (all.length === 0) throw new Error(noTextMessage(files.length));

        const blob = await writeStyledWorkbook(all, style);
        const filename =
          files.length === 1 ? `${stripExtension(files[0]!.name)}.xlsx` : 'extracted.xlsx';
        setResult({
          blob,
          filename,
          detail: `${all.length} sheet${all.length === 1 ? '' : 's'} from ${files.length} PDF${files.length === 1 ? '' : 's'}`,
        });
        setFirstTable(all[0] ?? null);
        setPreview(all[0] ?? null);
      } else {
        const entries: ZipEntry[] = [];
        let firstOfAll: SheetTable | null = null;

        for (const [index, file] of files.entries()) {
          setProgressLabel(`Reading ${file.name}…`);
          const extracted = await pdfToTables(file.bytes, options);
          if (extracted.emptyPages.length > 0) {
            warnings.push(`${file.name}: page ${extracted.emptyPages.join(', ')}`);
          }
          if (extracted.tables.length > 0) {
            firstOfAll ??= extracted.tables[0]!;
            const workbook = await writeStyledWorkbook(extracted.tables, style);
            entries.push({
              name: `${stripExtension(file.name)}.xlsx`,
              data: new Uint8Array(await workbook.arrayBuffer()),
            });
          }
          setProgress((index + 1) / files.length);
        }

        if (entries.length === 0) throw new Error(noTextMessage(files.length));

        if (entries.length === 1) {
          const only = entries[0]!;
          setResult({
            blob: new Blob([only.data as unknown as BlobPart], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
            filename: only.name,
            detail: '1 workbook',
          });
        } else {
          setResult({
            blob: createZip(entries),
            filename: 'extracted.zip',
            detail: `${entries.length} workbooks, zipped on your device`,
          });
        }

        setFirstTable(firstOfAll);
        setPreview(firstOfAll);
      }

      setEmptyPages(warnings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read these PDFs.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setPreview(null);
    setFirstTable(null);
    setEmptyPages([]);
  }

  const totalPages = files.reduce((sum, file) => sum + file.pageCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        <Dropzone
          onFiles={add}
          accept="application/pdf,.pdf"
          multiple
          label={files.length === 0 ? 'Add your PDFs' : 'Add more PDFs'}
          hint="As many as you like — invoices, statements, reports. There is no file limit, because there is no server to pay for one."
          disabled={isBusy}
        />

        <ErrorMessage>{error}</ErrorMessage>
        {isReading ? <p className="text-sm text-muted">Reading files…</p> : null}

        {files.length > 0 ? (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <ToolSectionHeading>PDFs to convert</ToolSectionHeading>
                <p className="text-sm text-muted">
                  {files.length} file{files.length === 1 ? '' : 's'} · {totalPages} pages
                </p>
              </div>
              <FileList
                label="PDFs to convert, in order"
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

            {files.length > 1 ? (
              <RadioCards
                name="excel-output"
                legend="Output"
                value={output}
                onChange={setOutput}
                options={[
                  {
                    value: 'separate',
                    label: 'One workbook per PDF',
                    description: 'Delivered as a ZIP, keeping each document separate.',
                  },
                  {
                    value: 'combined',
                    label: 'One combined workbook',
                    description: 'Every page as a sheet, labelled by source file.',
                  },
                ]}
              />
            ) : null}

            <RadioCards
              name="sheet-mode"
              legend="Worksheets"
              value={options.sheetPerPage ? 'per-page' : 'combined'}
              onChange={(value) =>
                setOptions((c) => ({ ...c, sheetPerPage: value === 'per-page' }))
              }
              options={[
                {
                  value: 'per-page',
                  label: 'One sheet per page',
                  description: 'Keeps each page separate. Best when pages differ.',
                },
                {
                  value: 'combined',
                  label: 'One sheet per document',
                  description: 'Stacks every page. Best for a table that runs on.',
                },
              ]}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
                <input
                  type="checkbox"
                  checked={style.typeNumbers}
                  onChange={(event) =>
                    setStyle((c) => ({ ...c, typeNumbers: event.target.checked }))
                  }
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium">Numbers as numbers</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Keeps them looking identical, but lets you actually sum the column.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
                <input
                  type="checkbox"
                  checked={style.markHeader}
                  onChange={(event) =>
                    setStyle((c) => ({ ...c, markHeader: event.target.checked }))
                  }
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium">Mark the header row</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Bolds and freezes row 1 so it stays visible while scrolling.
                  </span>
                </span>
              </label>
            </div>

            <Field
              label={`Column sensitivity: ${options.columnGap}pt`}
              hint="How wide a gap starts a new column. Lower splits more aggressively; raise it if single values are being cut in half."
            >
              {({ id, describedBy }) => (
                <RangeInput
                  id={id}
                  aria-describedby={describedBy}
                  min={4}
                  max={40}
                  step={1}
                  value={options.columnGap}
                  onChange={(event) =>
                    setOptions((c) => ({ ...c, columnGap: Number(event.target.value) }))
                  }
                />
              )}
            </Field>

            <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
              A PDF has no idea what a table is — it stores glyphs at coordinates. Toolpit infers
              the grid by grouping text into rows and clustering columns by their left edges. That
              works well on machine-generated documents and less well on heavily designed layouts,
              so check the preview before trusting the numbers. Values arrive exactly as they were
              displayed — a figure shown as 1,200.00 still reads 1,200.00 — but typed as real
              numbers underneath, and columns are sized to their contents.
            </p>

            {isBusy ? <ProgressBar value={progress} label={progressLabel} /> : null}

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={run} disabled={isBusy}>
                Extract {files.length > 1 ? `${files.length} PDFs` : ''} to Excel
              </Button>
              <Button variant="ghost" onClick={reset} disabled={isBusy}>
                Clear
              </Button>
            </div>
          </>
        ) : null}
      </ToolSurface>

      {result ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-display text-heading">{result.filename}</p>
              <p className="text-sm text-muted">
                {formatBytes(result.blob.size)} · {result.detail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadBlob(result.blob, result.filename)}>Download</Button>
              {firstTable ? (
                <Button
                  variant="secondary"
                  onClick={async () =>
                    downloadBlob(
                      await writeCsv(firstTable),
                      `${stripExtension(result.filename)}.csv`,
                    )
                  }
                >
                  First sheet as CSV
                </Button>
              ) : null}
              <Button variant="ghost" onClick={reset}>
                Start over
              </Button>
            </div>
          </div>

          {emptyPages.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              No text layer on {emptyPages.join('; ')} — those pages are almost certainly scans,
              and produced nothing.
            </p>
          ) : null}

          {preview ? (
            <div className="mt-6">
              <ToolSectionHeading>Preview</ToolSectionHeading>
              <p className="mt-1 mb-3 text-xs text-muted">
                The first rows of {preview.name}, exactly as they will land in the spreadsheet.
              </p>
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {preview.rows.slice(0, 12).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-line last:border-0">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={`max-w-56 truncate px-2.5 py-1.5 ${
                              rowIndex === 0 ? 'bg-sunken font-medium' : ''
                            }`}
                            title={cell}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 12 ? (
                <p className="mt-2 text-xs text-muted">
                  …and {preview.rows.length - 12} more rows.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function noTextMessage(count: number): string {
  return count === 1
    ? 'No text could be found. If this is a scan, the pages are images — there is no text layer to pull a table out of.'
    : 'No text could be found in any of these PDFs. If they are scans, the pages are images — there is no text layer to pull a table out of.';
}
