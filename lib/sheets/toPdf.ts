'use client';

import { loadPdfLib } from '@/lib/pdf/runtime';

import { toWinAnsi } from '@/lib/pdf/encoding';
import { DEFAULT_XLSX_FONT_SIZE } from './styled';
import type { StyledCell, StyledTable } from './styled';

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
  /** Reproduce the workbook's fonts, colours and fills where they were read. */
  keepStyling: boolean;
};

export const defaultSheetPdfOptions: SheetPdfOptions = {
  pageSize: 'a4',
  landscape: true,
  repeatHeader: true,
  gridlines: true,
  bandWideSheets: true,
  keepStyling: true,
};

const SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

const MARGIN = 36;
const FONT_SIZE = 8.5;
const CELL_PADDING = 4;
/** Below this, text is too small to read; band the sheet instead of shrinking. */
const MIN_SCALE = 0.62;

export type SheetPdfResult = {
  bytes: Uint8Array;
  /** Characters that had to be approximated to fit the PDF font's encoding. */
  substitutions: number;
  /** Sheets that were split across column bands to stay readable. */
  bandedSheets: string[];
  /** Sheets whose source carried formatting we could reproduce. */
  styledSheets: string[];
};

/**
 * Renders spreadsheet tables into a PDF, preserving the formatting that can
 * actually be recovered from the file.
 *
 * What comes through: bold, italic and underline, font sizes, text and fill
 * colours, horizontal alignment, merged cells, the author's column widths,
 * hidden rows and columns, and number formats — dates and currency arrive
 * looking the way the author saw them.
 *
 * What does not, and cannot: charts, images, conditional formatting rules, and
 * per-edge borders. Nor anything from a `.xls` or `.ods`, whose reader exposes
 * no styling at all. Those are reported rather than faked.
 */
