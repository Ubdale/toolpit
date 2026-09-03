'use client';

import type { ApexOptions } from 'apexcharts';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  apexType,
  baseOptions,
  formatNumber,
  isCircularKind,
  isStacked,
  isStacked100,
  loadApex,
  needsZeroBaseline,
  paletteColors,
  type ChartKind,
  type FormatOptions,
  type NamedPalette,
} from '@/lib/chart/apex';
import { buildTooltip, type TooltipExtras, type TooltipRenderInput } from '@/lib/chart/tooltip';
import type { ChartTheme } from '@/lib/chart/types';
import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The single ApexCharts wrapper. No page talks to ApexCharts directly.
 *
 * Everything the library needs is derived here from a small declarative spec —
 * which means a page asks for "a 100% stacked column chart with compact
 * currency labels" rather than assembling twelve nested option objects, and
 * every chart in the app gets the same theme, palette, tooltip and states
 * without repeating them.
 *
 * The instance is created once and updated in place. Re-creating an ApexCharts
 * on every render is the usual cause of charts that flicker, lose their zoom,
 * and leak listeners.
 */

export type ChartSeries = {
  name: string;
  data: (number | null)[] | { x: unknown; y: unknown }[];
  /** For combo charts: overrides the chart-level form for this series. */
  type?: 'line' | 'column' | 'area';
  color?: string;
};

export type ChartAnnotation =
  | { kind: 'yLine'; value: number; label?: string; color?: string; dashed?: boolean }
  | { kind: 'xLine'; value: number | string; label?: string; color?: string; dashed?: boolean }
  | { kind: 'yRange'; from: number; to: number; label?: string; color?: string }
  | { kind: 'point'; x: number | string; y: number; label?: string; color?: string };

export type ChartSpec = {
  kind: ChartKind;
  series: ChartSeries[];
  /** Category labels for the x axis, or slice labels for circular forms. */
  categories?: (string | number)[];
  theme: ChartTheme;
  palette?: NamedPalette;

  title?: string;
  subtitle?: string;
  xTitle?: string;
  yTitle?: string;

  height?: number;
  /** Value formatting for labels, axes and the tooltip. */
  format?: FormatOptions;

  legend?: { show: boolean; position?: 'top' | 'right' | 'bottom' | 'left'; align?: 'left' | 'center' | 'right' };
  dataLabels?: boolean;
  grid?: boolean;
  /** Force the value axis to start at zero. Bars always do. */
  zeroBaseline?: boolean;
  logScale?: boolean;
  yMin?: number;
  yMax?: number;
  tickCount?: number;
  /** Degrees to rotate x-axis labels. */
  labelRotation?: number;

  annotations?: ChartAnnotation[];
  tooltipExtras?: TooltipExtras;
  /** Replaces the tooltip body entirely for one chart. */
  renderTooltip?: (input: TooltipRenderInput) => string;

  toolbar?: boolean;
  zoom?: boolean;
  /** Renders with no axes, grid or legend — for a stat tile. */
  sparkline?: boolean;
  /** Shares a cursor with other charts carrying the same group id. */
  syncGroup?: string;
  /** Responsive overrides, keyed by max viewport width. */
  responsive?: { breakpoint: number; options: ApexOptions }[];
};

export type ChartProps = {
  spec: ChartSpec;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
  /** Fired when a data point is clicked, for drill-down. */
  onPointClick?: (point: { seriesIndex: number; dataPointIndex: number; series: string; category: string | number; value: number }) => void;
  onLegendClick?: (seriesName: string, index: number) => void;
};

const DEFAULT_FORMAT: FormatOptions = { format: 'plain' };

/** The slice of the ApexCharts instance this wrapper actually touches. */
type ApexInstance = {
  render: () => Promise<void>;
  destroy: () => void;
  updateOptions: (options: unknown, redraw?: boolean, animate?: boolean) => void;
};

