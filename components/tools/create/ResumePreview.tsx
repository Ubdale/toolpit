'use client';

import type { LayoutResult } from '@/lib/resume/layout';

/**
 * The preview is the PDF, drawn with HTML.
 *
 * It positions the exact blocks the exporter draws, at the same coordinates,
 * measured with the same font metrics — so a line that wraps here wraps there,
 * and a page that ends here ends there. The only thing that differs is the
 * rasteriser.
 *
 * The font stacks below are deliberate: Helvetica/Arial and Times are the
 * screen fonts whose metrics match the PDF standard fonts the export embeds.
 */
const FONT_STACKS = {
  sans: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  serif: "'Times New Roman', Times, 'Liberation Serif', serif",
} as const;

export function ResumePreview({ layout, scale }: { layout: LayoutResult; scale: number }) {
  const fontFamily = FONT_STACKS[layout.family];

  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: layout.pageCount }, (_, pageIndex) => (
        <div
          key={pageIndex}
          className="relative shrink-0 overflow-hidden rounded-sm bg-white shadow-card"
          style={{
            width: layout.pageWidth * scale,
            height: layout.pageHeight * scale,
          }}
        >
          {layout.blocks
            .filter((block) => block.page === pageIndex)
            .map((block, index) =>
              block.kind === 'rect' ? (
                <span
                  key={index}
                  className="absolute"
                  style={{
                    left: block.x * scale,
                    top: block.y * scale,
                    width: block.width * scale,
                    // A hairline rule can round to zero at small zooms and
                    // vanish; keep it visible.
                    height: Math.max(1, block.height * scale),
                    background: block.color,
                  }}
                />
              ) : (
                <span
                  key={index}
                  className="absolute whitespace-pre"
                  style={{
                    left: block.x * scale,
                    // `block.y` is the top of the line box, which is exactly
                    // what `top` means at line-height 1 — the baseline then
                    // falls an ascender below it, the same place the PDF puts
                    // it. (Line-height 0 would centre the em box on `top`
                    // instead, which is a different and wrong position.)
                    top: block.y * scale,
                    width: block.width * scale,
                    fontFamily,
                    fontSize: block.size * scale,
                    fontWeight: block.weight === 'bold' ? 700 : 400,
                    fontStyle: block.weight === 'italic' ? 'italic' : 'normal',
                    color: block.color,
                    textAlign: block.align,
                    letterSpacing: block.tracking * scale,
                    lineHeight: 1,
                  }}
                >
                  {block.text}
                </span>
              ),
            )}
        </div>
      ))}
    </div>
  );
}