export async function tablesToPdf(
  tables: StyledTable[],
  options: SheetPdfOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<SheetPdfResult> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();

  const document_ = await PDFDocument.create();
  document_.setCreator('Toolpit');
  document_.setProducer('Toolpit — processed on your device');

  const faces = {
    regular: await document_.embedFont(StandardFonts.Helvetica),
    bold: await document_.embedFont(StandardFonts.HelveticaBold),
    italic: await document_.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await document_.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  const faceFor = (cell: StyledCell, headerFallback: boolean) => {
    const bold = cell.style.bold ?? headerFallback;
    const italic = cell.style.italic ?? false;
    if (bold && italic) return faces.boldItalic;
    if (bold) return faces.bold;
    if (italic) return faces.italic;
    return faces.regular;
  };

  const [shortSide, longSide] = SIZES[options.pageSize];
  const pageWidth = options.landscape ? longSide : shortSide;
  const pageHeight = options.landscape ? shortSide : longSide;
  const usableWidth = pageWidth - MARGIN * 2;

  const ink = rgb(0.1, 0.09, 0.07);
  const rule = rgb(0.82, 0.8, 0.76);
  const defaultHeaderFill = rgb(0.96, 0.95, 0.93);

  // Every cell is sanitised once, up front: the standard PDF fonts cannot
  // encode arrows, check marks or CJK, and pdf-lib throws rather than draw the
  // wrong glyph.
  let substitutions = 0;
  const clean: StyledTable[] = tables.map((table) => ({
    ...table,
    name: toWinAnsi(table.name).text,
    rows: table.rows.map((row) =>
      row.map((cell) => {
        const result = toWinAnsi(cell.text);
        substitutions += result.substitutions;
        return { ...cell, text: result.text };
      }),
    ),
  }));

  const bandedSheets: string[] = [];
  const styledSheets: string[] = [];
  let processed = 0;
  const totalRows = clean.reduce((sum, table) => sum + table.rows.length, 0);

  for (const table of clean) {
    if (table.rows.length === 0) continue;
    const useStyle = options.keepStyling && table.styled;
    if (useStyle) styledSheets.push(table.name);

    const columnCount = table.rows.reduce((max, row) => Math.max(max, row.length), 0);

    // A cell's own font size affects how much room it needs, so measurement has
    // to use the same face and size the renderer will draw with. Sizes are
    // rescaled relative to Excel's default so an 11pt workbook lands exactly on
    // Toolpit's body size and a 22pt heading stays twice as large as its body.
    const sizeRatio = FONT_SIZE / DEFAULT_XLSX_FONT_SIZE;
    const sizeOf = (cell: StyledCell) =>
      useStyle && cell.style.size ? cell.style.size * sizeRatio : FONT_SIZE;

    const natural = Array.from({ length: columnCount }, (_, column) => {
      // The author's own width wins when the file recorded one: they already
      // decided how wide this column should be.
      const authored = useStyle ? table.columnWidths[column] : null;
      if (authored) return Math.max(18, Math.min(authored, usableWidth / 2));

      let widest = 0;
      for (const [index, row] of table.rows.entries()) {
        const cell = row[column];
        // A merged cell's text is measured against the span it occupies, not a
        // single column, or one wide title would force every column wide.
        if (!cell || cell.covered || cell.colSpan > 1) continue;
        widest = Math.max(
          widest,
          faceFor(cell, index === 0).widthOfTextAtSize(cell.text, sizeOf(cell)),
        );
      }
      return Math.max(18, Math.min(widest + CELL_PADDING * 2, usableWidth / 2));
    });

    const naturalTotal = natural.reduce((sum, width) => sum + width, 0) || 1;
    const fitScale = Math.min(1, usableWidth / naturalTotal);

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
        if (current.length > 0 && used + width > usableWidth) {
          bands.push(current);
          // Every band after the first repeats column 0, so a row can still be
          // identified once its label column is pages away.
          current = column === 0 ? [] : [0];
          used = column === 0 ? 0 : natural[0]! * scale;
        }
        current.push(column);
        used += width;
      }
      if (current.length > 0) bands.push(current);
      if (bands.length > 1) bandedSheets.push(table.name);
    }

    const drawScale = Math.max(MIN_SCALE, scale);
    const pad = CELL_PADDING * drawScale;

    // Rows are as tall as their largest type, so a 20pt title is not clipped by
    // a line height chosen for 8pt body text.
    const rowHeights = table.rows.map((row) => {
      let largest = FONT_SIZE;
      for (const cell of row) largest = Math.max(largest, sizeOf(cell));
      return Math.max(12, largest * 1.45) * drawScale;
    });

    for (const [bandIndex, band] of bands.entries()) {
      const widths = band.map((column) => natural[column]! * scale);
      const tableWidth = widths.reduce((sum, width) => sum + width, 0);

      let page = document_.addPage([pageWidth, pageHeight]);
      let y = pageHeight - MARGIN;

      const carried = bandIndex > 0 ? band.slice(1) : band;
      const title =
        bands.length > 1
          ? `${table.name} — columns ${(carried[0] ?? 0) + 1}-${(carried[carried.length - 1] ?? 0) + 1}`
          : table.name;

      page.drawText(title, { x: MARGIN, y: y - 11, size: 11, font: faces.bold, color: ink });
      y -= 22;

      const drawRow = (row: StyledCell[], isHeader: boolean, height: number) => {
        const positions: number[] = [];
        let cursor = MARGIN;
        for (const width of widths) {
          positions.push(cursor);
          cursor += width;
        }

        // Only paint a synthetic header band when the sheet brought no fills of
        // its own — otherwise it would sit on top of the author's colour.
        if (isHeader && options.gridlines && !useStyle) {
          page.drawRectangle({
            x: MARGIN,
            y: y - height,
            width: tableWidth,
            height,
            color: defaultHeaderFill,
          });
        }

        for (const [position, column] of band.entries()) {
          const cell = row[column];
          if (!cell || cell.covered) continue;

          // A merge only spans the columns still present in this band.
          let width = widths[position]!;
          if (cell.colSpan > 1) {
            for (let extra = 1; extra < cell.colSpan; extra += 1) {
              const next = band.indexOf(column + extra);
              if (next === -1) break;
              width += widths[next]!;
            }
          }

          const x = positions[position]!;

          if (useStyle && cell.style.fill) {
            page.drawRectangle({
              x,
              y: y - height,
              width,
              height,
              color: rgb(cell.style.fill[0], cell.style.fill[1], cell.style.fill[2]),
            });
          }

          if (!cell.text) continue;

          const font = faceFor(cell, isHeader);
          const size = sizeOf(cell) * drawScale;
          const limit = width - pad * 2;

          let shown = cell.text;
          if (font.widthOfTextAtSize(shown, size) > limit + 0.05) {
            while (shown.length > 1 && font.widthOfTextAtSize(`${shown}…`, size) > limit) {
              shown = shown.slice(0, -1);
            }
            shown = `${shown}…`;
          }

          const textWidth = font.widthOfTextAtSize(shown, size);
          const align = useStyle ? cell.style.align : undefined;
          const textX =
            align === 'right'
              ? x + width - pad - textWidth
              : align === 'center'
                ? x + (width - textWidth) / 2
                : x + pad;
          const baseline = y - height + (height - size) / 2 + size * 0.18;

          const colour =
            useStyle && cell.style.color
              ? rgb(cell.style.color[0], cell.style.color[1], cell.style.color[2])
              : ink;

          page.drawText(shown, { x: textX, y: baseline, size, font, color: colour });

          if (useStyle && cell.style.underline) {
            page.drawLine({
              start: { x: textX, y: baseline - size * 0.15 },
              end: { x: textX + textWidth, y: baseline - size * 0.15 },
              thickness: Math.max(0.3, size * 0.06),
              color: colour,
            });
          }
        }

        if (options.gridlines) {
          for (const [index, position] of positions.entries()) {
            page.drawLine({
              start: { x: position, y: y - height },
              end: { x: position, y },
              thickness: 0.4,
              color: rule,
            });
          }
          page.drawLine({
            start: { x: MARGIN + tableWidth, y: y - height },
            end: { x: MARGIN + tableWidth, y },
            thickness: 0.4,
            color: rule,
          });
          page.drawLine({
            start: { x: MARGIN, y: y - height },
            end: { x: MARGIN + tableWidth, y: y - height },
            thickness: 0.4,
            color: rule,
          });
        }

        y -= height;
      };

      const header = table.rows[0]!;
      const headerHeight = rowHeights[0]!;
      drawRow(header, true, headerHeight);

      for (const [index, row] of table.rows.slice(1).entries()) {
        const height = rowHeights[index + 1]!;
        if (y - height < MARGIN) {
          page = document_.addPage([pageWidth, pageHeight]);
          y = pageHeight - MARGIN;
          if (options.repeatHeader) drawRow(header, true, headerHeight);
        }
        drawRow(row, false, height);

        // Counted once per sheet, not once per band, so progress cannot run
        // past 100% on a banded sheet.
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
    styledSheets,
  };
}