/** Translates the spec into the option tree ApexCharts wants. */
function buildOptions(spec: ChartSpec, onPointClick?: ChartProps['onPointClick'], onLegendClick?: ChartProps['onLegendClick']): ApexOptions {
  const format = spec.format ?? DEFAULT_FORMAT;
  const colors = paletteColors(spec.palette ?? 'categorical', spec.theme, Math.max(spec.series.length, spec.categories?.length ?? 1));
  const base = baseOptions(spec.theme);
  const sparkline = spec.sparkline || spec.kind === 'sparkline';

  const options: ApexOptions = {
    ...base,
    colors,
    series: spec.series as ApexOptions['series'],
    chart: {
      ...base.chart,
      type: apexType(spec.kind) as never,
      height: spec.height ?? 360,
      stacked: isStacked(spec.kind),
      stackType: isStacked100(spec.kind) ? '100%' : undefined,
      group: spec.syncGroup,
      sparkline: { enabled: sparkline },
      zoom: { enabled: spec.zoom ?? (!sparkline && !isCircularKind(spec.kind)) },
      toolbar: {
        ...base.chart?.toolbar,
        show: spec.toolbar ?? (!sparkline && !isCircularKind(spec.kind)),
      },
      events: {
        dataPointSelection: (_event, _ctx, config) => {
          const seriesIndex = Number(config?.seriesIndex ?? -1);
          const pointIndex = Number(config?.dataPointIndex ?? -1);
          if (seriesIndex < 0 || pointIndex < 0) return;
          const raw = spec.series[seriesIndex]?.data?.[pointIndex];
          onPointClick?.({
            seriesIndex,
            dataPointIndex: pointIndex,
            series: spec.series[seriesIndex]?.name ?? '',
            category: spec.categories?.[pointIndex] ?? pointIndex,
            value: typeof raw === 'number' ? raw : Number((raw as { y?: number })?.y ?? NaN),
          });
        },
        legendClick: (_ctx, index) => {
          if (typeof index === 'number') onLegendClick?.(spec.series[index]?.name ?? '', index);
        },
      },
    },
  };

  // --- the shapes each form needs
  if (spec.kind === 'spline') options.stroke = { ...base.stroke, curve: 'smooth' };
  if (spec.kind === 'stepline') options.stroke = { ...base.stroke, curve: 'stepline' };

  if (['bar', 'barStacked', 'barStacked100', 'funnel', 'pyramid'].includes(spec.kind)) {
    options.plotOptions = {
      ...options.plotOptions,
      bar: {
        horizontal: true,
        borderRadius: 4,
        borderRadiusApplication: 'end',
        // A funnel is a centred horizontal bar; a pyramid is the same reversed.
        isFunnel: spec.kind === 'funnel',
        isFunnel3d: false,
        ...(spec.kind === 'pyramid' ? { isFunnel: true } : {}),
      },
    };
    if (spec.kind === 'pyramid') {
      options.series = [...spec.series].map((s) => ({
        ...s,
        data: [...(s.data as number[])].reverse(),
      })) as ApexOptions['series'];
    }
  }

  if (['column', 'columnStacked', 'columnStacked100'].includes(spec.kind)) {
    options.plotOptions = {
      ...options.plotOptions,
      bar: { horizontal: false, borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '60%' },
    };
  }

  if (spec.kind === 'semiDonut') {
    options.plotOptions = {
      ...options.plotOptions,
      pie: { startAngle: -90, endAngle: 90, donut: { size: '62%' } },
    };
  }

  if (spec.kind === 'radialBar' || spec.kind === 'radialBarMulti') {
    options.plotOptions = {
      ...options.plotOptions,
      radialBar: {
        hollow: { size: spec.kind === 'radialBarMulti' ? '40%' : '58%' },
        track: { background: baseOptions(spec.theme).grid?.borderColor },
        dataLabels: { name: { fontSize: '13px' }, value: { fontSize: '20px', fontWeight: 600 } },
      },
    };
  }

  if (spec.kind === 'slope') {
    options.stroke = { ...base.stroke, width: 2 };
    options.markers = { size: 5, hover: { size: 7 } };
  }

  // --- circular forms take labels rather than an x axis
  if (isCircularKind(spec.kind)) {
    // Pie, donut, polar area and radial bar take a flat array of numbers with a
    // parallel `labels` array — not the {name, data} series shape every other
    // type uses. Passing the wrong one throws inside Apex's renderer.
    const first = spec.series[0];
    const flat = Array.isArray(first?.data)
      ? (first.data as (number | null)[]).map((value) =>
          typeof value === 'number' ? value : Number((value as unknown as { y?: number })?.y ?? 0),
        )
      : [];

    options.series = flat as unknown as ApexOptions['series'];
    options.labels = (spec.categories ?? []).map(String);
    options.grid = { ...base.grid, show: false };

    // A radial bar reads its values as percentages, so raw magnitudes are
    // scaled against the largest rather than clipped at 100.
    if (spec.kind === 'radialBar' || spec.kind === 'radialBarMulti') {
      const peak = Math.max(...flat.map((n) => Math.abs(n)), 1);
      options.series = flat.map((n) =>
        Math.round((Math.abs(n) / peak) * 100),
      ) as unknown as ApexOptions['series'];
    }

    delete (options as { xaxis?: unknown }).xaxis;
    delete (options as { yaxis?: unknown }).yaxis;
  } else {
    // Assigning `title: undefined` replaces Apex's own default object, and
    // its axis renderer then reads `.text` off nothing. The key is omitted
    // entirely when there is no title rather than set to undefined.
    options.xaxis = {
      ...base.xaxis,
      categories: spec.categories,
      ...(spec.xTitle
        ? { title: { text: spec.xTitle, style: { fontSize: '12px', fontWeight: 500 } } }
        : {}),
      labels: {
        ...base.xaxis?.labels,
        rotate: spec.labelRotation ?? 0,
        rotateAlways: Boolean(spec.labelRotation),
        hideOverlappingLabels: true,
      },
    };

    options.yaxis = {
      ...base.yaxis,
      ...(spec.yTitle
        ? { title: { text: spec.yTitle, style: { fontSize: '12px', fontWeight: 500 } } }
        : {}),
      // Bars are only honest from zero, so the option is not offered for them.
      min: needsZeroBaseline(spec.kind) ? 0 : spec.zeroBaseline ? 0 : spec.yMin,
      max: spec.yMax,
      tickAmount: spec.tickCount,
      logarithmic: spec.logScale,
      labels: {
        formatter: (value: number) => formatNumber(value, format),
        style: { colors: baseOptions(spec.theme).xaxis?.labels?.style?.colors, fontSize: '12px' },
      },
    };
  }

  options.grid = { ...(options.grid ?? base.grid), show: spec.grid ?? !sparkline };

  options.dataLabels = {
    enabled: spec.dataLabels ?? false,
    formatter: (value: number) => formatNumber(Number(value), format),
    style: { fontSize: '11px', fontWeight: 600 },
    dropShadow: { enabled: false },
  };

  options.legend = {
    ...base.legend,
    show:
      (spec.legend?.show ?? (spec.series.length > 1 || isCircularKind(spec.kind))) && !sparkline,
    position: spec.legend?.position ?? 'top',
    horizontalAlign: spec.legend?.align ?? 'left',
  };

  if (spec.title) {
    options.title = { text: spec.title, style: { fontSize: '15px', fontWeight: '600' } };
  }
  if (spec.subtitle) {
    options.subtitle = { text: spec.subtitle, style: { fontSize: '12px' } };
  }

  // --- annotations
  if (spec.annotations?.length) {
    options.annotations = {
      yaxis: spec.annotations
        .filter((a) => a.kind === 'yLine' || a.kind === 'yRange')
        .map((a) =>
          a.kind === 'yLine'
            ? {
                y: a.value,
                borderColor: a.color ?? colors[0],
                strokeDashArray: a.dashed === false ? 0 : 4,
                label: a.label ? { text: a.label, style: { fontSize: '11px' } } : undefined,
              }
            : {
                y: a.from,
                y2: a.to,
                fillColor: a.color ?? colors[0],
                opacity: 0.12,
                label: a.label ? { text: a.label, style: { fontSize: '11px' } } : undefined,
              },
        ),
      xaxis: spec.annotations
        .filter((a): a is Extract<ChartAnnotation, { kind: 'xLine' }> => a.kind === 'xLine')
        .map((a) => ({
          x: a.value,
          borderColor: a.color ?? colors[1] ?? colors[0],
          strokeDashArray: a.dashed === false ? 0 : 4,
          label: a.label ? { text: a.label, style: { fontSize: '11px' } } : undefined,
        })),
      points: spec.annotations
        .filter((a): a is Extract<ChartAnnotation, { kind: 'point' }> => a.kind === 'point')
        .map((a) => ({
          x: a.x,
          y: a.y,
          marker: { size: 5, fillColor: a.color ?? colors[0] },
          label: a.label ? { text: a.label, style: { fontSize: '11px' } } : undefined,
        })),
    };
  }

  // --- the custom tooltip
  options.tooltip = {
    enabled: true,
    shared: !isCircularKind(spec.kind) && spec.series.length > 1,
    intersect: false,
    followCursor: true,
    custom: isCircularKind(spec.kind)
      ? undefined
      : (buildTooltip({
          theme: spec.theme,
          colors,
          format,
          extras: spec.tooltipExtras ?? { shareOfTotal: true, delta: true, bar: true },
          render: spec.renderTooltip,
        }) as never),
  };

  if (spec.responsive?.length) {
    options.responsive = spec.responsive;
  }

  return options;
}

