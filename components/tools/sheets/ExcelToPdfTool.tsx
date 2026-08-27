'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, RadioCards } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { formatBytes, stripExtension } from '@/lib/format';
import { toPdfBlob } from '@/lib/pdf/operations';
import { SPREADSHEET_TYPES, readWorkbook, type SheetTable } from '@/lib/sheets/runtime';
import { defaultSheetPdfOptions, tablesToPdf, type SheetPdfOptions } from '@/lib/sheets/toPdf';

export default function ExcelToPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [tables, setTables] = useState<SheetTable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<SheetPdfOptions>(defaultSheetPdfOptions);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const isBusy = progress !== null;

  async function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    setError(null);
    setResult(null);
    setIsReading(true);

    try {
      const sheets = await readWorkbook(picked);
      if (sheets.length === 0) throw new Error('That workbook has no readable rows.');
      setFile(picked);
      setTables(sheets);
      setSelected(new Set(sheets.map((sheet) => sheet.name)));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not read that spreadsheet: ${cause.message}`
          : 'Could not read that spreadsheet.',
      );
    } finally {
      setIsReading(false);
    }
  }

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setResult(null);
  }

  async function run() {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const chosen = tables.filter((table) => selected.has(table.name));
      if (chosen.length === 0) throw new Error('Pick at least one sheet.');
      const bytes = await tablesToPdf(chosen, options, (done, total) =>
        setProgress(total > 0 ? done / total : null),
      );
      setResult(toPdfBlob(bytes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build the PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    setFile(null);
    setTables([]);
    setSelected(new Set());
    setResult(null);
    setError(null);
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}.pdf`;
    const rows = tables
      .filter((table) => selected.has(table.name))
      .reduce((sum, table) => sum + table.rows.length, 0);

    return (
      <ResultPanel
        filename={filename}
        size={result.size}
        detail={`${selected.size} sheet${selected.size === 1 ? '' : 's'} · ${rows} rows`}
        target={{ blob: result, filename }}
        onReset={reset}
      />
    );
  }

  return (
    <ToolSurface className="flex flex-col gap-6">
      {!file ? (
        <Dropzone
          onFiles={addFile}
          accept={SPREADSHEET_TYPES.join(',')}
          label="Add a spreadsheet"
          hint="XLSX, XLS, ODS or CSV. Read straight into this tab, never uploaded."
        />
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-sm text-muted">
              {formatBytes(file.size)} · {tables.length} sheet{tables.length === 1 ? '' : 's'}
            </p>
          </div>
          <Button variant="ghost" onClick={reset} disabled={isBusy}>
            Clear
          </Button>
        </div>
      )}

      <ErrorMessage>{error}</ErrorMessage>
      {isReading ? <p className="text-sm text-muted">Reading the workbook…</p> : null}

      {file && tables.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            <ToolSectionHeading>Sheets to include</ToolSectionHeading>
            <ul className="flex flex-col gap-2">
              {tables.map((table) => (
                <li key={table.name}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                    <input
                      type="checkbox"
                      checked={selected.has(table.name)}
                      onChange={() => toggle(table.name)}
                      className="size-4 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{table.name}</span>
                      <span className="block text-xs text-muted">
                        {table.rows.length} rows × {table.rows[0]?.length ?? 0} columns
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <RadioCards
            name="sheet-page-size"
            legend="Page size"
            value={options.pageSize}
            onChange={(value) => setOptions((c) => ({ ...c, pageSize: value }))}
            options={[
              { value: 'a4', label: 'A4', description: 'The international standard.' },
              { value: 'letter', label: 'US Letter', description: 'The North American standard.' },
            ]}
          />

          <RadioCards
            name="sheet-orientation"
            legend="Orientation"
            value={options.landscape ? 'landscape' : 'portrait'}
            onChange={(value) => setOptions((c) => ({ ...c, landscape: value === 'landscape' }))}
            options={[
              {
                value: 'landscape',
                label: 'Landscape',
                description: 'More room for columns. Best for wide sheets.',
              },
              { value: 'portrait', label: 'Portrait', description: 'Best for narrow sheets.' },
            ]}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
              <input
                type="checkbox"
                checked={options.repeatHeader}
                onChange={(event) =>
                  setOptions((c) => ({ ...c, repeatHeader: event.target.checked }))
                }
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">Repeat header row</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Puts row 1 at the top of every page.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
              <input
                type="checkbox"
                checked={options.gridlines}
                onChange={(event) => setOptions((c) => ({ ...c, gridlines: event.target.checked }))}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">Draw gridlines</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Rules between rows and columns.
                </span>
              </span>
            </label>
          </div>

          <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
            This produces a readable report of your data — cell values, aligned columns, repeated
            headers. It does not recreate fonts, colours, merged cells or charts, because a
            spreadsheet&rsquo;s appearance cannot be rebuilt from its values alone. Sheets wider
            than the page are scaled down to fit rather than cropped.
          </p>

          {isBusy ? <ProgressBar value={progress} label="Laying out the pages…" /> : null}

          <Button size="lg" onClick={run} disabled={isBusy || selected.size === 0}>
            Convert to PDF
          </Button>
        </>
      ) : null}
    </ToolSurface>
  );
}
