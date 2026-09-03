'use client';

import type { ApexOptions } from 'apexcharts';

import { chartColors, seriesColor } from './palette';
import type { ChartTheme, PaletteId } from './types';

/**
 * ApexCharts, lazily.
 *
 * The library is around half a megabyte, which is more than the rest of this
 * site's JavaScript combined — so it is never imported at module scope. Like
 * pdf-lib, pdf.js and the AI runtimes before it, it sits behind a memoised
 * dynamic import and is only fetched when a visitor actually opens a page that
 * draws a chart.
 */

// The package uses `export = ApexCharts`, so the module type *is* the class.
type ApexConstructor = typeof import('apexcharts');

let modulePromise: Promise<ApexConstructor> | null = null;

export function loadApex(): Promise<ApexConstructor> {
  // The package's CJS build puts the class on `default`, but its types declare
  // the class itself as the module — so the interop is resolved here once.
  modulePromise ??= import('apexcharts').then(
    (module) => ((module as { default?: ApexConstructor }).default ?? module) as ApexConstructor,
  );
  return modulePromise;
}

// ------------------------------------------------------------- chart types

/**
 * Every chart form the wrapper offers.
 *
 * Several of these are not ApexCharts types but recipes over one — a semi
 * donut is a donut with a half circle, a funnel is a centred horizontal bar,
 * a stepline is a line with a different curve. Naming them here means the
 * builder can offer them as first-class choices instead of expecting someone
 * to know which four options to combine.
 */
export type ChartKind =
  | 'line'
  | 'spline'
  | 'stepline'
  | 'area'
  | 'areaStacked'
  | 'rangeArea'
  | 'column'
  | 'columnStacked'
  | 'columnStacked100'
  | 'bar'
  | 'barStacked'
  | 'barStacked100'
  | 'rangeBar'
  | 'combo'
  | 'pie'
  | 'donut'
  | 'semiDonut'
  | 'polarArea'
  | 'radar'
  | 'radialBar'
  | 'radialBarMulti'
  | 'bubble'
  | 'scatter'
  | 'heatmap'
  | 'treemap'
  | 'candlestick'
  | 'boxPlot'
  | 'funnel'
  | 'pyramid'
  | 'slope'
  | 'sparkline';

export type ChartKindMeta = {
  kind: ChartKind;
  label: string;
  group: string;
  description: string;
  /** Icon name in the shared set. */
  icon: string;
  /** Field roles this form actually consumes. */
  needs: { x: boolean; y: 'one' | 'many'; z?: boolean };
};

