'use client';

import type { PDFFont } from 'pdf-lib';

import { toWinAnsi } from '@/lib/pdf/encoding';
import { loadPdfLib } from '@/lib/pdf/runtime';

import { densityMetrics, getTemplate, type ResumeTemplate, type TemplateId } from './templates';
import {
  hasContent,
  PAGE_DIMENSIONS,
  sectionOrder,
  sectionTitles,
  type PageSize,
  type Resume,
  type SectionId,
} from './types';

/**
 * The single layout pass behind both the on-screen preview and the exported PDF.
 *
 * Building the page twice — once in CSS for the preview, once in pdf-lib for
 * the download — is how every resume builder ends up shipping a PDF that does
 * not match what the person approved. So the layout runs once and emits
 * positioned blocks; the preview absolutely-positions them and the PDF writer
 * draws them, and neither one gets an opinion about where anything goes.
 *
 * Measurement uses the real PDF font metrics, so a line that fits in the
 * preview is a line that fits in the file.
 */

export type FontWeight = 'regular' | 'bold' | 'italic';

export type TextBlock = {
  kind: 'text';
  page: number;
  x: number;
  /** Top of the line box, in points from the top of the page. */
  y: number;
  width: number;
  text: string;
  size: number;
  weight: FontWeight;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Extra space between glyphs, for the executive template's headings. */
  tracking: number;
};

