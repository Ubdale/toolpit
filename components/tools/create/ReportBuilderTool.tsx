'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FilterBuilder } from '@/components/builder/FilterBuilder';
import { PreviewPane, TemplateBar, useLivePreview } from '@/components/builder/PreviewPane';
import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Slider } from '@/components/ui/Slider';
import { useToast } from '@/components/ui/Toast';
import { datasetFromFile, sampleDataset } from '@/lib/builder/dataset';
import { buildReport, reportToCsv, reportToXlsx, type ReportConfig } from '@/lib/builder/report';
import {
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  saveTemplate,
} from '@/lib/builder/templates';
import {
  AGGREGATIONS,
  DEFAULT_FORMAT,
  emptyQuery,
  nextId,
  type Aggregation,
  type CellFormat,
  type ConditionalRule,
  type Dataset,
} from '@/lib/builder/types';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';

/**
 * The Report Builder.
 *
 * Same query vocabulary as the Chart Builder — filters, sorting, aggregation,
 * top-N and saved templates are the same types running through the same engine
 * — with the table-specific parts on top: columns, pivoting, grouping with
 * subtotals, cell formatting and conditional formatting.
 *
 * The preview is the report, and the Excel export is rendered from the same
 * structure, so the workbook that opens is the table that was on screen.
 */

function initialConfig(dataset: Dataset): ReportConfig {
  const text = dataset.fields.filter((f) => f.type === 'text');
  const numeric = dataset.fields.filter((f) => f.type === 'number');

  return {
    columns: dataset.fields.slice(0, 8).map((f) => f.key),
    groupBy: [],
    pivotBy: null,
    measures: numeric[0] ? [{ id: nextId('m'), field: numeric[0].key, aggregation: 'sum' }] : [],
    query: emptyQuery(),
    formats: Object.fromEntries(
      numeric.map((f) => [f.key, { ...DEFAULT_FORMAT, decimals: 0 } as CellFormat]),
    ),
    conditional: [],
    widths: {},
    pinned: text[0] ? [text[0].key] : [],
    showGrandTotal: true,
    showSubtotals: true,
    title: 'Report',
    footer: '',
    pageSize: 50,
  };
}

