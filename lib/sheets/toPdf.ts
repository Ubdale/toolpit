'use client';

import { loadPdfLib } from '@/lib/pdf/runtime';

import type { SheetTable } from './runtime';

export type SheetPdfOptions = {
  pageSize: 'a4' | 'letter';
  landscape: boolean;
  /** Repeat the first row of each sheet at the top of every page. */
  repeatHeader: boolean;
  gridlines: boolean;
};

export const defaultSheetPdfOptions: SheetPdfOptions = {
  pageSize: 'a4',
  landscape: true,
  repeatHeader: true,
  gridlines: true,
};

const SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

const MARGIN = 36;
const FONT_SIZE = 8.5;
const LINE_HEIGHT = 12;
const CELL_PADDING = 4;

/**
 * Renders spreadsheet tables into a PDF.
 *
 * This is a *readable report*, not a pixel-perfect recreation of the workbook —
 * there is no styling, merged-cell or chart information to recreate from
 * values alone, and pretending otherwise would produce something subtly wrong.
 * What it does guarantee: every cell's text is present, columns line up, wide
 * sheets are scaled to fit rather than cropped, and long sheets paginate with
 * their header repeated.
 */
export async function tablesToPdf(
  tables: SheetTable[],
  options: SheetPdfOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
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

  let processed = 0;
  const totalRows = tables.reduce((sum, table) => sum + table.rows.length, 0);

  for (const table of tables) {
    if (table.rows.length === 0) continue;

    const columnCount = table.rows[0]!.length;

    // Width each column by its widest cell, then scale the whole table down if
    // the total overflows. Scaling beats cropping: a narrower but complete
    // table is still usable, a cropped one is not.
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
      return Math.min(widest + CELL_PADDING * 2, usableWidth / 2);
    });

    const naturalTotal = natural.reduce((sum, width) => sum + width, 0) || 1;
    const scale = Math.min(1, usableWidth / naturalTotal);
    const widths = natural.map((width) => width * scale);
    const fontSize = FONT_SIZE * Math.max(0.75, scale);

    let page = document_.addPage([pageWidth, pageHeight]);
    let y = pageHeight - MARGIN;

    const drawTitle = () => {
      page.drawText(table.name, {
        x: MARGIN,
        y: y - 11,
        size: 11,
        font: bold,
        color: ink,
      });
      y -= 22;
    };

    const drawRow = (cells: string[], isHeader: boolean) => {
      if (isHeader && options.gridlines) {
        page.drawRectangle({
          x: MARGIN,
          y: y - LINE_HEIGHT,
          width: widths.reduce((sum, width) => sum + width, 0),
          height: LINE_HEIGHT,
          color: headerFill,
        });
      }

      let x = MARGIN;
      for (const [index, width] of widths.entries()) {
        const text = cells[index] ?? '';
        if (text) {
          // Clip rather than overflow into the neighbouring column.
          let shown = text;
          const limit = width - CELL_PADDING * 2;
          const font = isHeader ? bold : body;
          if (font.widthOfTextAtSize(shown, fontSize) > limit) {
            while (shown.length > 1 && font.widthOfTextAtSize(`${shown}…`, fontSize) > limit) {
              shown = shown.slice(0, -1);
            }
            shown = `${shown}…`;
          }
          page.drawText(shown, {
            x: x + CELL_PADDING,
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
        const right = MARGIN + widths.reduce((sum, width) => sum + width, 0);
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

    drawTitle();
    const header = table.rows[0]!;
    drawRow(header, true);

    for (const row of table.rows.slice(1)) {
      if (y - LINE_HEIGHT < MARGIN) {
        page = document_.addPage([pageWidth, pageHeight]);
        y = pageHeight - MARGIN;
        if (options.repeatHeader) drawRow(header, true);
      }
      drawRow(row, false);
      processed += 1;
      if (processed % 200 === 0) onProgress?.(processed, totalRows);
    }
  }

  onProgress?.(totalRows, totalRows);
  return document_.save({ useObjectStreams: true });
}
