'use client';

import { chartColors } from './palette';
import { formatNumber, type FormatOptions } from './apex';
import type { ChartTheme } from './types';

/**
 * The custom chart tooltip.
 *
 * ApexCharts' default tooltip shows a value and its series name. That is fine
 * until someone needs to answer the question a tooltip is usually opened for —
 * "is that a lot?" — which needs context the point alone does not carry. This
 * one adds the share of the stacked total, the change from the previous point,
 * and a proportion bar, so the comparison is made for the reader rather than
 * left to them.
 *
 * It returns an HTML string because that is Apex's contract for a custom
 * tooltip. Everything interpolated is either a number or escaped, and colours
 * come from our own palette rather than the data.
 */

export type TooltipExtras = {
  /** Show each series' share of the point's total. */
  shareOfTotal?: boolean;
  /** Show the change against the previous category. */
  delta?: boolean;
  /** A proportion bar behind each row. */
  bar?: boolean;
};

export type TooltipContext = {
  theme: ChartTheme;
  colors: string[];
  format: FormatOptions;
  extras: TooltipExtras;
  /** Replaces the whole body for a chart with its own needs. */
  render?: (input: TooltipRenderInput) => string;
};

export type TooltipRenderInput = {
  category: string;
  rows: { name: string; value: number; color: string }[];
  total: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type ApexTooltipArgs = {
  series: number[][];
  seriesIndex: number;
  dataPointIndex: number;
  w: {
    globals: {
      seriesNames?: string[];
      labels?: (string | number)[];
      categoryLabels?: (string | number)[];
      colors?: string[];
    };
    config?: { tooltip?: { shared?: boolean } };
  };
};

/** Builds the `tooltip.custom` function Apex expects. */
export function buildTooltip(context: TooltipContext) {
  const surface = chartColors[context.theme];

  return ({ series, seriesIndex, dataPointIndex, w }: ApexTooltipArgs): string => {
    const globals = w.globals;
    const shared = w.config?.tooltip?.shared !== false;

    const names = globals.seriesNames ?? [];
    const labelSource = globals.categoryLabels?.length ? globals.categoryLabels : globals.labels;
    const category = String(labelSource?.[dataPointIndex] ?? '');

    const indices = shared ? series.map((_, index) => index) : [seriesIndex];

    const rows = indices
      .map((index) => ({
        name: String(names[index] ?? `Series ${index + 1}`),
        value: Number(series[index]?.[dataPointIndex] ?? NaN),
        color: context.colors[index] ?? surface.text,
        previous: Number(series[index]?.[dataPointIndex - 1] ?? NaN),
      }))
      .filter((row) => Number.isFinite(row.value));

    if (rows.length === 0) return '';

    const total = rows.reduce((sum, row) => sum + Math.abs(row.value), 0);
    const largest = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

    if (context.render) {
      return context.render({ category, rows, total });
    }

    const body = rows
      .map((row) => {
        const share = total > 0 ? (Math.abs(row.value) / total) * 100 : 0;

        const delta =
          context.extras.delta && Number.isFinite(row.previous) && row.previous !== 0
            ? ((row.value - row.previous) / Math.abs(row.previous)) * 100
            : null;

        const deltaMarkup =
          delta === null
            ? ''
            : `<span style="color:${
                delta >= 0 ? surface.text : surface.muted
              };font-size:11px;margin-left:6px">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(
                1,
              )}%</span>`;

        const barMarkup = context.extras.bar
          ? `<div style="height:3px;border-radius:2px;background:${surface.grid};margin-top:4px;overflow:hidden">
               <div style="height:100%;width:${(Math.abs(row.value) / largest) * 100}%;background:${row.color}"></div>
             </div>`
          : '';

        const shareMarkup =
          context.extras.shareOfTotal && rows.length > 1
            ? `<div style="color:${surface.muted};font-size:11px;margin-top:2px">${share.toFixed(1)}% of this point</div>`
            : '';

        return `
          <div style="padding:6px 10px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:8px;height:8px;border-radius:9px;background:${row.color};flex:none"></span>
              <span style="color:${surface.muted};font-size:12px;flex:1">${escapeHtml(row.name)}</span>
              <span style="color:${surface.text};font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">
                ${escapeHtml(formatNumber(row.value, context.format))}${deltaMarkup}
              </span>
            </div>
            ${shareMarkup}
            ${barMarkup}
          </div>`;
      })
      .join('');

    const footer =
      rows.length > 1
        ? `<div style="border-top:1px solid ${surface.grid};padding:6px 10px;display:flex;justify-content:space-between">
             <span style="color:${surface.muted};font-size:11px">Total</span>
             <span style="color:${surface.text};font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">
               ${escapeHtml(formatNumber(rows.reduce((sum, row) => sum + row.value, 0), context.format))}
             </span>
           </div>`
        : '';

    return `
      <div style="
        background:${surface.surface};
        border:1px solid ${surface.grid};
        border-radius:12px;
        box-shadow:0 8px 24px -12px rgba(0,0,0,.35);
        overflow:hidden;
        min-width:180px;
        max-width:280px;
        font-family:var(--font-inter),ui-sans-serif,system-ui,sans-serif;
      ">
        ${
          category
            ? `<div style="padding:8px 10px 4px;color:${surface.text};font-size:12px;font-weight:600">${escapeHtml(
                category,
              )}</div>`
            : ''
        }
        ${body}
        ${footer}
      </div>`;
  };
}
