'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, RadioCards } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { createZip, downloadBlob, type ZipEntry } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { toPdfBlob } from '@/lib/pdf/operations';
import { SPREADSHEET_TYPES, readWorkbook, type SheetTable } from '@/lib/sheets/runtime';
import { defaultSheetPdfOptions, tablesToPdf, type SheetPdfOptions } from '@/lib/sheets/toPdf';

type Loaded = {
  id: string;
  name: string;
  size: number;
  tables: SheetTable[];
};

type Output = 'combined' | 'separate';

let counter = 0;

/** Sheet selection is keyed per file, since two workbooks can share a name. */
const keyFor = (fileId: string, sheet: string) => `${fileId}::${sheet}`;

export default function ExcelToPdfTool() {
  const [files, setFiles] = useState<Loaded[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [output, setOutput] = useState<Output>('separate');
  const [options, setOptions] = useState<SheetPdfOptions>(defaultSheetPdfOptions);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState('Laying out the pages…');
  const [result, setResult] = useState<{ blob: Blob; filename: string; detail: string } | null>(
    null,
  );
  const [notes, setNotes] = useState<{ substitutions: number; bandedSheets: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const isBusy = progress !== null;
  const selectedCount = selected.size;

  async function add(incoming: File[]) {
    setError(null);
    setResult(null);
    setIsReading(true);

    const loaded: Loaded[] = [];
    const rejected: string[] = [];

    for (const file of incoming) {
      try {
        const tables = await readWorkbook(file);
        if (tables.length === 0) throw new Error('no readable rows');
        loaded.push({
          id: `sheet-${(counter += 1)}`,
          name: file.name,
          size: file.size,
          tables,
        });
      } catch {
        rejected.push(file.name);
      }
    }

    if (rejected.length > 0) {
      setError(
        rejected.length === 1
          ? `${rejected[0]} could not be read — is it a valid spreadsheet?`
          : `${rejected.length} files could not be read — are they valid spreadsheets?`,
      );
    }

    setFiles((current) => [...current, ...loaded]);
    setSelected((current) => {
      const next = new Set(current);
      for (const entry of loaded) {
        for (const table of entry.tables) next.add(keyFor(entry.id, table.name));
      }
      return next;
    });
    setIsReading(false);
  }

  function toggleSheet(fileId: string, sheet: string) {
    setSelected((current) => {
      const next = new Set(current);
      const key = keyFor(fileId, sheet);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setResult(null);
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((entry) => entry.id !== id));
    setSelected((current) => {
      const next = new Set(current);
      for (const key of next) if (key.startsWith(`${id}::`)) next.delete(key);
      return next;
    });
    setResult(null);
  }

  function chosenTables(entry: Loaded, prefix: boolean): SheetTable[] {
    return entry.tables
      .filter((table) => selected.has(keyFor(entry.id, table.name)))
      .map((table) => ({
        ...table,
        // Prefix only when sheets from several workbooks land in one PDF, so a
        // single-file conversion keeps its plain sheet names.
        name: prefix ? `${stripExtension(entry.name)} — ${table.name}` : table.name,
      }));
  }

  async function run() {
    if (files.length === 0) return;
    setError(null);
    setResult(null);
    setProgress(0);

    let substitutions = 0;
    const bandedSheets: string[] = [];

    try {
      if (output === 'combined') {
        setProgressLabel('Laying out the pages…');
        const tables = files.flatMap((entry) => chosenTables(entry, files.length > 1));
        if (tables.length === 0) throw new Error('Pick at least one sheet.');

        const built = await tablesToPdf(tables, options, (done, total) =>
          setProgress(total > 0 ? done / total : null),
        );
        substitutions = built.substitutions;
        bandedSheets.push(...built.bandedSheets);

        const blob = toPdfBlob(built.bytes);
        const filename =
          files.length === 1 ? `${stripExtension(files[0]!.name)}.pdf` : 'spreadsheets.pdf';
        setResult({
          blob,
          filename,
          detail: `${tables.length} sheet${tables.length === 1 ? '' : 's'} from ${files.length} file${files.length === 1 ? '' : 's'}`,
        });
      } else {
        const entries: ZipEntry[] = [];
        let converted = 0;

        for (const entry of files) {
          setProgressLabel(`Converting ${entry.name}…`);
          const tables = chosenTables(entry, false);
          if (tables.length === 0) continue;

          const built = await tablesToPdf(tables, options);
          substitutions += built.substitutions;
          bandedSheets.push(...built.bandedSheets);
          entries.push({
            name: `${stripExtension(entry.name)}.pdf`,
            data: new Uint8Array(built.bytes),
          });

          converted += 1;
          setProgress(converted / files.length);
        }

        if (entries.length === 0) throw new Error('Pick at least one sheet.');

        if (entries.length === 1) {
          const only = entries[0]!;
          setResult({
            blob: toPdfBlob(only.data),
            filename: only.name,
            detail: '1 file',
          });
        } else {
          setResult({
            blob: createZip(entries),
            filename: 'spreadsheets.zip',
            detail: `${entries.length} PDFs, zipped on your device`,
          });
        }
      }

      setNotes({ substitutions, bandedSheets: [...new Set(bandedSheets)] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build the PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    setFiles([]);
    setSelected(new Set());
    setResult(null);
    setNotes(null);
    setError(null);
  }

  if (result) {
    return (
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
            <Button variant="secondary" onClick={reset}>
              Start over
            </Button>
          </div>
        </div>

        {notes && (notes.substitutions > 0 || notes.bandedSheets.length > 0) ? (
          <div className="mt-5 flex flex-col gap-2 text-sm text-muted">
            {notes.bandedSheets.length > 0 ? (
              <p>
                {notes.bandedSheets.join(', ')} {notes.bandedSheets.length === 1 ? 'was' : 'were'}{' '}
                too wide for one page, so the columns are split across bands. The first column is
                repeated on each band so rows stay identifiable.
              </p>
            ) : null}
            {notes.substitutions > 0 ? (
              <p>
                {notes.substitutions} character{notes.substitutions === 1 ? '' : 's'} had no
                equivalent in the PDF font and {notes.substitutions === 1 ? 'was' : 'were'}{' '}
                approximated — arrows became <code className="font-mono">-&gt;</code>, tick marks
                became <code className="font-mono">Yes</code>, and anything with no near match
                became <code className="font-mono">?</code>. Your spreadsheets are untouched.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  const totalSheets = files.reduce((sum, entry) => sum + entry.tables.length, 0);

  return (
    <ToolSurface className="flex flex-col gap-6">
      <Dropzone
        onFiles={add}
        accept={SPREADSHEET_TYPES.join(',')}
        multiple
        label={files.length === 0 ? 'Add your spreadsheets' : 'Add more spreadsheets'}
        hint="XLSX, XLS, ODS or CSV — as many as you like. There is no file limit, because there is no server to pay for one."
        disabled={isBusy}
      />

      <ErrorMessage>{error}</ErrorMessage>
      {isReading ? <p className="text-sm text-muted">Reading workbooks…</p> : null}

      {files.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <ToolSectionHeading>Sheets to include</ToolSectionHeading>
              <p className="text-sm text-muted">
                {selectedCount} of {totalSheets} selected across {files.length} file
                {files.length === 1 ? '' : 's'}
              </p>
            </div>

            <ul className="flex flex-col gap-3">
              {files.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.name}</span>
                      <span className="block text-xs text-muted">
                        {formatBytes(entry.size)} · {entry.tables.length} sheet
                        {entry.tables.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFile(entry.id)}
                      disabled={isBusy}
                    >
                      Remove
                    </Button>
                  </div>

                  <ul className="mt-2 flex flex-wrap gap-2">
                    {entry.tables.map((table) => {
                      const key = keyFor(entry.id, table.name);
                      const on = selected.has(key);
                      return (
                        <li key={key}>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                              on ? 'border-accent bg-accent-soft' : 'border-line bg-sunken'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleSheet(entry.id, table.name)}
                              className="size-3.5 accent-accent"
                            />
                            <span className="font-medium">{table.name}</span>
                            <span className="text-muted">
                              {table.rows.length}×{table.rows[0]?.length ?? 0}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>

          {files.length > 1 ? (
            <RadioCards
              name="sheet-output"
              legend="Output"
              value={output}
              onChange={setOutput}
              options={[
                {
                  value: 'separate',
                  label: 'One PDF per file',
                  description: 'Delivered as a ZIP, keeping each workbook separate.',
                },
                {
                  value: 'combined',
                  label: 'One combined PDF',
                  description: 'Every sheet in a single document, labelled by source file.',
                },
              ]}
            />
          ) : null}

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

          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle
              label="Repeat header row"
              hint="Puts row 1 at the top of every page."
              checked={options.repeatHeader}
              onChange={(value) => setOptions((c) => ({ ...c, repeatHeader: value }))}
            />
            <Toggle
              label="Split wide sheets"
              hint="Bands columns across pages instead of shrinking them."
              checked={options.bandWideSheets}
              onChange={(value) => setOptions((c) => ({ ...c, bandWideSheets: value }))}
            />
            <Toggle
              label="Draw gridlines"
              hint="Rules between rows and columns."
              checked={options.gridlines}
              onChange={(value) => setOptions((c) => ({ ...c, gridlines: value }))}
            />
          </div>

          <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
            This produces a readable report of your data — cell values, aligned columns, repeated
            headers. It does not recreate fonts, colours, merged cells or charts, because a
            spreadsheet&rsquo;s appearance cannot be rebuilt from its values alone. Sheets too wide
            for one page are split across column bands rather than cropped or crushed, and
            characters the PDF font cannot encode are approximated.
          </p>

          {isBusy ? <ProgressBar value={progress} label={progressLabel} /> : null}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={run} disabled={isBusy || selectedCount === 0}>
              Convert {files.length > 1 ? `${files.length} files` : ''} to PDF
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

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
