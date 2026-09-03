import { parseNumber } from './data';
import { chartColors, seriesColor } from './palette';
import { estimateTextWidth, formatTick, formatValue, niceScale, type Scale } from './scale';
import {
  isCircular,
  requiresZeroBaseline,
  type ChartSpec,
  type HitRegion,
  type RenderedChart,
} from './types';

/**
 * Draws a chart as a self-contained SVG string.
 *
 * Self-contained is the requirement that shapes everything here: the file has
 * to survive being dropped into a deck, a Word document or a print job with no
 * stylesheet, no web font and no script, so every colour is a literal, the font
 * is a system stack, and the theme is resolved at render time rather than left
 * to CSS. The on-page preview renders through the same path as the download,
 * so what you see really is what you get.
 *
 * The visual rules are not free choices — thin marks, a 2px surface gap doing
 * the separating, hairline recessive gridlines, a legend whenever there is more
 * than one series, and direct labels only on the extremes.
 */

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const TITLE_SIZE = 19;
const SUBTITLE_SIZE = 13;
const AXIS_SIZE = 12;
const LEGEND_SIZE = 12;

/** Bars never fill their band; the leftover is deliberate air. */
const MAX_BAR_THICKNESS = 24;
/** The one spacer: surface-coloured, never a stroke around the mark. */
const SURFACE_GAP = 2;
const LINE_WIDTH = 2;
const MARKER_RADIUS = 4;
const AREA_OPACITY = 0.1;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

type TextOptions = {
  anchor?: 'start' | 'middle' | 'end';
  size?: number;
  color: string;
  weight?: number;
  baseline?: 'auto' | 'middle' | 'hanging';
  transform?: string;
};

function text(content: string, x: number, y: number, options: TextOptions): string {
  if (!content) return '';
  const attributes = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `font-family="${FONT}"`,
    `font-size="${options.size ?? AXIS_SIZE}"`,
    `fill="${options.color}"`,
  ];
  if (options.anchor) attributes.push(`text-anchor="${options.anchor}"`);
  if (options.weight) attributes.push(`font-weight="${options.weight}"`);
  if (options.baseline && options.baseline !== 'auto') {
    attributes.push(`dominant-baseline="${options.baseline}"`);
  }
  if (options.transform) attributes.push(`transform="${options.transform}"`);
  return `<text ${attributes.join(' ')}>${escapeXml(content)}</text>`;
}

/**
 * A bar with its data-end rounded and its baseline end square, which is what
 * keeps a bar chart readable: the rounded end says "this is where the value
 * stops", the square end says "this is where it is measured from".
 */
function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  end: 'top' | 'bottom' | 'left' | 'right',
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) return `M${n(x)} ${n(y)}h${n(width)}v${n(height)}h${n(-width)}z`;

  switch (end) {
    case 'top':
      return (
        `M${n(x)} ${n(y + height)}V${n(y + r)}` +
        `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}h${n(width - 2 * r)}` +
        `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}V${n(y + height)}z`
      );
    case 'bottom':
      return (
        `M${n(x)} ${n(y)}V${n(y + height - r)}` +
        `a${n(r)} ${n(r)} 0 0 0 ${n(r)} ${n(r)}h${n(width - 2 * r)}` +
        `a${n(r)} ${n(r)} 0 0 0 ${n(r)} ${n(-r)}V${n(y)}z`
      );
    case 'right':
      return (
        `M${n(x)} ${n(y)}h${n(width - r)}` +
        `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(height - 2 * r)}` +
        `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}H${n(x)}z`
      );
    default:
      return (
        `M${n(x + width)} ${n(y)}H${n(x + r)}` +
        `a${n(r)} ${n(r)} 0 0 0 ${n(-r)} ${n(r)}v${n(height - 2 * r)}` +
        `a${n(r)} ${n(r)} 0 0 0 ${n(r)} ${n(r)}H${n(x + width)}z`
      );
  }
}

type Frame = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Context = {
  spec: ChartSpec;
  colors: (typeof chartColors)['light'];
  colorFor: (index: number) => string;
  seriesCount: number;
};

