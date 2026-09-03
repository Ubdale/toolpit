export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter';

export type Series = {
  name: string;
  /** null is a genuine gap, not a zero — lines break across it. */
  values: (number | null)[];
};

export type Dataset = {
  /** Category names, one per point. Parsed as numbers for scatter charts. */
  labels: string[];
  series: Series[];
};

export type ChartTheme = 'light' | 'dark';

export type ChartSpec = {
  type: ChartType;
  data: Dataset;
  title: string;
  subtitle: string;
  /** Axis captions. Empty strings are omitted rather than drawn blank. */
  xLabel: string;
  yLabel: string;
  width: number;
  height: number;
  theme: ChartTheme;
  palette: PaletteId;
  showGrid: boolean;
  showLegend: boolean;
  /** Label the extremes only — never every point. */
  showValues: boolean;
  stacked: boolean;
  /** Start the value axis at zero. Forced on for bars, where it is not optional. */
  zeroBaseline: boolean;
};

export type PaletteId = 'categorical' | 'ember';

/**
 * A hover target the preview can hit-test against. The renderer knows the
 * geometry, so it emits these rather than making the component recompute the
 * layout a second time and drift out of sync.
 */
export type HitRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  seriesName: string;
  label: string;
  value: number;
  color: string;
  /** Where the tooltip should point, in SVG coordinates. */
  anchorX: number;
  anchorY: number;
};

export type RenderedChart = {
  svg: string;
  hits: HitRegion[];
};

export const chartTypes: { value: ChartType; label: string; description: string }[] = [
  { value: 'column', label: 'Column', description: 'Vertical bars — the safe default for comparing amounts.' },
  { value: 'bar', label: 'Bar', description: 'Horizontal bars — better when category names are long.' },
  { value: 'line', label: 'Line', description: 'A trend over time.' },
  { value: 'area', label: 'Area', description: 'A trend where the volume underneath matters.' },
  { value: 'pie', label: 'Pie', description: 'Parts of one whole. Uses the first column only.' },
  { value: 'donut', label: 'Donut', description: 'A pie with the middle cut out.' },
  { value: 'scatter', label: 'Scatter', description: 'Two numeric axes, one dot per row.' },
];

/** Bars and areas are only honest from a zero baseline. */
export function requiresZeroBaseline(type: ChartType): boolean {
  return type === 'column' || type === 'bar' || type === 'area';
}

export function isCircular(type: ChartType): boolean {
  return type === 'pie' || type === 'donut';
}
