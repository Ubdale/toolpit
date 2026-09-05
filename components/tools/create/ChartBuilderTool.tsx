'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FilterBuilder } from '@/components/builder/FilterBuilder';
import { PreviewPane, TemplateBar, useLivePreview } from '@/components/builder/PreviewPane';
import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Chart, type ChartSpec as WrapperSpec } from '@/components/ui/Chart';
import { Toggle } from '@/components/ui/Choice';
import { Dropdown } from '@/components/ui/Dropdown';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Slider } from '@/components/ui/Slider';
import { useToast } from '@/components/ui/Toast';
import {
  CHART_KINDS,
  isCircularKind,
  PALETTE_OPTIONS,
  type ChartKind,
  type NamedPalette,
  type NumberFormat,
} from '@/lib/chart/apex';
import { datasetFromFile, sampleDataset } from '@/lib/builder/dataset';
import { groupBy, applyTopN, runQuery } from '@/lib/builder/query';
import { deleteTemplate, duplicateTemplate, getTemplate, listTemplates, saveTemplate } from '@/lib/builder/templates';
import {
  AGGREGATIONS,
  emptyQuery,
  measureLabel,
  nextId,
  type Aggregation,
  type Dataset,
  type Measure,
  type QueryConfig,
} from '@/lib/builder/types';
import { downloadBlob } from '@/lib/download';

/**
 * The Chart Builder.
 *
 * A chart is described by three things: which rows (the query), what to measure
 * (the mapping), and how it should look (the styling). Those are the three
 * panels, and the same query vocabulary drives the Report Builder — so a filter
 * or a top-N learned here means the same thing there.
 *
 * The preview is the chart. There is no preview button, and switching chart
 * type keeps the mapping wherever the new type can use it.
 */

export type ChartBuilderConfig = {
  kind: ChartKind;
  dimension: string | null;
  splitBy: string | null;
  measures: Measure[];
  query: QueryConfig;
  palette: NamedPalette;
  legend: boolean;
  dataLabels: boolean;
  grid: boolean;
  stacked: boolean;
  title: string;
  subtitle: string;
  xTitle: string;
  yTitle: string;
  format: NumberFormat;
  currency: string;
  decimals: number;
  height: number;
  labelRotation: number;
  target: number | null;
};

function initialConfig(dataset: Dataset): ChartBuilderConfig {
  const dimension = dataset.fields.find((f) => f.type === 'text')?.key ?? dataset.fields[0]?.key ?? null;
  const numeric = dataset.fields.find((f) => f.type === 'number');

  return {
    kind: 'column',
    dimension,
    splitBy: null,
    measures: numeric ? [{ id: nextId('m'), field: numeric.key, aggregation: 'sum' }] : [],
    query: emptyQuery(),
    palette: 'categorical',
    legend: true,
    dataLabels: false,
    grid: true,
    stacked: false,
    title: '',
    subtitle: '',
    xTitle: '',
    yTitle: '',
    format: 'compact',
    currency: 'USD',
    decimals: 0,
    height: 380,
    labelRotation: 0,
    target: null,
  };
}

