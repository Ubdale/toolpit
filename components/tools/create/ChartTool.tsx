'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput, Select, TextInput } from '@/components/ui/Field';
import { chartToPng, renderChart } from '@/lib/chart/render';
import {
  ChartDataError,
  parseNumber,
  parseTable,
  readTableFile,
  sampleTable,
} from '@/lib/chart/data';
import { palettes, SERIES_SOFT_CAP, seriesColor } from '@/lib/chart/palette';
import { formatValue } from '@/lib/chart/scale';
import {
  chartTypes,
  isCircular,
  requiresZeroBaseline,
  type ChartSpec,
  type ChartTheme,
  type ChartType,
  type HitRegion,
  type PaletteId,
} from '@/lib/chart/types';
import { downloadBlob } from '@/lib/download';

const CHART_WIDTH = 840;
const CHART_HEIGHT = 520;

export default function ChartTool() {
  const [text, setText] = useState(sampleTable);
  const [type, setType] = useState<ChartType>('column');
  const [title, setTitle] = useState('Revenue and costs, 2025');
  const [subtitle, setSubtitle] = useState('');
  const [xLabel, setXLabel] = useState('');
  const [yLabel, setYLabel] = useState('');
  const [palette, setPalette] = useState<PaletteId>('categorical');
  const [theme, setTheme] = useState<ChartTheme>('light');
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [stacked, setStacked] = useState(false);
  // Bars force this on regardless; for a line or scatter, starting at zero can
  // flatten the whole story (1,000 to 1,050 becomes a straight line at the top),
  // so it is off by default and offered as a choice.
  const [zeroBaseline, setZeroBaseline] = useState(false);
  const [pngScale, setPngScale] = useState(2);
  const [isExporting, setIsExporting] = useState(false);

  const [hover, setHover] = useState<HitRegion | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  // The tool follows the site's theme by default, but the export is its own
  // decision — a chart bound for a light deck should not come out dark because
  // the person making it happened to be in dark mode.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const parsed = useMemo(() => {
    try {
      return { ...parseTable(text), error: null as string | null };
    } catch (cause) {
      return {
        data: null,
        warnings: [] as string[],
        error:
          cause instanceof ChartDataError
            ? cause.message
            : 'That data could not be read as a table.',
      };
    }
  }, [text]);

  // Memoised on its own fields, not rebuilt inline: `spec` used to be a fresh
  // object literal every render, which meant the `renderChart` memo below never
  // hit and the whole SVG was rebuilt on every mouse move across the chart.
  const spec: ChartSpec | null = useMemo(
    () =>
      parsed.data
        ? {
            type,
            data: parsed.data,
            title,
            subtitle,
            xLabel,
            yLabel,
            width: CHART_WIDTH,
            height: CHART_HEIGHT,
            theme,
            palette,
            showGrid,
            showLegend,
            showValues,
            stacked: stacked && !isCircular(type) && type !== 'scatter' && type !== 'line',
            zeroBaseline,
          }
        : null,
    [
      parsed.data,
      type,
      title,
      subtitle,
      xLabel,
      yLabel,
      theme,
      palette,
      showGrid,
      showLegend,
      showValues,
      stacked,
      zeroBaseline,
    ],
  );

  const rendered = useMemo(() => (spec ? renderChart(spec) : null), [spec]);

  function trackPointer(event: ReactMouseEvent<HTMLDivElement>) {
    if (!rendered) return;
    const bounds = event.currentTarget.getBoundingClientRect();

    // The SVG scales to fit, so pointer coordinates convert back through the
    // rendered width rather than assuming one CSS pixel is one SVG unit.
    const scale = CHART_WIDTH / bounds.width;
    const x = (event.clientX - bounds.left) * scale;
    const y = (event.clientY - bounds.top) * scale;

    const found = rendered.hits.find(
      (hit) => x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height,
    );
    // Bail out unless the hovered mark actually changed: mousemove fires on
    // every pixel, and setting state each time re-renders the whole tool.
    setHover((current) => {
      if (current === (found ?? null)) return current;
      if (!current && !found) return current;
      if (current && found && current.label === found.label && current.seriesName === found.seriesName) {
        return current;
      }
      return found ?? null;
    });
  }

  function downloadSvg() {
    if (!rendered) return;
    downloadBlob(new Blob([rendered.svg], { type: 'image/svg+xml' }), 'chart.svg');
  }

  async function downloadPng() {
    if (!spec) return;
    setIsExporting(true);
    try {
      downloadBlob(await chartToPng(spec, pngScale), `chart-${CHART_WIDTH * pngScale}px.png`);
    } finally {
      setIsExporting(false);
    }
  }

  async function loadFile(files: File[]) {
    const file = files[0];
    if (file) setText(await readTableFile(file));
  }

  const seriesCount = parsed.data?.series.length ?? 0;
  const supportsStacking = !isCircular(type) && type !== 'scatter' && type !== 'line';

  // Scatter puts the label column on the x-axis, so it has to hold numbers.
  // Without this the chart still draws — as a meaningless stack of dots on the
  // axis — which is worse than saying what is wrong.
  const scatterNeedsNumbers =
    type === 'scatter' &&
    !!parsed.data &&
    parsed.data.labels.filter((label) => parseNumber(label) !== null).length <
      parsed.data.labels.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <ToolSurface className="flex flex-col gap-4 self-start">
          <div className="relative">
            <div
              ref={svgRef}
              onMouseMove={trackPointer}
              onMouseLeave={() => setHover(null)}
              className="w-full overflow-hidden rounded-xl border border-line [&>svg]:h-auto [&>svg]:w-full"
              // Built entirely from our own renderer: every value is escaped or
              // a number before it reaches the string.
              dangerouslySetInnerHTML={{ __html: rendered?.svg ?? '' }}
            />

            {hover ? (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 shadow-card"
                style={{
                  left: `${(hover.anchorX / CHART_WIDTH) * 100}%`,
                  top: `${(hover.anchorY / CHART_HEIGHT) * 100}%`,
                }}
              >
                <p className="flex items-center gap-2 text-xs font-medium">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ background: hover.color }}
                  />
                  {hover.label}
                </p>
                <p className="mt-0.5 text-sm">
                  <span className="text-muted">{hover.seriesName}: </span>
                  <span className="font-semibold tabular-nums">{formatValue(hover.value)}</span>
                </p>
              </div>
            ) : null}
          </div>

          {parsed.error ? <ErrorMessage>{parsed.error}</ErrorMessage> : null}
          {parsed.warnings.map((warning) => (
            <p key={warning} className="text-sm text-muted">
              {warning}
            </p>
          ))}

          {scatterNeedsNumbers ? (
            <p className="text-sm text-muted">
              A scatter chart plots the first column on the x-axis, so it needs numbers there —
              yours holds text, and the dots have nowhere meaningful to sit. Swap to a column or
              line chart, or make the first column numeric.
            </p>
          ) : null}

          {seriesCount > SERIES_SOFT_CAP ? (
            <p className="text-sm text-muted">
              {seriesCount} series is past the point where colour alone tells them apart. Consider
              grouping the smallest into an &ldquo;Other&rdquo; column, or splitting this into two
              charts.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadPng} disabled={!spec || isExporting}>
              {isExporting ? 'Rendering…' : 'Download PNG'}
            </Button>
            <Button variant="secondary" onClick={downloadSvg} disabled={!rendered}>
              Download SVG
            </Button>
          </div>
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Chart</ToolSectionHeading>

          <Field label="Type">
            {({ id }) => (
              <Select
                id={id}
                value={type}
                onChange={(event) => setType(event.target.value as ChartType)}
              >
                {chartTypes.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label} — {entry.description}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Title">
            {({ id }) => (
              <TextInput id={id} value={title} onChange={(event) => setTitle(event.target.value)} />
            )}
          </Field>

          <Field label="Subtitle">
            {({ id }) => (
              <TextInput
                id={id}
                value={subtitle}
                placeholder="Optional — a source, a caveat, a date range"
                onChange={(event) => setSubtitle(event.target.value)}
              />
            )}
          </Field>

          {!isCircular(type) ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="X axis label">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={xLabel}
                    onChange={(event) => setXLabel(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Y axis label">
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={yLabel}
                    onChange={(event) => setYLabel(event.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : null}

          <Field label="Colours">
            {({ id }) => (
              <Select
                id={id}
                value={palette}
                onChange={(event) => setPalette(event.target.value as PaletteId)}
              >
                {palettes.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label} — {entry.description}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {seriesCount > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {(isCircular(type) ? parsed.data!.labels : parsed.data!.series.map((s) => s.name))
                .slice(0, 8)
                .map((name, index, all) => (
                  <li
                    key={`${name}-${index}`}
                    className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ background: seriesColor(palette, theme, index, all.length) }}
                    />
                    {name}
                  </li>
                ))}
            </ul>
          ) : null}

          <Field label="Export theme" hint="Independent of the theme you are browsing in.">
            {({ id }) => (
              <Select
                id={id}
                value={theme}
                onChange={(event) => setTheme(event.target.value as ChartTheme)}
              >
                <option value="light">Light background</option>
                <option value="dark">Dark background</option>
              </Select>
            )}
          </Field>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-sm font-medium">Show</legend>
            <Toggle checked={showLegend} onChange={setShowLegend} label="Legend" />
            <Toggle
              checked={showValues}
              onChange={setShowValues}
              label="Value labels"
              hint="Only on the highest and lowest points — a number on every mark goes unread."
            />
            {!isCircular(type) ? (
              <Toggle checked={showGrid} onChange={setShowGrid} label="Gridlines" />
            ) : null}
            {supportsStacking ? (
              <Toggle checked={stacked} onChange={setStacked} label="Stack the series" />
            ) : null}
            {!isCircular(type) && !requiresZeroBaseline(type) ? (
              <Toggle
                checked={zeroBaseline}
                onChange={setZeroBaseline}
                label="Start the axis at zero"
                hint="Off by default for lines — forcing zero can flatten a real trend into a straight line."
              />
            ) : null}
          </fieldset>

          <Field label={`PNG scale — ${CHART_WIDTH * pngScale}px wide`}>
            {({ id }) => (
              <RangeInput
                id={id}
                min={1}
                max={4}
                step={1}
                value={pngScale}
                onChange={(event) => setPngScale(Number(event.target.value))}
              />
            )}
          </Field>

          {requiresZeroBaseline(type) ? (
            <p className="text-xs text-muted">
              This chart type starts at zero. Cutting the axis on a bar chart makes a 2% difference
              look like a 200% one, so it is not offered as an option.
            </p>
          ) : null}
        </ToolSurface>
      </div>

      <ToolSurface className="flex flex-col gap-4">
        <ToolSectionHeading>Your data</ToolSectionHeading>
        <p className="text-sm text-muted">
          Paste straight from a spreadsheet, or drop a CSV. The first row names the series and the
          first column labels each point. Commas, tabs and semicolons all work, as do
          &ldquo;1,234&rdquo;, &ldquo;$1.2k&rdquo;, &ldquo;45%&rdquo; and &ldquo;(300)&rdquo;.
        </p>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={10}
          spellCheck={false}
          aria-label="Chart data"
          className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed transition-colors hover:border-line-strong focus:border-accent"
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setText(sampleTable)}>
            Reset to the example
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setText('')}>
            Clear
          </Button>
        </div>

        <Dropzone
          onFiles={loadFile}
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          label="Or drop a CSV file here"
          hint="Read in this tab. It is not uploaded anywhere."
        />

        {parsed.data ? (
          // The table is not decoration: three of the light-mode chart colours
          // sit below 3:1 against white, which is only acceptable when the
          // values are also available as text.
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">The data behind the chart</caption>
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <th scope="col" className="px-3 py-2 text-left font-medium" />
                  {parsed.data.series.map((series, index) => (
                    <th key={series.name} scope="col" className="px-3 py-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{
                            background: seriesColor(
                              palette,
                              theme,
                              index,
                              parsed.data!.series.length,
                            ),
                          }}
                        />
                        {series.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.data.labels.map((label, row) => (
                  <tr key={`${label}-${row}`} className="border-b border-line last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal text-muted">
                      {label}
                    </th>
                    {parsed.data!.series.map((series) => (
                      <td key={series.name} className="px-3 py-2 text-right tabular-nums">
                        {series.values[row] === null || series.values[row] === undefined
                          ? '—'
                          : formatValue(series.values[row]!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ToolSurface>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span>
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