// ------------------------------------------------------------------ header

function renderHeader(spec: ChartSpec, colors: Context['colors']): { markup: string; y: number } {
  let y = 14;
  let markup = '';

  if (spec.title) {
    markup += text(spec.title, 20, y + TITLE_SIZE, {
      color: colors.text,
      size: TITLE_SIZE,
      weight: 600,
    });
    y += TITLE_SIZE + 8;
  }
  if (spec.subtitle) {
    markup += text(spec.subtitle, 20, y + SUBTITLE_SIZE, {
      color: colors.muted,
      size: SUBTITLE_SIZE,
    });
    y += SUBTITLE_SIZE + 6;
  }

  return { markup, y: spec.title || spec.subtitle ? y + 6 : 14 };
}

/**
 * A legend for two or more series, always — colour on its own is never allowed
 * to be the only thing carrying identity. A single series doesn't get one: the
 * title already names what is plotted, and a one-swatch box just repeats it.
 */
function renderLegend(
  context: Context,
  names: string[],
  startY: number,
  width: number,
): { markup: string; height: number } {
  const { colors, colorFor } = context;
  if (names.length < 2) return { markup: '', height: 0 };

  const swatch = 10;
  const gapAfterSwatch = 6;
  const gapBetween = 18;
  const rowHeight = 20;

  let x = 20;
  let y = startY;
  let markup = '';

  for (const [index, name] of names.entries()) {
    const itemWidth = swatch + gapAfterSwatch + estimateTextWidth(name, LEGEND_SIZE);
    if (x > 20 && x + itemWidth > width - 20) {
      x = 20;
      y += rowHeight;
    }

    markup +=
      `<rect x="${n(x)}" y="${n(y + 2)}" width="${swatch}" height="${swatch}" rx="2" ` +
      `fill="${colorFor(index)}"/>`;
    markup += text(name, x + swatch + gapAfterSwatch, y + swatch + 1, {
      color: colors.muted,
      size: LEGEND_SIZE,
    });

    x += itemWidth + gapBetween;
  }

  return { markup, height: y - startY + rowHeight };
}

// ------------------------------------------------------------- axis drawing

function gridAndValueAxis(
  context: Context,
  frame: Frame,
  scale: Scale,
  orientation: 'vertical' | 'horizontal',
): string {
  const { colors, spec } = context;
  let markup = '';

  for (const tick of scale.ticks) {
    const ratio = (tick - scale.min) / (scale.max - scale.min || 1);

    if (orientation === 'vertical') {
      const y = frame.bottom - ratio * (frame.bottom - frame.top);
      if (spec.showGrid) {
        markup +=
          `<line x1="${n(frame.left)}" y1="${n(y)}" x2="${n(frame.right)}" y2="${n(y)}" ` +
          `stroke="${colors.grid}" stroke-width="1"/>`;
      }
      markup += text(formatTick(tick), frame.left - 8, y, {
        anchor: 'end',
        color: colors.muted,
        baseline: 'middle',
      });
    } else {
      const x = frame.left + ratio * (frame.right - frame.left);
      if (spec.showGrid) {
        markup +=
          `<line x1="${n(x)}" y1="${n(frame.top)}" x2="${n(x)}" y2="${n(frame.bottom)}" ` +
          `stroke="${colors.grid}" stroke-width="1"/>`;
      }
      markup += text(formatTick(tick), x, frame.bottom + 18, {
        anchor: 'middle',
        color: colors.muted,
      });
    }
  }

  // The baseline itself is one step stronger than the gridlines.
  markup +=
    `<line x1="${n(frame.left)}" y1="${n(frame.bottom)}" x2="${n(frame.right)}" ` +
    `y2="${n(frame.bottom)}" stroke="${colors.axis}" stroke-width="1"/>`;

  return markup;
}

