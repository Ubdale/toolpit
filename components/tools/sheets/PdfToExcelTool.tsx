'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, RangeInput } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { usePdfFiles } from '@/components/tools/pdf/usePdfFiles';
import { defaultExtractOptions, pdfToTables, type ExtractOptions } from '@/lib/sheets/fromPdf';
import { writeCsv, writeWorkbook, type SheetTable } from '@/lib/sheets/runtime';

export default function PdfToExcelTool() {
  const { files, error, setError, isReading, add, remove, clear } = usePdfFiles(false);
  const [options, setOptions] = useState<ExtractOptions>(defaultExtractOptions);
  const [progress, setProgress] = useState<number | null>(null);
  const [tables, setTables] = useState<SheetTable[] | null>(null);
  const [emptyPages, setEmptyPages] = useState<number[]>([]);
  const [workbook, setWorkbook] = useState<Blob | null>(null);

  const file = files[0];
  const isBusy = progress !== null;

  async function run() {
    if (!file) return;
    setError(null);
    setTables(null);
    setWorkbook(null);
    setProgress(0);

    try {
      const extracted = await pdfToTables(file.bytes, options, (done, total) =>
        setProgress(total > 0 ? done / total : null),
      );
      if (extracted.tables.length === 0) {
        throw new Error(
          'No text could be found. If this is a scan, the pages are images — there is no text layer to pull a table out of.',
        );
      }
      setTables(extracted.tables);
      setEmptyPages(extracted.emptyPages);
      setWorkbook(await writeWorkbook(extracted.tables));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    clear();
    setTables(null);
    setWorkbook(null);
    setEmptyPages([]);
  }

  const base = file ? stripExtension(file.name) : 'extracted';

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!file ? (
          <Dropzone
            onFiles={add}
            accept="application/pdf,.pdf"
            label="Add a PDF"
            hint="Works on PDFs with real text — invoices, statements, reports, exports."
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
              <ToolSectionHeading>How to lay it out</ToolSectionHeading>

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
                    label: 'One combined sheet',
                    description: 'Stacks every page. Best for a table that runs on.',
                  },
                ]}
              />

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
            </div>

            <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
              A PDF has no idea what a table is — it stores glyphs at coordinates. Toolpit infers
              the grid by grouping text into rows and clustering columns by their left edges. That
              works well on machine-generated documents and less well on heavily designed layouts,
              so check the preview before trusting the numbers.
            </p>

            {isBusy ? <ProgressBar value={progress} label="Reading the pages…" /> : null}

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={run} disabled={isBusy}>
                {tables ? 'Extract again' : 'Extract to Excel'}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={isBusy}>
                Clear
              </Button>
            </div>
          </>
        ) : null}
      </ToolSurface>

      {tables && workbook ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">{base}.xlsx</p>
              <p className="text-sm text-muted">
                {formatBytes(workbook.size)} · {tables.length} sheet
                {tables.length === 1 ? '' : 's'} ·{' '}
                {tables.reduce((sum, table) => sum + table.rows.length, 0)} rows
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadBlob(workbook, `${base}.xlsx`)}>
                Download XLSX
              </Button>
              <Button
                variant="secondary"
                onClick={async () =>
                  downloadBlob(await writeCsv(tables[0]!), `${base}.csv`)
                }
              >
                Download CSV
              </Button>
            </div>
          </div>

          {emptyPages.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              Page{emptyPages.length === 1 ? '' : 's'} {emptyPages.join(', ')} had no text layer
              and produced nothing — those are almost certainly scans.
            </p>
          ) : null}

          <div className="mt-6">
            <ToolSectionHeading>Preview</ToolSectionHeading>
            <p className="mt-1 mb-3 text-xs text-muted">
              The first rows of {tables[0]!.name}, exactly as they will land in the spreadsheet.
            </p>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {tables[0]!.rows.slice(0, 12).map((row, rowIndex) => (
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
            {tables[0]!.rows.length > 12 ? (
              <p className="mt-2 text-xs text-muted">
                …and {tables[0]!.rows.length - 12} more rows.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
