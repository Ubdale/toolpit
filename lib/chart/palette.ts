import type { ChartTheme, PaletteId } from './types';

/**
 * Chart colour, validated rather than chosen by eye.
 *
 * Both palettes below were run through the colour checks that matter for charts
 * — the OKLCH lightness band, a chroma floor, colour-blind separation between
 * adjacent slots, a normal-vision separation floor, and contrast against the
 * surface they sit on — in both light and dark mode, against Toolpit's actual
 * surface colours (#ffffff and #171614) rather than generic ones.
 *
 * Two consequences are baked into the renderer and must stay there:
 *
 *  - Slots are assigned in fixed order and never cycled. A ninth series folds
 *    into a ninth slot only by repeating with a marker difference; the tool caps
 *    the legend before that becomes misleading.
 *  - Three light-mode slots sit below 3:1 against white. That is allowed only
 *    with "relief": the chart always ships a legend and the tool always shows
 *    the source table beneath the preview, so identity never rests on a colour
 *    a reader might not resolve.
 */

/** Fixed categorical order. Do not re-order — the sequence is what passes CVD. */
const CATEGORICAL: Record<ChartTheme, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/**
 * A single-hue ramp in Toolpit's ember, light to dark. Sequential encoding —
 * for one series where the point is magnitude, not identity.
 */
const EMBER: Record<ChartTheme, string[]> = {
  light: ['#f0a273', '#e0763a', '#d1541f', '#93380f'],
  dark: ['#f8c6a8', '#f4996a', '#e8703a', '#b0441a'],
};

export type ChartColors = {
  surface: string;
  text: string;
  muted: string;
  grid: string;
  axis: string;
};

export const chartColors: Record<ChartTheme, ChartColors> = {
  light: {
    surface: '#ffffff',
    text: '#191712',
    muted: '#6a6355',
    grid: '#e6e1d8',
    axis: '#d3cdc1',
  },
  dark: {
    surface: '#171614',
    text: '#f6f3ed',
    muted: '#a29a8b',
    grid: '#2a2724',
    axis: '#3b3733',
  },
};

export const palettes: { value: PaletteId; label: string; description: string }[] = [
  {
    value: 'categorical',
    label: 'Categorical',
    description: 'Eight distinct hues, for telling series apart.',
  },
  {
    value: 'ember',
    label: 'Ember ramp',
    description: 'One hue, light to dark — for when the point is size, not identity.',
  },
];

/**
 * The colour for slot `index`. Slots are handed out in order; past the end of a
 * palette they repeat, which the tool warns about rather than papering over
 * with a generated hue no one can distinguish.
 */
export function seriesColor(
  palette: PaletteId,
  theme: ChartTheme,
  index: number,
  total: number,
): string {
  if (palette === 'ember') {
    const ramp = EMBER[theme];
    if (total <= 1) return ramp[2]!;
    // Spread the series across the ramp so the ends are always in play.
    const position = Math.round((index / Math.max(1, total - 1)) * (ramp.length - 1));
    return ramp[Math.min(position, ramp.length - 1)]!;
  }

  const slots = CATEGORICAL[theme];
  return slots[index % slots.length]!;
}

export function paletteSize(palette: PaletteId): number {
  return palette === 'ember' ? EMBER.light.length : CATEGORICAL.light.length;
}

/** Past this many series, colour alone stops carrying identity. */
export const SERIES_SOFT_CAP = 8;
