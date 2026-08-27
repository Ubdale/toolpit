'use client';

import { copyBytes, loadPdfJs } from '@/lib/pdf/runtime';

import type { SheetTable } from './runtime';

export type ExtractOptions = {
  /** One worksheet per page, or everything stacked into one. */
  sheetPerPage: boolean;
  /**
   * How far apart two pieces of text must be, in points, before they count as
   * different cells rather than words in the same one.
   */
  columnGap: number;
  /** Zero-based page indices; defaults to every page. */
  pageIndices?: number[];
};

export const defaultExtractOptions: ExtractOptions = {
  sheetPerPage: true,
  columnGap: 12,
};

type Fragment = { text: string; x: number; y: number; height: number; width: number };

/** Groups fragments into visual rows by their baseline. */
function groupRows(fragments: Fragment[]): Fragment[][] {
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Fragment[][] = [];

  for (const fragment of sorted) {
    const last = rows[rows.length - 1];
    // Half a line height of slack absorbs the sub-pixel baseline drift that
    // makes a visually straight row arrive at several different y values.
    const tolerance = Math.max(2, fragment.height * 0.5);
    if (last && Math.abs(last[0]!.y - fragment.y) <= tolerance) last.push(fragment);
    else rows.push([fragment]);
  }

  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/** Merges fragments in a row into cells, splitting on wide horizontal gaps. */
function rowToCells(row: Fragment[], columnGap: number): { x: number; text: string }[] {
  const cells: { x: number; text: string }[] = [];
  let current: { x: number; text: string; right: number } | null = null;

  for (const fragment of row) {
    if (!fragment.text.trim()) continue;

    if (current && fragment.x - current.right < columnGap) {
      // Close enough to be the same cell. Insert a space only when the glyphs
      // are not already touching, so "Total" does not become "T o t a l".
      const needsSpace = fragment.x - current.right > 0.8 && !current.text.endsWith(' ');
      current.text += (needsSpace ? ' ' : '') + fragment.text;
      current.right = fragment.x + fragment.width;
    } else {
      if (current) cells.push({ x: current.x, text: current.text.trim() });
      current = {
        x: fragment.x,
        text: fragment.text,
        right: fragment.x + fragment.width,
      };
    }
  }

  if (current) cells.push({ x: current.x, text: current.text.trim() });
  return cells.filter((cell) => cell.text.length > 0);
}

/**
 * Finds column positions shared across the page.
 *
 * Cells that start at nearly the same x on many different rows are a column.
 * Clustering the left edges globally — rather than treating each row
 * independently — is what keeps a value under its own heading when some rows
 * have blanks in the middle.
 */
function findColumns(rows: { x: number; text: string }[][], tolerance: number): number[] {
  const edges = rows.flat().map((cell) => cell.x).sort((a, b) => a - b);
  const columns: number[] = [];
  let group: number[] = [];

  for (const edge of edges) {
    if (group.length === 0 || edge - group[group.length - 1]! <= tolerance) {
      group.push(edge);
    } else {
      columns.push(group.reduce((sum, value) => sum + value, 0) / group.length);
      group = [edge];
    }
  }
  if (group.length > 0) {
    columns.push(group.reduce((sum, value) => sum + value, 0) / group.length);
  }

  return columns;
}

export type ExtractResult = {
  tables: SheetTable[];
  /** Pages that yielded no text at all — almost always scans. */
  emptyPages: number[];
};

/**
 * Reconstructs tables from a PDF's text layer.
 *
 * A PDF has no notion of a table: it has glyphs at coordinates. So the grid is
 * inferred — fragments are grouped into rows by baseline, split into cells on
 * horizontal gaps, and aligned into columns by clustering their left edges
 * across the whole page.
 *
 * That works well on the machine-generated documents people actually need to
 * get back into a spreadsheet (invoices, statements, exports) and less well on
 * heavily designed layouts. A scanned PDF has no text layer at all, so those
 * pages are reported rather than silently returned empty.
 */
export async function pdfToTables(
  bytes: Uint8Array,
  options: ExtractOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractResult> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: copyBytes(bytes) });
  const doc = await task.promise;

  try {
    const indices =
      options.pageIndices ?? Array.from({ length: doc.numPages }, (_, i) => i);

    const tables: SheetTable[] = [];
    const emptyPages: number[] = [];
    const combined: string[][] = [];

    for (const [step, index] of indices.entries()) {
      const page = await doc.getPage(index + 1);
      const content = await page.getTextContent();

      const fragments: Fragment[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str;
        if (!text) continue;
        fragments.push({
          text,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          width: item.width,
          height: item.height || 10,
        });
      }

      page.cleanup();

      if (fragments.length === 0) {
        emptyPages.push(index + 1);
        onProgress?.(step + 1, indices.length);
        continue;
      }

      const cellRows = groupRows(fragments).map((row) => rowToCells(row, options.columnGap));
      const columns = findColumns(cellRows, options.columnGap);

      const grid = cellRows
        .map((row) => {
          const line = Array.from({ length: columns.length }, () => '');
          for (const cell of row) {
            // Nearest column wins; ties go left, which matches reading order.
            let best = 0;
            let bestDistance = Infinity;
            for (const [i, position] of columns.entries()) {
              const distance = Math.abs(position - cell.x);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = i;
              }
            }
            line[best] = line[best] ? `${line[best]} ${cell.text}` : cell.text;
          }
          return line;
        })
        .filter((line) => line.some((cell) => cell.length > 0));

      if (options.sheetPerPage) {
        tables.push({ name: `Page ${index + 1}`, rows: grid });
      } else {
        combined.push(...grid);
      }

      onProgress?.(step + 1, indices.length);
    }

    if (!options.sheetPerPage && combined.length > 0) {
      const width = combined.reduce((max, row) => Math.max(max, row.length), 0);
      tables.push({
        name: 'Extracted',
        rows: combined.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? '')),
      });
    }

    return { tables, emptyPages };
  } finally {
    await task.destroy();
  }
}
