'use client';

import { loadPdfLib } from '@/lib/pdf/runtime';

import { toWinAnsi } from './encoding';
import type { SheetTable } from './runtime';

export type SheetPdfOptions = {
  pageSize: 'a4' | 'letter';
  landscape: boolean;
  /** Repeat the first row of each sheet at the top of every page. */
  repeatHeader: boolean;
  gridlines: boolean;
  /**
   * Split a sheet too wide for one page across several column bands instead of
   * shrinking it into illegibility.
   */
  bandWideSheets: boolean;
};

export const defaultSheetPdfOptions: SheetPdfOptions = {
  pageSize: 'a4',
  landscape: true,
  repeatHeader: true,
  gridlines: true,
  bandWideSheets: true,
};

const SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

const MARGIN = 36;
const FONT_SIZE = 8.5;
const LINE_HEIGHT = 12;
const CELL_PADDING = 4;
/** Below this, text is too small to read; band the sheet instead of shrinking. */
const MIN_SCALE = 0.62;

export type SheetPdfResult = {
  bytes: Uint8Array;
  /** Characters that had to be approximated to fit the PDF font's encoding. */
  substitutions: number;
  /** Sheets that were split across column bands to stay readable. */
  bandedSheets: string[];
};

/**
 * Renders spreadsheet tables into a PDF.
 *
 * This is a *readable report*, not a pixel-perfect recreation of the workbook —
 * there is no styling, merged-cell or chart information to recreate from values
 * alone, and pretending otherwise would produce something subtly wrong. What it
 * does guarantee: every cell's text is present, columns line up, and long or
 * wide sheets paginate rather than getting cropped or crushed.
 */