export default function ChartBuilderTool() {
  const [dataset, setDataset] = useState<Dataset>(() => sampleDataset());
  const [config, setConfig] = useState<ChartBuilderConfig>(() => initialConfig(sampleDataset()));
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; savedAt: string }[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ category: string; series: string; rows: number } | null>(null);

  const toast = useToast();

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setTemplates(listTemplates<ChartBuilderConfig>('chart').map(({ id, name, savedAt }) => ({ id, name, savedAt })));
  }, []);

  const patch = useCallback((changes: Partial<ChartBuilderConfig>) => {
    setConfig((current) => ({ ...current, ...changes }));
  }, []);

  // Memoised: this object is the hook's dependency, so a fresh literal each
  // render would restart the debounce forever and the preview would never
  // settle.
  const previewInput = useMemo(() => ({ config, dataset }), [config, dataset]);

  // ------------------------------------------------------------- the query
  const computed = useLivePreview({
    config: previewInput,
    validate: ({ config: c }) => {
      if (c.measures.length === 0) return 'Add at least one measure to plot.';
      if (!c.dimension) return 'Choose a field for the category axis.';
      return null;
    },
    compute: ({ config: c, dataset: d }) => {
      const rows = runQuery(d, c.query);
      const dimensions = [c.dimension!, ...(c.splitBy ? [c.splitBy] : [])];
      const grouped = applyTopN(groupBy(rows, dimensions, c.measures), c.query, c.measures);

      if (!c.splitBy) {
        return {
          categories: grouped.map((g) => g.keys[0] ?? ''),
          series: c.measures.map((m) => ({
            name: measureLabel(m, d.fields),
            data: grouped.map((g) => g.values[m.id] ?? 0),
          })),
          rowCount: rows.length,
          groups: grouped,
        };
      }

      // Splitting turns one measure into one series per split value.
      const measure = c.measures[0]!;
      const categories = [...new Set(grouped.map((g) => g.keys[0] ?? ''))];
      const splits = [...new Set(grouped.map((g) => g.keys[1] ?? ''))];

      return {
        categories,
        series: splits.map((split) => ({
          name: split || '—',
          data: categories.map((category) => {
            const match = grouped.find((g) => g.keys[0] === category && g.keys[1] === split);
            return match?.values[measure.id] ?? 0;
          }),
        })),
        rowCount: rows.length,
        groups: grouped,
      };
    },
  });

  // ------------------------------------------------------- the chart spec
  const spec: WrapperSpec | null = useMemo(() => {
    if (!computed.value) return null;
    return {
      kind: config.kind,
      series: computed.value.series,
      categories: computed.value.categories,
      theme,
      palette: config.palette,
      title: config.title || undefined,
      subtitle: config.subtitle || undefined,
      xTitle: config.xTitle || undefined,
      yTitle: config.yTitle || undefined,
      height: config.height,
      legend: { show: config.legend },
      dataLabels: config.dataLabels,
      grid: config.grid,
      labelRotation: config.labelRotation,
      format: { format: config.format, currency: config.currency, decimals: config.decimals },
      annotations:
        config.target === null
          ? undefined
          : [{ kind: 'yLine' as const, value: config.target, label: `Target ${config.target}` }],
    };
  }, [computed.value, config, theme]);

  // ----------------------------------------------------------- data intake
  async function loadFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    try {
      const next = await datasetFromFile(file);
      setDataset(next);
      setConfig(initialConfig(next));
      toast.show(`Loaded ${next.totalRows?.toLocaleString() ?? next.rows.length} rows.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be read.');
    }
  }

  // ------------------------------------------------------------- exports
  function exportCsv() {
    if (!computed.value) return;
    const header = ['Category', ...computed.value.series.map((s) => s.name)];
    const lines = [header.join(',')];
    for (const [index, category] of computed.value.categories.entries()) {
      lines.push(
        [
          `"${String(category).replace(/"/g, '""')}"`,
          ...computed.value.series.map((s) => String((s.data as number[])[index] ?? '')),
        ].join(','),
      );
    }
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'chart-data.csv');
    toast.show('Data saved — it never left your device.', 'vault');
  }

  async function exportXlsx() {
    if (!computed.value) return;
    const ExcelJS = await import('exceljs');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Chart data');

    sheet.addRow(['Category', ...computed.value.series.map((s) => s.name)]);
    sheet.getRow(1).font = { bold: true };
    for (const [index, category] of computed.value.categories.entries()) {
      sheet.addRow([category, ...computed.value.series.map((s) => (s.data as number[])[index] ?? null)]);
    }
    sheet.columns.forEach((column) => {
      column.width = 18;
    });

    const buffer = await book.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'chart-data.xlsx',
    );
    toast.show('Workbook saved — it never left your device.', 'vault');
  }

  function exportImage() {
    // ApexCharts owns the rendered SVG, and its own toolbar is the reliable
    // path to a PNG of exactly what is on screen.
    const button = document.querySelector<HTMLElement>('.apexcharts-menu-icon');
    if (button) button.click();
    else toast.show('Use the chart toolbar to export an image.');
  }

  // ----------------------------------------------------------- templates
  function onSave(name: string) {
    const saved = saveTemplate<ChartBuilderConfig>('chart', name || config.title || 'Chart', config, activeTemplate ?? undefined);
    setActiveTemplate(saved.id);
    setTemplates(listTemplates<ChartBuilderConfig>('chart').map(({ id, name: n, savedAt }) => ({ id, name: n, savedAt })));
    toast.show('Template saved in this browser.');
  }

  const numericFields = dataset.fields.filter((f) => f.type === 'number');
  const kindMeta = CHART_KINDS.find((k) => k.kind === config.kind);

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------- preview */}
      <PreviewPane
        title="Live preview"
        stale={computed.stale}
        problem={computed.problem}
        note={
          dataset.sampled
            ? `Previewing the first ${dataset.rows.length.toLocaleString()} of ${dataset.totalRows?.toLocaleString()} rows.`
            : computed.value
              ? `${computed.value.rowCount.toLocaleString()} rows matched · ${computed.value.categories.length} categories`
              : undefined
        }
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={exportImage}>
              <Icon name="download" size={16} />
              Image
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={exportXlsx}>
              Excel
            </Button>
          </>
        }
      >
        {spec ? (
          <Chart
            spec={spec}
            onPointClick={(point) => {
              const group = computed.value?.groups.find((g) => g.keys[0] === String(point.category));
              setDrill({
                category: String(point.category),
                series: point.series,
                rows: group?.rows.length ?? 0,
              });
            }}
          />
        ) : null}

        {drill ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sunken px-3 py-2 text-sm">
            <Icon name="filter" size={16} className="text-accent" />
            <span>
              <strong>{drill.category}</strong> · {drill.series} — {drill.rows.toLocaleString()}{' '}
              underlying row{drill.rows === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setDrill(null)}
              className="ml-auto text-xs text-muted hover:text-text"
            >
              Clear
            </button>
          </div>
        ) : null}
      </PreviewPane>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ------------------------------------------------------ data */}
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

          <div className="border-t border-line pt-4">
            <ToolSectionHeading>Filters</ToolSectionHeading>
          </div>
          <FilterBuilder
            fields={dataset.fields}
            value={config.query.filters}
            onChange={(filters) => patch({ query: { ...config.query, filters } })}
          />

          <Slider
            label="Top N categories"
            value={config.query.topN.count}
            min={3}
            max={50}
            step={1}
            editable
            hint={config.query.topN.enabled ? undefined : 'Turn on to keep only the biggest categories.'}
            onInput={(value) =>
              patch({ query: { ...config.query, topN: { ...config.query.topN, count: value as number } } })
            }
            onChange={(value) =>
              patch({ query: { ...config.query, topN: { ...config.query.topN, count: value as number } } })
            }
          />
          <Toggle
            label="Limit to the top N"
            checked={config.query.topN.enabled}
            onChange={(enabled) =>
              patch({ query: { ...config.query, topN: { ...config.query.topN, enabled } } })
            }
          />
        </ToolSurface>

        {/* --------------------------------------------------- mapping */}
        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Chart</ToolSectionHeading>

          <Dropdown
            label="Type"
            searchable
            value={config.kind}
            onChange={(value) => value && patch({ kind: value as ChartKind })}
            options={CHART_KINDS.map((meta) => ({
              value: meta.kind,
              label: meta.label,
              description: meta.description,
              group: meta.group,
            }))}
          />

          {kindMeta ? <p className="-mt-2 text-xs text-muted">{kindMeta.description}</p> : null}

          <Dropdown
            label={isCircularKind(config.kind) ? 'Slices' : 'Category axis'}
            searchable={dataset.fields.length > 8}
            value={config.dimension}
            onChange={(value) => patch({ dimension: value })}
            options={dataset.fields.map((f) => ({ value: f.key, label: f.label, description: f.type }))}
          />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Measures</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={numericFields.length === 0}
                onClick={() =>
                  patch({
                    measures: [
                      ...config.measures,
                      { id: nextId('m'), field: numericFields[0]!.key, aggregation: 'sum' },
                    ],
                  })
                }
              >
                <Icon name="add" size={16} />
                Add
              </Button>
            </div>

            {config.measures.map((measure, index) => (
              <div key={measure.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2">
                <Dropdown
                  className="min-w-32 flex-1"
                  value={measure.field}
                  onChange={(value) =>
                    value &&
                    patch({
                      measures: config.measures.map((m, i) =>
                        i === index ? { ...m, field: value } : m,
                      ),
                    })
                  }
                  options={dataset.fields.map((f) => ({ value: f.key, label: f.label }))}
                />
                <Dropdown
                  className="min-w-32"
                  value={measure.aggregation}
                  onChange={(value) =>
                    value &&
                    patch({
                      measures: config.measures.map((m, i) =>
                        i === index ? { ...m, aggregation: value as Aggregation } : m,
                      ),
                    })
                  }
                  options={AGGREGATIONS.map((a) => ({
                    value: a.value,
                    label: a.label,
                    description: a.description,
                  }))}
                />
                <button
                  type="button"
                  aria-label="Remove this measure"
                  onClick={() => patch({ measures: config.measures.filter((_, i) => i !== index) })}
                  className="mb-1.5 rounded p-1 text-muted hover:text-danger"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>

          <Dropdown
            label="Split into series by"
            clearable
            value={config.splitBy}
            placeholder="Don't split"
            onChange={(value) => patch({ splitBy: value })}
            options={dataset.fields
              .filter((f) => f.type === 'text' && f.key !== config.dimension)
              .map((f) => ({ value: f.key, label: f.label }))}
            hint={config.splitBy ? 'The first measure is used when splitting.' : undefined}
          />
        </ToolSurface>

        {/* --------------------------------------------------- styling */}
        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Appearance</ToolSectionHeading>

          <Dropdown
            label="Palette"
            value={config.palette}
            onChange={(value) => value && patch({ palette: value as NamedPalette })}
            options={PALETTE_OPTIONS.map((p) => ({
              value: p.value,
              label: p.label,
              description: p.description,
            }))}
          />

          <Dropdown
            label="Number format"
            value={config.format}
            onChange={(value) => value && patch({ format: value as NumberFormat })}
            options={[
              { value: 'plain', label: 'Plain' },
              { value: 'compact', label: 'Compact', description: '12.4K, 3.1M' },
              { value: 'currency', label: 'Currency' },
              { value: 'percent', label: 'Percent' },
              { value: 'bytes', label: 'Bytes' },
            ]}
          />

          <input
            aria-label="Chart title"
            placeholder="Chart title"
            value={config.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
          />
          <input
            aria-label="Subtitle"
            placeholder="Subtitle"
            value={config.subtitle}
            onChange={(event) => patch({ subtitle: event.target.value })}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
          />

          <Slider
            label="Height"
            value={config.height}
            min={220}
            max={720}
            step={10}
            suffix="px"
            editable
            onInput={(value) => patch({ height: value as number })}
            onChange={(value) => patch({ height: value as number })}
          />

          {!isCircularKind(config.kind) ? (
            <Slider
              label="Category label angle"
              value={config.labelRotation}
              min={-90}
              max={0}
              step={15}
              suffix="°"
              marks={[
                { value: -90, label: 'Vertical' },
                { value: -45, label: '45°' },
                { value: 0, label: 'Flat' },
              ]}
              snapToMarks
              onInput={(value) => patch({ labelRotation: value as number })}
              onChange={(value) => patch({ labelRotation: value as number })}
            />
          ) : null}

          <div className="flex flex-col gap-2.5">
            <Toggle label="Legend" checked={config.legend} onChange={(v) => patch({ legend: v })} />
            <Toggle label="Data labels" checked={config.dataLabels} onChange={(v) => patch({ dataLabels: v })} />
            {!isCircularKind(config.kind) ? (
              <Toggle label="Gridlines" checked={config.grid} onChange={(v) => patch({ grid: v })} />
            ) : null}
          </div>

          <Slider
            label="Target line"
            value={config.target ?? 0}
            min={0}
            max={200000}
            step={1000}
            editable
            hint={config.target === null ? 'Off — drag to add a threshold line.' : undefined}
            onInput={(value) => patch({ target: value as number })}
            onChange={(value) => patch({ target: (value as number) || null })}
          />

          <Dropdown
            label="Preview theme"
            value={theme}
            onChange={(value) => value && setTheme(value as 'light' | 'dark')}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </ToolSurface>
      </div>

      <ToolSurface className="flex flex-col gap-4">
        <ToolSectionHeading>Saved charts</ToolSectionHeading>
        <TemplateBar
          templates={templates}
          activeId={activeTemplate}
          onSave={onSave}
          onLoad={(id) => {
            const template = getTemplate<ChartBuilderConfig>(id);
            if (!template) return;
            setConfig(template.config);
            setActiveTemplate(id);
            toast.show(`Loaded “${template.name}”.`);
          }}
          onDuplicate={() => {
            if (!activeTemplate) return;
            duplicateTemplate<ChartBuilderConfig>(activeTemplate);
            setTemplates(listTemplates<ChartBuilderConfig>('chart').map(({ id, name, savedAt }) => ({ id, name, savedAt })));
          }}
          onDelete={() => {
            if (!activeTemplate) return;
            deleteTemplate(activeTemplate);
            setActiveTemplate(null);
            setTemplates(listTemplates<ChartBuilderConfig>('chart').map(({ id, name, savedAt }) => ({ id, name, savedAt })));
          }}
        />
        <p className="text-xs text-muted">
          Templates are stored in this browser on this device. There is no account and nothing is
          uploaded, so they do not follow you to another machine.
        </p>
      </ToolSurface>
    </div>
  );
}