function axisCaptions(context: Context, frame: Frame, height: number): string {
  const { spec, colors } = context;
  let markup = '';

  if (spec.xLabel) {
    markup += text(spec.xLabel, (frame.left + frame.right) / 2, height - 10, {
      anchor: 'middle',
      color: colors.muted,
      size: AXIS_SIZE,
    });
  }
  if (spec.yLabel) {
    const centerY = (frame.top + frame.bottom) / 2;
    markup += text(spec.yLabel, 0, 0, {
      anchor: 'middle',
      color: colors.muted,
      size: AXIS_SIZE,
      transform: `translate(16 ${n(centerY)}) rotate(-90)`,
    });
  }

  return markup;
}

/**
 * Thins category labels until they stop colliding. Dropping every other label
 * keeps the axis honest and readable; rotating them to 45 degrees to cram them
 * all in is the thing that makes charts look like spreadsheets.
 */
function labelStride(labels: string[], available: number): number {
  const widest = Math.max(...labels.map((label) => estimateTextWidth(label, AXIS_SIZE)), 1);
  const perLabel = available / labels.length;
  return Math.max(1, Math.ceil((widest + 10) / perLabel));
}

// ------------------------------------------------------------- cartesian series

type SeriesValues = { name: string; values: (number | null)[] };