export async function tablesToPdf(
  tables: SheetTable[],
  options: SheetPdfOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<SheetPdfResult> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();

  const document_ = await PDFDocument.create();
  document_.setCreator('Toolpit');
  document_.setProducer('Toolpit — processed on your device');

  const body = await document_.embedFont(StandardFonts.Helvetica);
  const bold = await document_.embedFont(StandardFonts.HelveticaBold);

  const [shortSide, longSide] = SIZES[options.pageSize];
  const pageWidth = options.landscape ? longSide : shortSide;
  const pageHeight = options.landscape ? shortSide : longSide;
  const usableWidth = pageWidth - MARGIN * 2;

  const ink = rgb(0.1, 0.09, 0.07);
  const rule = rgb(0.82, 0.8, 0.76);
  const headerFill = rgb(0.96, 0.95, 0.93);

  // Every cell is sanitised once, up front: the standard PDF fonts cannot
  // encode arrows, check marks or CJK, and pdf-lib throws rather than draw the
  // wrong glyph.
  let substitutions = 0;
  const clean: SheetTable[] = tables.map((table) => ({
    name: toWinAnsi(table.name).text,
    rows: table.rows.map((row) =>
      row.map((cell) => {
        const result = toWinAnsi(cell);
        substitutions += result.substitutions;
        return result.text;
      }),
    ),
  }));

  const bandedSheets: string[] = [];
  let processed = 0;
  const totalRows = clean.reduce((sum, table) => sum + table.rows.length, 0);

  for (const table of clean) {
    if (table.rows.length === 0) continue;

    const columnCount = table.rows.reduce((max, row) => Math.max(max, row.length), 0);

    const natural = Array.from({ length: columnCount }, (_, column) => {
      let widest = 0;
      for (const [index, row] of table.rows.entries()) {
        const text = row[column] ?? '';
        // Row 0 is drawn bold, which is wider than the regular face at the same
        // size — measuring it with `body` would size the column just short and
        // ellipsise a heading that actually fits.
        const font = index === 0 ? bold : body;
        widest = Math.max(widest, font.widthOfTextAtSize(text, FONT_SIZE));
      }
      return Math.max(18, Math.min(widest + CELL_PADDING * 2, usableWidth / 2));
    });

    const naturalTotal = natural.reduce((sum, width) => sum + width, 0) || 1;
    const fitScale = Math.min(1, usableWidth / naturalTotal);

    // Pack columns into bands that each fit the page. A sheet narrow enough for
    // one page yields exactly one band, so this is the general case rather than
    // a special one.
    let bands: number[][];
    let scale: number;

    if (fitScale >= MIN_SCALE || !options.bandWideSheets) {
      bands = [Array.from({ length: columnCount }, (_, i) => i)];
      scale = fitScale;
    } else {
      scale = MIN_SCALE;
      bands = [];
      let current: number[] = [];
      let used = 0;

      for (let column = 0; column < columnCount; column += 1) {
        const width = natural[column]! * scale;
        // Every band after the first repeats column 0, so a row can still be
        // identified once its label column is pages away.
        const labelWidth = bands.length > 0 && current.length === 0 ? natural[0]! * scale : 0;

        if (current.length > 0 && used + width > usableWidth) {
          bands.push(current);
          current = column === 0 ? [] : [0];
          used = column === 0 ? 0 : natural[0]! * scale;
        }

        if (current.length === 0 && labelWidth > 0 && column !== 0) {
          current = [0];
          used = labelWidth;
        }

        current.push(column);
        used += width;
      }
      if (current.length > 0) bands.push(current);
      if (bands.length > 1) bandedSheets.push(table.name);
    }

    const drawScale = Math.max(MIN_SCALE, scale);
    const fontSize = FONT_SIZE * drawScale;
    // Padding is baked into the natural widths at full size, so it has to be
    // scaled alongside them — subtracting it back at full size would leave
    // every cell a few points short and ellipsise text that fits.
    const pad = CELL_PADDING * drawScale;

    for (const [bandIndex, band] of bands.entries()) {
      const widths = band.map((column) => natural[column]! * scale);
      const tableWidth = widths.reduce((sum, width) => sum + width, 0);

      let page = document_.addPage([pageWidth, pageHeight]);
      let y = pageHeight - MARGIN;

      // Bands after the first lead with the repeated label column, which is not
      // part of the range they actually carry.
      const carried = bandIndex > 0 ? band.slice(1) : band;
      const title =
        bands.length > 1
          ? `${table.name} — columns ${(carried[0] ?? 0) + 1}-${(carried[carried.length - 1] ?? 0) + 1}`
          : table.name;

      page.drawText(title, { x: MARGIN, y: y - 11, size: 11, font: bold, color: ink });
      y -= 22;

      const drawRow = (row: string[], isHeader: boolean) => {
        if (isHeader && options.gridlines) {
          page.drawRectangle({
            x: MARGIN,
            y: y - LINE_HEIGHT,
            width: tableWidth,
            height: LINE_HEIGHT,
            color: headerFill,
          });
        }

        let x = MARGIN;
        for (const [position, column] of band.entries()) {
          const width = widths[position]!;
          const text = row[column] ?? '';

          if (text) {
            const font = isHeader ? bold : body;
            const limit = width - pad * 2;
            let shown = text;
            // A hair of tolerance: text sized to exactly its own column loses
            // to floating-point and gets needlessly ellipsised.
            if (font.widthOfTextAtSize(shown, fontSize) > limit + 0.05) {
              while (shown.length > 1 && font.widthOfTextAtSize(`${shown}…`, fontSize) > limit) {
                shown = shown.slice(0, -1);
              }
              shown = `${shown}…`;
            }
            page.drawText(shown, {
              x: x + pad,
              y: y - LINE_HEIGHT + CELL_PADDING,
              size: fontSize,
              font,
              color: ink,
            });
          }

          if (options.gridlines) {
            page.drawLine({
              start: { x, y: y - LINE_HEIGHT },
              end: { x, y },
              thickness: 0.4,
              color: rule,
            });
          }
          x += width;
        }

        if (options.gridlines) {
          const right = MARGIN + tableWidth;
          page.drawLine({
            start: { x: right, y: y - LINE_HEIGHT },
            end: { x: right, y },
            thickness: 0.4,
            color: rule,
          });
          page.drawLine({
            start: { x: MARGIN, y: y - LINE_HEIGHT },
            end: { x: right, y: y - LINE_HEIGHT },
            thickness: 0.4,
            color: rule,
          });
        }

        y -= LINE_HEIGHT;
      };

      const header = table.rows[0]!;
      drawRow(header, true);

      for (const row of table.rows.slice(1)) {
        if (y - LINE_HEIGHT < MARGIN) {
          page = document_.addPage([pageWidth, pageHeight]);
          y = pageHeight - MARGIN;
          if (options.repeatHeader) drawRow(header, true);
        }
        drawRow(row, false);

        // Rows are counted once per sheet, not once per band, so progress
        // cannot run past 100% on a banded sheet.
        if (bandIndex === 0) {
          processed += 1;
          if (processed % 200 === 0) onProgress?.(processed, totalRows);
        }
      }
    }
  }

  onProgress?.(totalRows, totalRows);
  return {
    bytes: await document_.save({ useObjectStreams: true }),
    substitutions,
    bandedSheets,
  };
}