export default function ReportBuilderTool() {
  const [dataset, setDataset] = useState<Dataset>(() => sampleDataset());
  const [config, setConfig] = useState<ReportConfig>(() => initialConfig(sampleDataset()));
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [templates, setTemplates] = useState<{ id: string; name: string; savedAt: string }[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toast = useToast();

  useEffect(() => {
    setTemplates(
      listTemplates<ReportConfig>('report').map(({ id, name, savedAt }) => ({ id, name, savedAt })),
    );
  }, []);

  const patch = useCallback((changes: Partial<ReportConfig>) => {
    setConfig((current) => ({ ...current, ...changes }));
    setPage(0);
  }, []);

  // See the note in the chart builder: a literal here never settles.
  const previewInput = useMemo(() => ({ config, dataset }), [config, dataset]);

  const report = useLivePreview({
    config: previewInput,
    validate: ({ config: c }) => {
      if (c.columns.length === 0 && !c.pivotBy) return 'Pick at least one column to show.';
      if (c.pivotBy && c.measures.length === 0) return 'A pivot needs a measure to aggregate.';
      return null;
    },
    compute: ({ config: c, dataset: d }) => buildReport(d, c),
  });

  const pageRows = useMemo(() => {
    if (!report.value) return [];
    const start = page * config.pageSize;
    return report.value.rows.slice(start, start + config.pageSize);
  }, [report.value, page, config.pageSize]);

  const pageCount = report.value ? Math.ceil(report.value.rows.length / config.pageSize) : 0;

  async function loadFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    try {
      const next = await datasetFromFile(file);
      setDataset(next);
      setConfig(initialConfig(next));
      toast.show(`Loaded ${(next.totalRows ?? next.rows.length).toLocaleString()} rows.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be read.');
    }
  }

  async function exportXlsx() {
    if (!report.value) return;
    setBusy(true);
    try {
      const blob = await reportToXlsx(report.value, config, {
        title: config.title || 'Report',
        generatedAt: new Date(),
      });
      downloadBlob(blob, `${(config.title || 'report').replace(/\s+/g, '-').toLowerCase()}.xlsx`);
      toast.show('Workbook saved — it never left your device.', 'vault');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The workbook could not be written.');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!report.value) return;
    downloadBlob(new Blob([reportToCsv(report.value)], { type: 'text/csv' }), 'report.csv');
    toast.show('Saved — it never left your device.', 'vault');
  }

  const numericFields = dataset.fields.filter((f) => f.type === 'number');
  const textFields = dataset.fields.filter((f) => f.type !== 'number');

  return (
    <div className="flex flex-col gap-6">
      <PreviewPane
        title="Live preview"
        stale={report.stale}
        problem={report.problem}
        minHeight={380}
        note={
          report.value
            ? `${report.value.totalRows.toLocaleString()} rows matched${
                dataset.sampled ? ` (previewing the first ${dataset.rows.length.toLocaleString()})` : ''
              }`
            : undefined
        }
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              CSV
            </Button>
            <Button size="sm" onClick={exportXlsx} disabled={busy}>
              <Icon name="download" size={16} />
              {busy ? 'Writing…' : 'Excel'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Icon name="print" size={16} />
              Print
            </Button>
          </>
        }
      >
        {report.value ? (
          <>
            {config.title ? (
              <div className="mb-3">
                <h3 className="font-display text-heading">{config.title}</h3>
                <p className="text-xs text-muted">Generated {new Date().toLocaleString()}</p>
              </div>
            ) : null}

            <div className="overflow-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-sunken">
                    {report.value.columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          'whitespace-nowrap border-b border-line px-3 py-2 font-medium',
                          column.numeric ? 'text-right' : 'text-left',
                          config.pinned.includes(column.key) && 'sticky left-0 bg-sunken',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const existing = config.query.sort.find((s) => s.field === column.key);
                            const direction =
                              existing?.direction === 'asc' ? ('desc' as const) : ('asc' as const);
                            patch({
                              query: {
                                ...config.query,
                                sort: [{ field: column.key, direction }],
                              },
                            });
                          }}
                          className="inline-flex items-center gap-1 hover:text-accent"
                        >
                          {column.label}
                          {config.query.sort[0]?.field === column.key ? (
                            <Icon
                              name={config.query.sort[0].direction === 'asc' ? 'arrowUp' : 'arrowDown'}
                              size={14}
                            />
                          ) : null}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => {
                    if (row.kind === 'group') {
                      return (
                        <tr key={`g-${index}`} className="bg-sunken/70">
                          <td
                            colSpan={report.value!.columns.length}
                            className="border-b border-line px-3 py-1.5 text-xs font-semibold"
                          >
                            {row.label}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={index}
                        className={cn(
                          'border-b border-line last:border-0',
                          row.kind === 'subtotal' && 'bg-sunken/50 font-medium',
                          row.kind === 'total' && 'bg-sunken font-semibold',
                        )}
                      >
                        {report.value!.columns.map((column, cellIndex) => {
                          const cell = row.cells[cellIndex];
                          const isLabel =
                            cellIndex === 0 && (row.kind === 'subtotal' || row.kind === 'total');

                          return (
                            <td
                              key={column.key}
                              className={cn(
                                'relative whitespace-nowrap px-3 py-1.5',
                                column.numeric ? 'text-right tabular-nums' : 'text-left',
                                config.pinned.includes(column.key) && 'sticky left-0 bg-surface',
                              )}
                              style={{
                                background: cell?.background,
                                paddingLeft: row.depth ? 12 + row.depth * 14 : undefined,
                              }}
                            >
                              {cell?.bar !== undefined ? (
                                <span
                                  aria-hidden="true"
                                  className="absolute inset-y-1 left-1 rounded bg-accent/20"
                                  style={{ width: `calc(${(cell.bar * 100).toFixed(1)}% - 8px)` }}
                                />
                              ) : null}
                              <span className="relative inline-flex items-center gap-1">
                                {cell?.icon ? (
                                  <Icon
                                    name={
                                      cell.icon === 'up'
                                        ? 'trendUp'
                                        : cell.icon === 'down'
                                          ? 'trendDown'
                                          : 'trendFlat'
                                    }
                                    size={14}
                                    className={
                                      cell.icon === 'up'
                                        ? 'text-vault'
                                        : cell.icon === 'down'
                                          ? 'text-danger'
                                          : 'text-muted'
                                    }
                                  />
                                ) : null}
                                {isLabel ? row.label : cell?.display}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <Icon name="chevronLeft" size={16} />
                  Previous
                </Button>
                <span className="text-muted tabular-nums">
                  Page {page + 1} of {pageCount}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <Icon name="chevronRight" size={16} />
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </PreviewPane>

      <div className="grid gap-6 xl:grid-cols-3">
        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Data</ToolSectionHeading>

          <div className="rounded-xl border border-line bg-sunken px-3 py-2.5 text-sm">
            <p className="font-medium">{dataset.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {(dataset.totalRows ?? dataset.rows.length).toLocaleString()} rows ·{' '}
              {dataset.fields.length} columns
            </p>
          </div>

          <Dropzone
            onFiles={loadFile}
            accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv"
            label="Drop a CSV or Excel file"
            hint="Read in this tab. Nothing is uploaded."
          />
          <ErrorMessage>{error}</ErrorMessage>

          <input
            aria-label="Global search"
            placeholder="Search every column…"
            value={config.query.search ?? ''}
            onChange={(event) => patch({ query: { ...config.query, search: event.target.value } })}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
          />

          <div className="border-t border-line pt-4">
            <ToolSectionHeading>Filters</ToolSectionHeading>
          </div>
          <FilterBuilder
            fields={dataset.fields}
            value={config.query.filters}
            onChange={(filters) => patch({ query: { ...config.query, filters } })}
          />
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Columns &amp; grouping</ToolSectionHeading>

          <Dropdown
            label="Columns"
            multiple
            searchable
            value={config.columns}
            onChange={(value) => patch({ columns: value })}
            options={dataset.fields.map((f) => ({ value: f.key, label: f.label, description: f.type }))}
            hint="Tick in the order you want them shown."
          />

          <Dropdown
            label="Group rows by"
            clearable
            value={config.groupBy[0] ?? null}
            placeholder="No grouping"
            onChange={(value) => patch({ groupBy: value ? [value] : [] })}
            options={textFields.map((f) => ({ value: f.key, label: f.label }))}
          />

          <Dropdown
            label="Pivot: columns from"
            clearable
            value={config.pivotBy}
            placeholder="No pivot"
            onChange={(value) => patch({ pivotBy: value })}
            options={textFields.map((f) => ({ value: f.key, label: f.label }))}
            hint={config.pivotBy ? 'Rows come from the grouping field above.' : undefined}
          />

          {config.pivotBy && config.measures[0] ? (
            <div className="flex flex-wrap gap-2">
              <Dropdown
                className="min-w-32 flex-1"
                label="Value"
                value={config.measures[0].field}
                onChange={(value) =>
                  value && patch({ measures: [{ ...config.measures[0]!, field: value }] })
                }
                options={numericFields.map((f) => ({ value: f.key, label: f.label }))}
              />
              <Dropdown
                className="min-w-32 flex-1"
                label="Aggregation"
                value={config.measures[0].aggregation}
                onChange={(value) =>
                  value &&
                  patch({ measures: [{ ...config.measures[0]!, aggregation: value as Aggregation }] })
                }
                options={AGGREGATIONS.map((a) => ({ value: a.value, label: a.label }))}
              />
            </div>
          ) : null}

          <Dropdown
            label="Freeze columns"
            multiple
            value={config.pinned}
            onChange={(value) => patch({ pinned: value })}
            options={dataset.fields.map((f) => ({ value: f.key, label: f.label }))}
          />

          <div className="flex flex-col gap-2.5">
            <Toggle
              label="Subtotals per group"
              checked={config.showSubtotals}
              onChange={(v) => patch({ showSubtotals: v })}
            />
            <Toggle
              label="Grand total"
              checked={config.showGrandTotal}
              onChange={(v) => patch({ showGrandTotal: v })}
            />
          </div>

          <Slider
            label="Rows per page"
            value={config.pageSize}
            min={10}
            max={500}
            step={10}
            editable
            onInput={(value) => patch({ pageSize: value as number })}
            onChange={(value) => patch({ pageSize: value as number })}
          />
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Formatting</ToolSectionHeading>

          <input
            aria-label="Report title"
            placeholder="Report title"
            value={config.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
          />

          {numericFields.length > 0 ? (
            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium">Number columns</span>
              {numericFields
                .filter((f) => config.columns.includes(f.key))
                .map((field) => {
                  const format = config.formats[field.key] ?? DEFAULT_FORMAT;
                  return (
                    <div key={field.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2">
                      <span className="w-full text-xs font-medium">{field.label}</span>
                      <Dropdown
                        className="min-w-28 flex-1"
                        value={format.format}
                        onChange={(value) =>
                          value &&
                          patch({
                            formats: {
                              ...config.formats,
                              [field.key]: { ...format, format: value as CellFormat['format'] },
                            },
                          })
                        }
                        options={[
                          { value: 'plain', label: 'Number' },
                          { value: 'compact', label: 'Compact' },
                          { value: 'currency', label: 'Currency' },
                          { value: 'percent', label: 'Percent' },
                          { value: 'bytes', label: 'Bytes' },
                        ]}
                      />
                      <Dropdown
                        className="w-24"
                        value={String(format.decimals ?? 0)}
                        onChange={(value) =>
                          value &&
                          patch({
                            formats: {
                              ...config.formats,
                              [field.key]: { ...format, decimals: Number(value) },
                            },
                          })
                        }
                        options={['0', '1', '2', '3'].map((d) => ({ value: d, label: `${d} dp` }))}
                      />
                    </div>
                  );
                })}
            </div>
          ) : null}

          <div className="border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Conditional formatting</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={numericFields.length === 0}
                onClick={() =>
                  patch({
                    conditional: [
                      ...config.conditional,
                      {
                        id: nextId('cf'),
                        field: numericFields[0]!.key,
                        kind: 'dataBar',
                      } as ConditionalRule,
                    ],
                  })
                }
              >
                <Icon name="add" size={16} />
                Rule
              </Button>
            </div>
          </div>

          {config.conditional.map((rule, index) => (
            <div key={rule.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2">
              <Dropdown
                className="min-w-28 flex-1"
                value={rule.field}
                onChange={(value) =>
                  value &&
                  patch({
                    conditional: config.conditional.map((r, i) =>
                      i === index ? { ...r, field: value } : r,
                    ),
                  })
                }
                options={numericFields.map((f) => ({ value: f.key, label: f.label }))}
              />
              <Dropdown
                className="min-w-32"
                value={rule.kind}
                onChange={(value) =>
                  value &&
                  patch({
                    conditional: config.conditional.map((r, i) =>
                      i === index
                        ? {
                            ...r,
                            kind: value as ConditionalRule['kind'],
                            scale:
                              value === 'colorScale'
                                ? (['#fdf0e8', '#f0a273', '#d1541f'] as [string, string, string])
                                : undefined,
                          }
                        : r,
                    ),
                  })
                }
                options={[
                  { value: 'dataBar', label: 'Data bar' },
                  { value: 'colorScale', label: 'Colour scale' },
                  { value: 'iconSet', label: 'Icon set' },
                  { value: 'cell', label: 'Highlight rule' },
                ]}
              />
              <button
                type="button"
                aria-label="Remove rule"
                onClick={() =>
                  patch({ conditional: config.conditional.filter((_, i) => i !== index) })
                }
                className="mb-1.5 rounded p-1 text-muted hover:text-danger"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </ToolSurface>
      </div>

      <ToolSurface className="flex flex-col gap-4">
        <ToolSectionHeading>Saved reports</ToolSectionHeading>
        <TemplateBar
          templates={templates}
          activeId={activeTemplate}
          onSave={(name) => {
            const saved = saveTemplate<ReportConfig>(
              'report',
              name || config.title,
              config,
              activeTemplate ?? undefined,
            );
            setActiveTemplate(saved.id);
            setTemplates(
              listTemplates<ReportConfig>('report').map(({ id, name: n, savedAt }) => ({ id, name: n, savedAt })),
            );
            toast.show('Template saved in this browser.');
          }}
          onLoad={(id) => {
            const template = getTemplate<ReportConfig>(id);
            if (!template) return;
            setConfig(template.config);
            setActiveTemplate(id);
            toast.show(`Loaded “${template.name}”.`);
          }}
          onDuplicate={() => {
            if (!activeTemplate) return;
            duplicateTemplate<ReportConfig>(activeTemplate);
            setTemplates(
              listTemplates<ReportConfig>('report').map(({ id, name, savedAt }) => ({ id, name, savedAt })),
            );
          }}
          onDelete={() => {
            if (!activeTemplate) return;
            deleteTemplate(activeTemplate);
            setActiveTemplate(null);
            setTemplates(
              listTemplates<ReportConfig>('report').map(({ id, name, savedAt }) => ({ id, name, savedAt })),
            );
          }}
        />
      </ToolSurface>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-accent"
      />
      {label}
    </label>
  );
}