export const CHART_KINDS: ChartKindMeta[] = [
  { kind: 'line', label: 'Line', group: 'Lines', description: 'A trend over time.', icon: 'chartLine', needs: { x: true, y: 'many' } },
  { kind: 'spline', label: 'Smooth line', group: 'Lines', description: 'Curved rather than straight between points.', icon: 'chartLine', needs: { x: true, y: 'many' } },
  { kind: 'stepline', label: 'Step line', group: 'Lines', description: 'Holds each value until the next — for states and rates.', icon: 'chartLine', needs: { x: true, y: 'many' } },
  { kind: 'area', label: 'Area', group: 'Areas', description: 'A line with the volume beneath it filled.', icon: 'chartArea', needs: { x: true, y: 'many' } },
  { kind: 'areaStacked', label: 'Stacked area', group: 'Areas', description: 'Parts accumulating into a total over time.', icon: 'chartArea', needs: { x: true, y: 'many' } },
  { kind: 'rangeArea', label: 'Range area', group: 'Areas', description: 'A band between a low and a high series.', icon: 'chartArea', needs: { x: true, y: 'many' } },
  { kind: 'column', label: 'Column', group: 'Bars', description: 'Vertical bars — the safe default for comparing amounts.', icon: 'chartColumn', needs: { x: true, y: 'many' } },
  { kind: 'columnStacked', label: 'Stacked column', group: 'Bars', description: 'Parts of a whole, per category.', icon: 'chartStacked', needs: { x: true, y: 'many' } },
  { kind: 'columnStacked100', label: '100% column', group: 'Bars', description: 'Share of each category, normalised.', icon: 'chartStacked', needs: { x: true, y: 'many' } },
  { kind: 'bar', label: 'Bar', group: 'Bars', description: 'Horizontal — better when category names are long.', icon: 'chartBar', needs: { x: true, y: 'many' } },
  { kind: 'barStacked', label: 'Stacked bar', group: 'Bars', description: 'Horizontal parts of a whole.', icon: 'chartStacked', needs: { x: true, y: 'many' } },
  { kind: 'barStacked100', label: '100% bar', group: 'Bars', description: 'Horizontal share, normalised.', icon: 'chartStacked', needs: { x: true, y: 'many' } },
  { kind: 'rangeBar', label: 'Timeline', group: 'Bars', description: 'A start and an end per row — Gantt-style.', icon: 'chartTimeline', needs: { x: true, y: 'many' } },
  { kind: 'combo', label: 'Combo', group: 'Bars', description: 'Columns and lines together on shared axes.', icon: 'chartColumn', needs: { x: true, y: 'many' } },
  { kind: 'pie', label: 'Pie', group: 'Parts of a whole', description: 'One series split into slices.', icon: 'chartPie', needs: { x: true, y: 'one' } },
  { kind: 'donut', label: 'Donut', group: 'Parts of a whole', description: 'A pie with the middle free for a total.', icon: 'chartDonut', needs: { x: true, y: 'one' } },
  { kind: 'semiDonut', label: 'Semi donut', group: 'Parts of a whole', description: 'Half a donut — fits a wide, short space.', icon: 'chartDonut', needs: { x: true, y: 'one' } },
  { kind: 'polarArea', label: 'Polar area', group: 'Parts of a whole', description: 'Slices whose radius carries the value.', icon: 'chartPolar', needs: { x: true, y: 'one' } },
  { kind: 'funnel', label: 'Funnel', group: 'Parts of a whole', description: 'Stages narrowing towards an outcome.', icon: 'chartFunnel', needs: { x: true, y: 'one' } },
  { kind: 'pyramid', label: 'Pyramid', group: 'Parts of a whole', description: 'A funnel the other way up.', icon: 'chartFunnel', needs: { x: true, y: 'one' } },
  { kind: 'radar', label: 'Radar', group: 'Comparison', description: 'Several measures on one shape.', icon: 'chartRadar', needs: { x: true, y: 'many' } },
  { kind: 'radialBar', label: 'Gauge', group: 'Comparison', description: 'Progress towards a target.', icon: 'chartGauge', needs: { x: true, y: 'one' } },
  { kind: 'radialBarMulti', label: 'Multi gauge', group: 'Comparison', description: 'Several gauges nested.', icon: 'chartGauge', needs: { x: true, y: 'many' } },
  { kind: 'slope', label: 'Slope', group: 'Comparison', description: 'Two points per item — before and after.', icon: 'chartLine', needs: { x: true, y: 'many' } },
  { kind: 'scatter', label: 'Scatter', group: 'Distribution', description: 'Two numeric axes, one dot per row.', icon: 'chartScatter', needs: { x: true, y: 'many' } },
  { kind: 'bubble', label: 'Bubble', group: 'Distribution', description: 'Scatter with a third measure as size.', icon: 'chartBubble', needs: { x: true, y: 'many', z: true } },
  { kind: 'heatmap', label: 'Heatmap', group: 'Distribution', description: 'A grid coloured by magnitude.', icon: 'chartHeatmap', needs: { x: true, y: 'many' } },
  { kind: 'treemap', label: 'Treemap', group: 'Distribution', description: 'Nested rectangles sized by value.', icon: 'chartTreemap', needs: { x: true, y: 'one' } },
  { kind: 'boxPlot', label: 'Box plot', group: 'Distribution', description: 'Spread and outliers per category.', icon: 'chartBox', needs: { x: true, y: 'many' } },
  { kind: 'candlestick', label: 'Candlestick', group: 'Distribution', description: 'Open, high, low and close.', icon: 'chartCandlestick', needs: { x: true, y: 'many' } },
  { kind: 'sparkline', label: 'Sparkline', group: 'Inline', description: 'A bare trend line with no axes, for a stat tile.', icon: 'chartSpark', needs: { x: true, y: 'one' } },
];

/** The ApexCharts primitive each of our forms is built on. */
const BASE_TYPE: Record<ChartKind, string> = {
  line: 'line', spline: 'line', stepline: 'line', slope: 'line', sparkline: 'line',
  area: 'area', areaStacked: 'area', rangeArea: 'rangeArea',
  column: 'bar', columnStacked: 'bar', columnStacked100: 'bar',
  bar: 'bar', barStacked: 'bar', barStacked100: 'bar',
  funnel: 'bar', pyramid: 'bar', rangeBar: 'rangeBar', combo: 'line',
  pie: 'pie', donut: 'donut', semiDonut: 'donut', polarArea: 'polarArea',
  radar: 'radar', radialBar: 'radialBar', radialBarMulti: 'radialBar',
  bubble: 'bubble', scatter: 'scatter', heatmap: 'heatmap', treemap: 'treemap',
  candlestick: 'candlestick', boxPlot: 'boxPlot',
};

export function apexType(kind: ChartKind): string {
  return BASE_TYPE[kind];
}

export function isCircularKind(kind: ChartKind): boolean {
  return ['pie', 'donut', 'semiDonut', 'polarArea', 'radialBar', 'radialBarMulti'].includes(kind);
}

export function isStacked(kind: ChartKind): boolean {
  return kind.includes('Stacked') || kind === 'areaStacked';
}

export function isStacked100(kind: ChartKind): boolean {
  return kind.endsWith('100');
}

/** Forms whose value axis must start at zero to be honest. */
export function needsZeroBaseline(kind: ChartKind): boolean {
  return ['column', 'bar', 'columnStacked', 'barStacked', 'area', 'areaStacked', 'funnel', 'pyramid'].includes(
    kind,
  );
}