export function Chart({
  spec,
  loading,
  error,
  emptyMessage = 'Nothing to plot yet',
  className,
  onPointClick,
  onLegendClick,
}: ChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<{ updateOptions: (o: unknown, r?: boolean, a?: boolean) => void; destroy: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isEmpty = spec.series.length === 0 || spec.series.every((s) => s.data.length === 0);
  const options = useMemo(
    () => buildOptions(spec, onPointClick, onLegendClick),
    [spec, onPointClick, onLegendClick],
  );

  // Create once; update in place afterwards.
  useEffect(() => {
    if (isEmpty || error) return;
    let cancelled = false;
    let chart: ApexInstance | null = null;

    loadApex()
      .then((ApexCharts) => {
        if (cancelled || !hostRef.current) return;
        chart = new ApexCharts(hostRef.current, options as never) as unknown as ApexInstance;
        instanceRef.current = chart;
        return chart.render();
      })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'The charting engine failed to load.');
        }
      });

    return () => {
      cancelled = true;
      chart?.destroy();
      instanceRef.current = null;
      setReady(false);
    };
    // Only the host's identity should tear the chart down; option changes are
    // applied by the effect below without a re-create.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, error]);

  useEffect(() => {
    if (!ready || !instanceRef.current) return;
    instanceRef.current.updateOptions(options, true, true);
  }, [options, ready]);

  if (error || loadError) {
    return (
      <State className={className} tone="danger" icon="error">
        {error ?? loadError}
      </State>
    );
  }

  if (loading) {
    return (
      <div
        className={cn('grid place-items-center rounded-xl border border-line bg-sunken', className)}
        style={{ height: spec.height ?? 360 }}
        role="status"
        aria-label="Loading chart"
      >
        <span className="flex items-center gap-2 text-sm text-muted">
          <Icon name="refresh" size={18} className="motion-safe:animate-spin" />
          Drawing…
        </span>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <State className={className} icon="chartBar">
        {emptyMessage}
      </State>
    );
  }

  return <div ref={hostRef} className={cn('w-full', className)} />;
}

function State({
  children,
  className,
  icon,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  icon: 'error' | 'chartBar';
  tone?: 'danger';
}) {
  return (
    <div
      className={cn(
        'grid min-h-56 place-items-center rounded-xl border border-line bg-sunken p-6 text-center',
        className,
      )}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <span className={cn('flex flex-col items-center gap-2 text-sm', tone === 'danger' ? 'text-danger' : 'text-muted')}>
        <Icon name={icon} size={24} />
        {children}
      </span>
    </div>
  );
}