function valueExtent(
  series: SeriesValues[],
  stacked: boolean,
  zeroBaseline: boolean,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  if (stacked) {
    const length = Math.max(...series.map((s) => s.values.length), 0);
    for (let i = 0; i < length; i += 1) {
      let positive = 0;
      let negative = 0;
      for (const s of series) {
        const value = s.values[i];
        if (value === null || value === undefined) continue;
        if (value >= 0) positive += value;
        else negative += value;
      }
      max = Math.max(max, positive);
      min = Math.min(min, negative);
    }
  } else {
    for (const s of series) {
      for (const value of s.values) {
        if (value === null || value === undefined) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (zeroBaseline) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  return { min, max };
}

/** Indices of a series' highest and lowest points — the only ones worth labelling. */
function extremeIndices(values: (number | null)[]): Set<number> {
  let maxIndex = -1;
  let minIndex = -1;
  for (const [index, value] of values.entries()) {
    if (value === null || value === undefined) continue;
    if (maxIndex === -1 || value > values[maxIndex]!) maxIndex = index;
    if (minIndex === -1 || value < values[minIndex]!) minIndex = index;
  }
  const result = new Set<number>();
  if (maxIndex !== -1) result.add(maxIndex);
  if (minIndex !== -1 && minIndex !== maxIndex) result.add(minIndex);
  return result;
}

function renderColumns(context: Context, frame: Frame, scale: Scale): RenderedChart {
  const { spec, colors, colorFor } = context;
  const { labels, series } = spec.data;
  const hits: HitRegion[] = [];
  let markup = '';

  const bandWidth = (frame.right - frame.left) / Math.max(1, labels.length);
  const zeroY =
    frame.bottom - ((0 - scale.min) / (scale.max - scale.min || 1)) * (frame.bottom - frame.top);

  const groupCount = spec.stacked ? 1 : series.length;
  const slotWidth = Math.min(
    MAX_BAR_THICKNESS,
    (bandWidth * 0.68) / groupCount - (groupCount > 1 ? SURFACE_GAP : 0),
  );
  const barWidth = Math.max(2, slotWidth);
  const groupWidth = barWidth * groupCount + SURFACE_GAP * (groupCount - 1);

  const stackTops = new Array(labels.length).fill(0);
  const stackBottoms = new Array(labels.length).fill(0);

  for (const [seriesIndex, entry] of series.entries()) {
    const color = colorFor(seriesIndex);
    const extremes = spec.showValues && !spec.stacked ? extremeIndices(entry.values) : new Set<number>();

    for (const [pointIndex, rawValue] of entry.values.entries()) {
      if (rawValue === null || rawValue === undefined) continue;

      const bandStart = frame.left + pointIndex * bandWidth;
      const groupStart = bandStart + (bandWidth - groupWidth) / 2;
      const x = spec.stacked ? groupStart : groupStart + seriesIndex * (barWidth + SURFACE_GAP);

      const toY = (value: number) =>
        frame.bottom -
        ((value - scale.min) / (scale.max - scale.min || 1)) * (frame.bottom - frame.top);

      let top: number;
      let bottom: number;
      let isEnd = true;

      if (spec.stacked) {
        if (rawValue >= 0) {
          const base = stackTops[pointIndex]!;
          bottom = toY(base);
          top = toY(base + rawValue);
          stackTops[pointIndex] = base + rawValue;
        } else {
          const base = stackBottoms[pointIndex]!;
          top = toY(base);
          bottom = toY(base + rawValue);
          stackBottoms[pointIndex] = base + rawValue;
        }
        // Only the outermost segment of a stack gets the rounded data end.
        isEnd = seriesIndex === series.length - 1;
      } else {
        top = Math.min(zeroY, toY(rawValue));
        bottom = Math.max(zeroY, toY(rawValue));
      }

      // The surface gap between stacked segments: shorten, never stroke.
      const height = Math.max(1, bottom - top - (spec.stacked ? SURFACE_GAP : 0));
      const drawTop = spec.stacked ? top + SURFACE_GAP : top;

      markup += `<path d="${barPath(
        x,
        drawTop,
        barWidth,
        height,
        isEnd ? 4 : 0,
        rawValue >= 0 ? 'top' : 'bottom',
      )}" fill="${color}"/>`;

      hits.push({
        x,
        y: drawTop,
        width: barWidth,
        height,
        seriesName: entry.name,
        label: labels[pointIndex] ?? '',
        value: rawValue,
        color,
        anchorX: x + barWidth / 2,
        anchorY: drawTop,
      });

      if (extremes.has(pointIndex)) {
        const above = rawValue >= 0;
        markup += text(formatValue(rawValue), x + barWidth / 2, above ? drawTop - 7 : bottom + 15, {
          anchor: 'middle',
          color: colors.text,
          size: 11,
          weight: 600,
        });
      }
    }
  }

  // Category labels last, so they sit above the marks in paint order.
  const stride = labelStride(labels, frame.right - frame.left);
  for (const [index, label] of labels.entries()) {
    if (index % stride !== 0) continue;
    markup += text(label, frame.left + (index + 0.5) * bandWidth, frame.bottom + 18, {
      anchor: 'middle',
      color: colors.muted,
    });
  }

  return { svg: markup, hits };
}

function renderBars(context: Context, frame: Frame, scale: Scale): RenderedChart {
  const { spec, colors, colorFor } = context;
  const { labels, series } = spec.data;
  const hits: HitRegion[] = [];
  let markup = '';

  const bandHeight = (frame.bottom - frame.top) / Math.max(1, labels.length);
  const zeroX =
    frame.left + ((0 - scale.min) / (scale.max - scale.min || 1)) * (frame.right - frame.left);

  const groupCount = spec.stacked ? 1 : series.length;
  const barHeight = Math.max(
    2,
    Math.min(MAX_BAR_THICKNESS, (bandHeight * 0.68) / groupCount - (groupCount > 1 ? SURFACE_GAP : 0)),
  );
  const groupHeight = barHeight * groupCount + SURFACE_GAP * (groupCount - 1);

  const stackRight = new Array(labels.length).fill(0);
  const stackLeft = new Array(labels.length).fill(0);

  for (const [seriesIndex, entry] of series.entries()) {
    const color = colorFor(seriesIndex);
    const extremes = spec.showValues && !spec.stacked ? extremeIndices(entry.values) : new Set<number>();

    for (const [pointIndex, rawValue] of entry.values.entries()) {
      if (rawValue === null || rawValue === undefined) continue;

      const bandStart = frame.top + pointIndex * bandHeight;
      const groupStart = bandStart + (bandHeight - groupHeight) / 2;
      const y = spec.stacked ? groupStart : groupStart + seriesIndex * (barHeight + SURFACE_GAP);

      const toX = (value: number) =>
        frame.left +
        ((value - scale.min) / (scale.max - scale.min || 1)) * (frame.right - frame.left);

      let left: number;
      let right: number;
      let isEnd = true;

      if (spec.stacked) {
        if (rawValue >= 0) {
          const base = stackRight[pointIndex]!;
          left = toX(base);
          right = toX(base + rawValue);
          stackRight[pointIndex] = base + rawValue;
        } else {
          const base = stackLeft[pointIndex]!;
          right = toX(base);
          left = toX(base + rawValue);
          stackLeft[pointIndex] = base + rawValue;
        }
        isEnd = seriesIndex === series.length - 1;
      } else {
        left = Math.min(zeroX, toX(rawValue));
        right = Math.max(zeroX, toX(rawValue));
      }

      const width = Math.max(1, right - left - (spec.stacked ? SURFACE_GAP : 0));

      markup += `<path d="${barPath(
        left,
        y,
        width,
        barHeight,
        isEnd ? 4 : 0,
        rawValue >= 0 ? 'right' : 'left',
      )}" fill="${color}"/>`;

      hits.push({
        x: left,
        y,
        width,
        height: barHeight,
        seriesName: entry.name,
        label: labels[pointIndex] ?? '',
        value: rawValue,
        color,
        anchorX: left + width / 2,
        anchorY: y,
      });

      if (extremes.has(pointIndex)) {
        markup += text(formatValue(rawValue), right + 6, y + barHeight / 2, {
          color: colors.text,
          size: 11,
          weight: 600,
          baseline: 'middle',
        });
      }
    }
  }

  const stride = labelStride(labels, (frame.bottom - frame.top) / 1.6);
  for (const [index, label] of labels.entries()) {
    if (index % stride !== 0) continue;
    markup += text(label, frame.left - 8, frame.top + (index + 0.5) * bandHeight, {
      anchor: 'end',
      color: colors.muted,
      baseline: 'middle',
    });
  }

  return { svg: markup, hits };
}

function renderLineArea(context: Context, frame: Frame, scale: Scale): RenderedChart {
  const { spec, colors, colorFor } = context;
  const { labels, series } = spec.data;
  const hits: HitRegion[] = [];
  let markup = '';

  const count = Math.max(1, labels.length);
  // A single point has no span to divide, so it sits in the middle.
  const stepX = count > 1 ? (frame.right - frame.left) / (count - 1) : 0;
  const pointX = (index: number) =>
    count > 1 ? frame.left + index * stepX : (frame.left + frame.right) / 2;
  const pointY = (value: number) =>
    frame.bottom - ((value - scale.min) / (scale.max - scale.min || 1)) * (frame.bottom - frame.top);

  const showMarkers = count <= 40;

  for (const [seriesIndex, entry] of series.entries()) {
    const color = colorFor(seriesIndex);

    // Split on nulls so a gap in the data is drawn as a gap, not bridged.
    const runs: { index: number; value: number }[][] = [];
    let run: { index: number; value: number }[] = [];
    for (const [index, value] of entry.values.entries()) {
      if (value === null || value === undefined) {
        if (run.length > 0) runs.push(run);
        run = [];
      } else {
        run.push({ index, value });
      }
    }
    if (run.length > 0) runs.push(run);

    for (const segment of runs) {
      if (spec.type === 'area' && segment.length > 1) {
        const baseline = pointY(Math.max(scale.min, 0));
        const top = segment
          .map((point, i) => `${i === 0 ? 'M' : 'L'}${n(pointX(point.index))} ${n(pointY(point.value))}`)
          .join('');
        const close =
          `L${n(pointX(segment[segment.length - 1]!.index))} ${n(baseline)}` +
          `L${n(pointX(segment[0]!.index))} ${n(baseline)}z`;
        markup += `<path d="${top}${close}" fill="${color}" fill-opacity="${AREA_OPACITY}"/>`;
      }

      const line = segment
        .map((point, i) => `${i === 0 ? 'M' : 'L'}${n(pointX(point.index))} ${n(pointY(point.value))}`)
        .join('');
      markup +=
        `<path d="${line}" fill="none" stroke="${color}" stroke-width="${LINE_WIDTH}" ` +
        `stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    for (const [index, value] of entry.values.entries()) {
      if (value === null || value === undefined) continue;
      const x = pointX(index);
      const y = pointY(value);

      if (showMarkers) {
        // The surface ring keeps a marker legible where lines cross.
        markup +=
          `<circle cx="${n(x)}" cy="${n(y)}" r="${MARKER_RADIUS}" fill="${color}" ` +
          `stroke="${colors.surface}" stroke-width="2"/>`;
      }

      hits.push({
        x: x - 10,
        y: y - 10,
        width: 20,
        height: 20,
        seriesName: entry.name,
        label: labels[index] ?? '',
        value,
        color,
        anchorX: x,
        anchorY: y,
      });
    }

    if (spec.showValues) {
      // The end of the line, which is where a reader's eye already is.
      const last = [...entry.values.entries()]
        .reverse()
        .find(([, value]) => value !== null && value !== undefined);
      if (last) {
        markup += text(formatValue(last[1]!), pointX(last[0]) + 8, pointY(last[1]!), {
          color: colors.text,
          size: 11,
          weight: 600,
          baseline: 'middle',
        });
      }
    }
  }

  const stride = labelStride(labels, frame.right - frame.left);
  for (const [index, label] of labels.entries()) {
    if (index % stride !== 0) continue;
    markup += text(label, pointX(index), frame.bottom + 18, {
      anchor: 'middle',
      color: colors.muted,
    });
  }

  return { svg: markup, hits };
}

function renderScatter(context: Context, frame: Frame): RenderedChart {
  const { spec, colors, colorFor } = context;
  const { labels, series } = spec.data;
  const hits: HitRegion[] = [];
  let markup = '';

  // In scatter the label column is the x value, so it has to be numeric.
  // `parseNumber` is used rather than `Number`, which reads "" as 0 and would
  // silently plot every text label on the y-axis as though it were the origin.
  const xValues = labels.map((label) => parseNumber(label));
  const validX = xValues.filter((value): value is number => value !== null);
  const xScale = niceScale(
    validX.length > 0 ? Math.min(...validX) : 0,
    validX.length > 0 ? Math.max(...validX) : 1,
  );

  const extent = valueExtent(series, false, spec.zeroBaseline);
  const yScale = niceScale(extent.min, extent.max);

  markup += gridAndValueAxis(context, frame, yScale, 'vertical');

  for (const tick of xScale.ticks) {
    const x =
      frame.left +
      ((tick - xScale.min) / (xScale.max - xScale.min || 1)) * (frame.right - frame.left);
    markup += text(formatTick(tick), x, frame.bottom + 18, {
      anchor: 'middle',
      color: colors.muted,
    });
  }

  for (const [seriesIndex, entry] of series.entries()) {
    const color = colorFor(seriesIndex);
    for (const [index, value] of entry.values.entries()) {
      const rawX = xValues[index];
      if (value === null || value === undefined || rawX === null || rawX === undefined) {
        continue;
      }

      const x =
        frame.left +
        ((rawX - xScale.min) / (xScale.max - xScale.min || 1)) * (frame.right - frame.left);
      const y =
        frame.bottom -
        ((value - yScale.min) / (yScale.max - yScale.min || 1)) * (frame.bottom - frame.top);

      markup +=
        `<circle cx="${n(x)}" cy="${n(y)}" r="5" fill="${color}" ` +
        `stroke="${colors.surface}" stroke-width="2"/>`;

      hits.push({
        x: x - 10,
        y: y - 10,
        width: 20,
        height: 20,
        seriesName: entry.name,
        label: labels[index] ?? '',
        value,
        color,
        anchorX: x,
        anchorY: y,
      });
    }
  }

  return { svg: markup, hits };
}

function renderPie(context: Context, frame: Frame): RenderedChart {
  const { spec, colors } = context;
  const { labels, series } = spec.data;
  const hits: HitRegion[] = [];
  let markup = '';

  const entry = series[0];
  if (!entry) return { svg: '', hits };

  // A pie of negatives is meaningless, so only positive parts of one whole count.
  const slices = labels
    .map((label, index) => ({ label, value: entry.values[index] ?? 0 }))
    .filter((slice) => slice.value !== null && slice.value > 0) as {
    label: string;
    value: number;
  }[];

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return { svg: '', hits };

  const centerX = (frame.left + frame.right) / 2;
  const centerY = (frame.top + frame.bottom) / 2;
  const radius = Math.max(10, Math.min(frame.right - frame.left, frame.bottom - frame.top) / 2 - 10);
  const innerRadius = spec.type === 'donut' ? radius * 0.58 : 0;

  let angle = -Math.PI / 2;

  for (const [index, slice] of slices.entries()) {
    const sweep = (slice.value / total) * Math.PI * 2;
    const end = angle + sweep;
    const color = seriesColor(spec.palette, spec.theme, index, slices.length);

    const x1 = centerX + radius * Math.cos(angle);
    const y1 = centerY + radius * Math.sin(angle);
    const x2 = centerX + radius * Math.cos(end);
    const y2 = centerY + radius * Math.sin(end);
    const largeArc = sweep > Math.PI ? 1 : 0;

    let path: string;
    if (innerRadius > 0) {
      const ix1 = centerX + innerRadius * Math.cos(end);
      const iy1 = centerY + innerRadius * Math.sin(end);
      const ix2 = centerX + innerRadius * Math.cos(angle);
      const iy2 = centerY + innerRadius * Math.sin(angle);
      path =
        `M${n(x1)} ${n(y1)}A${n(radius)} ${n(radius)} 0 ${largeArc} 1 ${n(x2)} ${n(y2)}` +
        `L${n(ix1)} ${n(iy1)}A${n(innerRadius)} ${n(innerRadius)} 0 ${largeArc} 0 ${n(ix2)} ${n(iy2)}z`;
    } else {
      path =
        `M${n(centerX)} ${n(centerY)}L${n(x1)} ${n(y1)}` +
        `A${n(radius)} ${n(radius)} 0 ${largeArc} 1 ${n(x2)} ${n(y2)}z`;
    }

    // The surface-coloured stroke is the 2px gap between slices, not a border.
    markup +=
      `<path d="${path}" fill="${color}" stroke="${colors.surface}" ` +
      `stroke-width="${SURFACE_GAP}"/>`;

    const midAngle = angle + sweep / 2;
    const labelRadius = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.68;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);

    hits.push({
      x: labelX - 18,
      y: labelY - 18,
      width: 36,
      height: 36,
      seriesName: entry.name,
      label: slice.label,
      value: slice.value,
      color,
      anchorX: labelX,
      anchorY: labelY,
    });

    // Only label a slice with room for the text; the legend carries the rest.
    const share = slice.value / total;
    if (spec.showValues && share > 0.06) {
      const percentage = `${(share * 100).toFixed(share >= 0.1 ? 0 : 1)}%`;
      markup += text(percentage, labelX, labelY, {
        anchor: 'middle',
        color: '#ffffff',
        size: 12,
        weight: 600,
        baseline: 'middle',
      });
    }

    angle = end;
  }

  if (spec.type === 'donut') {
    markup += text(formatValue(total), centerX, centerY - 4, {
      anchor: 'middle',
      color: colors.text,
      size: 22,
      weight: 600,
      baseline: 'middle',
    });
    markup += text('total', centerX, centerY + 16, {
      anchor: 'middle',
      color: colors.muted,
      size: 12,
      baseline: 'middle',
    });
  }

  return { svg: markup, hits };
}

// -------------------------------------------------------------------- entry

export function renderChart(spec: ChartSpec): RenderedChart {
  const colors = chartColors[spec.theme];
  const seriesCount = spec.data.series.length;

  const context: Context = {
    spec,
    colors,
    seriesCount,
    colorFor: (index) => seriesColor(spec.palette, spec.theme, index, seriesCount),
  };

  const header = renderHeader(spec, colors);

  // Pies name their slices, not their columns, so that is what the legend lists.
  const legendNames = isCircular(spec.type)
    ? spec.data.labels.filter((_, index) => {
        const value = spec.data.series[0]?.values[index];
        return value !== null && value !== undefined && value > 0;
      })
    : spec.data.series.map((entry) => entry.name);

  const legendColors = isCircular(spec.type)
    ? (index: number) => seriesColor(spec.palette, spec.theme, index, legendNames.length)
    : context.colorFor;

  const legend = spec.showLegend
    ? renderLegend({ ...context, colorFor: legendColors }, legendNames, header.y, spec.width)
    : { markup: '', height: 0 };

  const plotTop = header.y + legend.height + (legend.height > 0 ? 8 : 0);

  let body = '';
  let hits: HitRegion[] = [];

  if (isCircular(spec.type)) {
    const frame: Frame = {
      left: 20,
      right: spec.width - 20,
      top: plotTop,
      bottom: spec.height - 20,
    };
    const rendered = renderPie(context, frame);
    body = rendered.svg;
    hits = rendered.hits;
  } else if (spec.type === 'scatter') {
    const frame: Frame = {
      left: 62 + (spec.yLabel ? 18 : 0),
      right: spec.width - 24,
      top: plotTop,
      bottom: spec.height - 34 - (spec.xLabel ? 20 : 0),
    };
    const rendered = renderScatter(context, frame);
    body = rendered.svg + axisCaptions(context, frame, spec.height);
    hits = rendered.hits;
  } else if (spec.type === 'bar') {
    const widestLabel = Math.max(
      ...spec.data.labels.map((label) => estimateTextWidth(label, AXIS_SIZE)),
      40,
    );
    const frame: Frame = {
      left: Math.min(widestLabel + 16, spec.width * 0.38) + (spec.yLabel ? 18 : 0),
      right: spec.width - 44,
      top: plotTop,
      bottom: spec.height - 34 - (spec.xLabel ? 20 : 0),
    };
    const extent = valueExtent(spec.data.series, spec.stacked, true);
    const scale = niceScale(extent.min, extent.max);
    const rendered = renderBars(context, frame, scale);
    body =
      gridAndValueAxis(context, frame, scale, 'horizontal') +
      rendered.svg +
      axisCaptions(context, frame, spec.height);
    hits = rendered.hits;
  } else {
    const zeroBaseline = requiresZeroBaseline(spec.type) || spec.zeroBaseline;
    const extent = valueExtent(spec.data.series, spec.stacked, zeroBaseline);
    const scale = niceScale(extent.min, extent.max);

    const widestTick = Math.max(
      ...scale.ticks.map((tick) => estimateTextWidth(formatTick(tick), AXIS_SIZE)),
      20,
    );
    const frame: Frame = {
      left: widestTick + 16 + (spec.yLabel ? 18 : 0),
      right: spec.width - 24,
      top: plotTop,
      bottom: spec.height - 34 - (spec.xLabel ? 20 : 0),
    };

    const rendered =
      spec.type === 'column'
        ? renderColumns(context, frame, scale)
        : renderLineArea(context, frame, scale);

    body =
      gridAndValueAxis(context, frame, scale, 'vertical') +
      rendered.svg +
      axisCaptions(context, frame, spec.height);
    hits = rendered.hits;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" ` +
    `viewBox="0 0 ${spec.width} ${spec.height}" role="img">` +
    `<title>${escapeXml(spec.title || 'Chart')}</title>` +
    `<rect width="${spec.width}" height="${spec.height}" fill="${colors.surface}"/>` +
    header.markup +
    legend.markup +
    body +
    `</svg>`;

  return { svg, hits };
}

export function chartToSvgBlob(spec: ChartSpec): Blob {
  return new Blob([renderChart(spec).svg], { type: 'image/svg+xml' });
}

/**
 * Rasterises the SVG through an <img>, at a device-independent scale so a chart
 * dropped into a deck is sharp rather than the 96-DPI blur a screenshot gives.
 */
export async function chartToPng(spec: ChartSpec, scale = 2): Promise<Blob> {
  const svg = renderChart(spec).svg;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The chart could not be rendered to an image.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(spec.width * scale);
    canvas.height = Math.round(spec.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not open a 2D canvas.');

    context.fillStyle = chartColors[spec.theme].surface;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG.'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