export type RectBlock = {
  kind: 'rect';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type Block = TextBlock | RectBlock;

export type LayoutResult = {
  blocks: Block[];
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  family: ResumeTemplate['family'];
  /** Characters that had to be approximated for the PDF font's encoding. */
  substitutions: number;
};

const INK = '#191712';
const MUTED = '#4a453c';

/** The ratio of a line box taken by the ascender — where the baseline sits. */
export const BASELINE_RATIO = 0.78;

type FontSet = Record<FontWeight, PDFFont>;

let measurePromise: Promise<Record<ResumeTemplate['family'], FontSet>> | null = null;

/**
 * Standard-font metrics for measurement only, embedded in a throwaway document.
 * pdf-lib ties a font object to the document that embedded it, so the exporter
 * embeds its own; these exist purely so wrapping can be computed without one.
 */
export function loadMeasurementFonts(): Promise<Record<ResumeTemplate['family'], FontSet>> {
  measurePromise ??= (async () => {
    const { PDFDocument, StandardFonts } = await loadPdfLib();
    const doc = await PDFDocument.create();
    return {
      sans: {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
        italic: await doc.embedFont(StandardFonts.HelveticaOblique),
      },
      serif: {
        regular: await doc.embedFont(StandardFonts.TimesRoman),
        bold: await doc.embedFont(StandardFonts.TimesRomanBold),
        italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
      },
    };
  })();
  return measurePromise;
}

function widthOf(font: PDFFont, value: string, size: number, tracking = 0): number {
  if (!value) return 0;
  return font.widthOfTextAtSize(value, size) + tracking * Math.max(0, value.length - 1);
}

/** Greedy wrap on spaces, breaking mid-word only when a single word cannot fit. */
function wrap(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(font, candidate, size) <= maxWidth || !line) {
      // A single word wider than the column still has to go somewhere; break it
      // rather than let it run off the page.
      if (!line && widthOf(font, word, size) > maxWidth) {
        let chunk = '';
        for (const character of word) {
          if (widthOf(font, chunk + character, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = character;
          } else {
            chunk += character;
          }
        }
        line = chunk;
        continue;
      }
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

export type LayoutOptions = {
  template: TemplateId;
  pageSize: PageSize;
  /** Scales every type size, for squeezing a long resume onto fewer pages. */
  scale: number;
};

export async function layoutResume(
  resume: Resume,
  options: LayoutOptions,
): Promise<LayoutResult> {
  const template = getTemplate(options.template);
  const fonts = (await loadMeasurementFonts())[template.family];
  const metrics = densityMetrics[template.density];
  const [pageWidth, pageHeight] = PAGE_DIMENSIONS[options.pageSize];

  const scale = Math.min(1.3, Math.max(0.75, options.scale));
  const bodySize = metrics.bodySize * scale;
  const lineGap = metrics.lineGap * scale;
  const sectionGap = metrics.sectionGap * scale;
  const entryGap = metrics.entryGap * scale;
  const margin = metrics.margin;

  const blocks: Block[] = [];
  let substitutions = 0;

  /** Every string reaching a block goes through here, once. */
  const clean = (value: string): string => {
    const result = toWinAnsi(value);
    substitutions += result.substitutions;
    return result.text;
  };

  const sidebarWidth = template.sidebar ? 168 : 0;
  const mainLeft = margin + (template.sidebar ? sidebarWidth + 24 : 0);
  const mainWidth = pageWidth - mainLeft - margin;
  const bottomLimit = pageHeight - margin;

  let page = 0;
  let y = margin;

  function lineHeight(size: number): number {
    return size * 1.18 + lineGap;
  }

  /** Moves to a new page when the next block would cross the bottom margin. */
  function ensureRoom(height: number): void {
    if (y + height <= bottomLimit) return;
    page += 1;
    y = margin;
  }

  function drawParagraph(
    value: string,
    options: {
      x: number;
      width: number;
      size?: number;
      weight?: FontWeight;
      color?: string;
      align?: TextBlock['align'];
      tracking?: number;
    },
  ): void {
    const size = options.size ?? bodySize;
    const weight = options.weight ?? 'regular';
    const lines = wrap(fonts[weight], clean(value), size, options.width);

    for (const line of lines) {
      ensureRoom(lineHeight(size));
      blocks.push({
        kind: 'text',
        page,
        x: options.x,
        y,
        width: options.width,
        text: line,
        size,
        weight,
        color: options.color ?? INK,
        align: options.align ?? 'left',
        tracking: options.tracking ?? 0,
      });
      y += lineHeight(size);
    }
  }

  /** A bullet with a hanging indent, so wrapped lines clear the glyph. */
  function drawBullet(value: string, x: number, width: number): void {
    const indent = bodySize * 0.9;
    const lines = wrap(fonts.regular, clean(value), bodySize, width - indent);

    for (const [index, line] of lines.entries()) {
      ensureRoom(lineHeight(bodySize));
      if (index === 0) {
        blocks.push({
          kind: 'text',
          page,
          x,
          y,
          width: indent,
          text: '•',
          size: bodySize,
          weight: 'regular',
          color: template.accent || MUTED,
          align: 'left',
          tracking: 0,
        });
      }
      blocks.push({
        kind: 'text',
        page,
        x: x + indent,
        y,
        width: width - indent,
        text: line,
        size: bodySize,
        weight: 'regular',
        color: INK,
        align: 'left',
        tracking: 0,
      });
      y += lineHeight(bodySize);
    }
  }

  function drawSectionHeading(title: string, x: number, width: number): void {
    const size = bodySize * 1.08;
    const label = template.sectionCaps ? title.toUpperCase() : title;
    const tracking = template.sectionCaps ? size * 0.08 : 0;

    // Keep a heading with at least a line of its section rather than stranding it.
    ensureRoom(lineHeight(size) + lineHeight(bodySize) + 6);

    if (template.sectionStyle === 'rule') {
      blocks.push({
        kind: 'rect',
        page,
        x,
        y: y - 2,
        width,
        height: 0.8,
        color: template.accent || '#c9c2b4',
      });
      y += 6;
    }

    blocks.push({
      kind: 'text',
      page,
      x,
      y,
      width,
      text: clean(label),
      size,
      weight: 'bold',
      color: template.accent || INK,
      align: 'left',
      tracking,
    });
    y += lineHeight(size);

    if (template.sectionStyle === 'underline') {
      blocks.push({
        kind: 'rect',
        page,
        x,
        y: y - lineGap - 1,
        width,
        height: 1.2,
        color: template.accent || '#c9c2b4',
      });
      y += 4;
    } else {
      y += 2;
    }
  }

  /** Role on the left, dates flush right on the same line. */
  function drawEntryHead(
    left: string,
    right: string,
    x: number,
    width: number,
    weight: FontWeight,
    size: number,
  ): void {
    ensureRoom(lineHeight(size));
    const rightText = clean(right);
    const rightWidth = rightText ? widthOf(fonts.regular, rightText, size * 0.95) : 0;

    blocks.push({
      kind: 'text',
      page,
      x,
      y,
      width: width - rightWidth - 10,
      text: clean(left),
      size,
      weight,
      color: INK,
      align: 'left',
      tracking: 0,
    });

    if (rightText) {
      blocks.push({
        kind: 'text',
        page,
        x,
        y: y + (size - size * 0.95) * 0.6,
        width,
        text: rightText,
        size: size * 0.95,
        weight: 'regular',
        color: MUTED,
        align: 'right',
        tracking: 0,
      });
    }

    y += lineHeight(size);
  }

  // ------------------------------------------------------------------ header

  const headerWidth = template.sidebar ? pageWidth - margin * 2 : mainWidth;
  const headerX = template.sidebar ? margin : mainLeft;
  const nameSize = bodySize * (template.density === 'dense' ? 2.0 : 2.3);

  if (resume.name.trim()) {
    drawParagraph(resume.name, {
      x: headerX,
      width: headerWidth,
      size: nameSize,
      weight: 'bold',
      align: template.headerAlign,
      tracking: template.family === 'serif' ? 0.4 : 0,
    });
  }

  if (resume.headline.trim()) {
    y += 1;
    drawParagraph(resume.headline, {
      x: headerX,
      width: headerWidth,
      size: bodySize * 1.15,
      color: template.accent || MUTED,
      align: template.headerAlign,
    });
  }

  // The sidebar template keeps contact details in the column, not the header.
  const contactParts = [resume.email, resume.phone, resume.location, resume.website]
    .map((part) => part.trim())
    .filter(Boolean);

  if (contactParts.length > 0 && !template.sidebar) {
    y += 3;
    drawParagraph(contactParts.join('   ·   '), {
      x: headerX,
      width: headerWidth,
      size: bodySize * 0.95,
      color: MUTED,
      align: template.headerAlign,
    });
  }

  y += sectionGap * 0.7;
  const bodyStartY = y;

  // ----------------------------------------------------------------- sidebar

  const sidebarSections: SectionId[] = ['skills', 'languages', 'certifications'];
  const mainSections = sectionOrder.filter(
    (section) => !(template.sidebar && sidebarSections.includes(section)),
  );

  function drawSection(section: SectionId, x: number, width: number): void {
    if (!hasContent(resume, section)) return;
    y += sectionGap;
    drawSectionHeading(sectionTitles[section], x, width);

    switch (section) {
      case 'summary':
        drawParagraph(resume.summary, { x, width });
        break;

      case 'experience':
        for (const [index, entry] of resume.experience.entries()) {
          if (!entry.role && !entry.company && !entry.bullets.some(Boolean)) continue;
          if (index > 0) y += entryGap;

          const dates = [entry.start, entry.end].filter(Boolean).join(' – ');
          drawEntryHead(entry.role || entry.company, dates, x, width, 'bold', bodySize * 1.05);

          const place = [entry.company, entry.location].filter(Boolean).join(', ');
          if (place && entry.role) {
            drawParagraph(place, { x, width, size: bodySize * 0.95, color: MUTED, weight: 'italic' });
          }

          y += 1;
          for (const bullet of entry.bullets) {
            if (bullet.trim()) drawBullet(bullet, x, width);
          }
        }
        break;

      case 'education':
        for (const [index, entry] of resume.education.entries()) {
          if (!entry.degree && !entry.school) continue;
          if (index > 0) y += entryGap;

          const dates = [entry.start, entry.end].filter(Boolean).join(' – ');
          drawEntryHead(entry.degree || entry.school, dates, x, width, 'bold', bodySize * 1.05);

          const place = [entry.school, entry.location].filter(Boolean).join(', ');
          if (place && entry.degree) {
            drawParagraph(place, { x, width, size: bodySize * 0.95, color: MUTED, weight: 'italic' });
          }
          if (entry.detail.trim()) drawParagraph(entry.detail, { x, width });
        }
        break;

      case 'projects':
        for (const [index, entry] of resume.projects.entries()) {
          if (!entry.name && !entry.detail) continue;
          if (index > 0) y += entryGap;
          drawEntryHead(entry.name, entry.link, x, width, 'bold', bodySize * 1.05);
          if (entry.detail.trim()) drawParagraph(entry.detail, { x, width });
        }
        break;

      case 'skills':
        // A comma-separated run, not a grid of rated bars: a parser reads this
        // as a list of words, which is the entire point of the section.
        drawParagraph(resume.skills.filter(Boolean).join(' · '), { x, width });
        break;

      case 'certifications':
        for (const item of resume.certifications.filter(Boolean)) drawBullet(item, x, width);
        break;

      case 'languages':
        drawParagraph(resume.languages.filter(Boolean).join(' · '), { x, width });
        break;
    }
  }

  if (template.sidebar) {
    // The sidebar is laid out first so the main column can start level with it,
    // then the cursor is reset — the two columns are independent flows.
    const sidebarX = margin;

    if (contactParts.length > 0) {
      y += sectionGap;
      drawSectionHeading('Contact', sidebarX, sidebarWidth);
      for (const part of contactParts) {
        drawParagraph(part, { x: sidebarX, width: sidebarWidth, size: bodySize * 0.95 });
      }
    }

    for (const section of sidebarSections) {
      drawSection(section, sidebarX, sidebarWidth);
    }

    const sidebarBottom = y;
    const sidebarPages = page;

    page = 0;
    y = bodyStartY;
    for (const section of mainSections) drawSection(section, mainLeft, mainWidth);

    // The document is as long as its longer column.
    if (sidebarPages > page || (sidebarPages === page && sidebarBottom > y)) {
      page = Math.max(page, sidebarPages);
    }
  } else {
    for (const section of mainSections) drawSection(section, mainLeft, mainWidth);
  }

  return {
    blocks,
    pageCount: page + 1,
    pageWidth,
    pageHeight,
    family: template.family,
    substitutions,
  };
}

/** Where a block's text actually starts, once alignment is applied. */
export function alignedX(block: TextBlock, measure: (text: string, size: number) => number): number {
  if (block.align === 'left') return block.x;
  const textWidth = measure(block.text, block.size) + block.tracking * Math.max(0, block.text.length - 1);
  if (block.align === 'center') return block.x + (block.width - textWidth) / 2;
  return block.x + block.width - textWidth;
}
