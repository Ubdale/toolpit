/** Axis maths and number formatting, kept apart from the drawing code. */

export type Scale = {
  min: number;
  max: number;
  ticks: number[];
};

/**
 * Rounds an axis out to friendly tick values (…, 250, 500, 750, …) rather than
 * whatever the data's exact extremes happen to be. Readers round anyway; an
 * axis that stops at 4,873 just makes them do it themselves.
 */
export function niceScale(min: number, max: number, targetTicks = 5): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };

  if (min === max) {
    // A flat series still needs an axis with room above and below it.
    const padding = Math.abs(min) > 0 ? Math.abs(min) * 0.5 : 1;
    min -= padding;
    max += padding;
  }

  const rawStep = (max - min) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceStep =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;

  const ticks: number[] = [];
  // Step in integers and multiply, so 0.1 + 0.2 never becomes 0.30000000000000004.
  const stepCount = Math.round((niceMax - niceMin) / niceStep);
  for (let i = 0; i <= stepCount; i += 1) {
    ticks.push(round(niceMin + i * niceStep));
  }

  return { min: niceMin, max: niceMax, ticks };
}

/** Trims the floating-point dust that ruins otherwise clean tick labels. */
function round(value: number): number {
  return Number(value.toPrecision(12));
}

/** Axis ticks: compact above 10,000 so labels stay short. */
export function formatTick(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e9) return `${trim(value / 1e9)}B`;
  if (magnitude >= 1e6) return `${trim(value / 1e6)}M`;
  if (magnitude >= 10_000) return `${trim(value / 1e3)}K`;
  return formatValue(value);
}

/** Tooltips and direct labels: the real number, thousands-separated. */
export function formatValue(value: number): string {
  const rounded = round(value);
  const decimals = Number.isInteger(rounded) ? 0 : Math.min(4, decimalsOf(rounded));
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Width of a string in the chart's sans stack, near enough for layout.
 *
 * The renderer produces a string, not a DOM node, so there is nothing to
 * measure against — but the alternative to estimating is clipped axis labels,
 * and 0.55em per character is close enough to keep text inside its gutter.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}