// ------------------------------------------------------------ number format

export type NumberFormat = 'plain' | 'compact' | 'currency' | 'percent' | 'bytes';

export type FormatOptions = {
  format: NumberFormat;
  currency?: string;
  decimals?: number;
  locale?: string;
};

export function formatNumber(value: number, options: FormatOptions): string {
  if (!Number.isFinite(value)) return '—';
  const locale = options.locale ?? 'en-US';
  const decimals = options.decimals;

  switch (options.format) {
    case 'compact':
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: decimals ?? 1,
      }).format(value);
    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: options.currency ?? 'USD',
        maximumFractionDigits: decimals ?? 2,
      }).format(value);
    case 'percent':
      return `${new Intl.NumberFormat(locale, {
        maximumFractionDigits: decimals ?? 1,
      }).format(value)}%`;
    case 'bytes': {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = value;
      let unit = 0;
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
      }
      return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
    }
    default:
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: decimals ?? 2,
      }).format(value);
  }
}

// ----------------------------------------------------------------- palettes

export type NamedPalette = PaletteId | 'vivid' | 'ocean' | 'warm';

/**
 * The named palettes.
 *
 * `categorical` and `ember` are the two already validated for colour-blind
 * separation and surface contrast in both themes; the rest are conveniences
 * built from the same hues, and the builder marks them as unvalidated so the
 * distinction is not silently lost.
 */
const EXTRA_PALETTES: Record<'vivid' | 'ocean' | 'warm', Record<ChartTheme, string[]>> = {
  vivid: {
    light: ['#2a78d6', '#e34948', '#1baf7a', '#eda100', '#4a3aa7', '#e87ba4', '#008300', '#eb6834'],
    dark: ['#3987e5', '#e66767', '#199e70', '#c98500', '#9085e9', '#d55181', '#008300', '#d95926'],
  },
  ocean: {
    light: ['#0d366b', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#1baf7a', '#199e70', '#14684d'],
    dark: ['#86b6ef', '#5598e7', '#3987e5', '#256abf', '#184f95', '#5fd6a6', '#199e70', '#14684d'],
  },
  warm: {
    light: ['#93380f', '#d1541f', '#e0763a', '#f0a273', '#eda100', '#b4291f', '#e34948', '#6a6355'],
    dark: ['#f8c6a8', '#f4996a', '#e8703a', '#b0441a', '#c98500', '#e66767', '#d55181', '#a29a8b'],
  },
};

export function paletteColors(
  palette: NamedPalette,
  theme: ChartTheme,
  count: number,
): string[] {
  if (palette === 'categorical' || palette === 'ember') {
    return Array.from({ length: Math.max(1, count) }, (_, index) =>
      seriesColor(palette, theme, index, count),
    );
  }
  const set = EXTRA_PALETTES[palette][theme];
  return Array.from({ length: Math.max(1, count) }, (_, index) => set[index % set.length]!);
}

export const PALETTE_OPTIONS: { value: NamedPalette; label: string; description: string }[] = [
  { value: 'categorical', label: 'Categorical', description: 'Validated for colour-blind separation.' },
  { value: 'ember', label: 'Ember ramp', description: 'One hue, light to dark — for magnitude.' },
  { value: 'vivid', label: 'Vivid', description: 'High contrast. Not separation-tested.' },
  { value: 'ocean', label: 'Ocean', description: 'Cool blues and greens. Not separation-tested.' },
  { value: 'warm', label: 'Warm', description: 'Reds and ambers. Not separation-tested.' },
];

// ------------------------------------------------------------- base options

/**
 * The theme-aware defaults every chart starts from.
 *
 * Apex's own defaults assume a white page and a blue palette; these replace the
 * grid, text, tooltip and toolbar colours with the site's tokens so a chart
 * looks like part of the app rather than an embedded widget.
 */
export function baseOptions(theme: ChartTheme): ApexOptions {
  const colors = chartColors[theme];

  return {
    chart: {
      fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
      background: 'transparent',
      foreColor: colors.muted,
      animations: { enabled: true, speed: 260 },
      toolbar: {
        show: true,
        tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
      },
    },
    theme: { mode: theme },
    grid: {
      borderColor: colors.grid,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 12, right: 12 },
    },
    stroke: { width: 2, curve: 'straight', lineCap: 'round' },
    dataLabels: { enabled: false },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      fontSize: '12px',
      markers: { size: 5 },
      itemMargin: { horizontal: 10, vertical: 4 },
    },
    xaxis: {
      axisBorder: { color: colors.axis },
      axisTicks: { color: colors.axis },
      labels: { style: { colors: colors.muted, fontSize: '12px' } },
    },
    yaxis: {
      labels: { style: { colors: colors.muted, fontSize: '12px' } },
    },
    tooltip: { theme },
    noData: {
      text: 'Nothing to plot yet',
      style: { color: colors.muted, fontSize: '13px' },
    },
  };
}
