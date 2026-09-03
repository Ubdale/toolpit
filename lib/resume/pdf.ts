'use client';

import { loadPdfLib } from '@/lib/pdf/runtime';

import { alignedX, BASELINE_RATIO, layoutResume, type LayoutOptions } from './layout';
import type { Resume } from './types';

/**
 * Writes the laid-out blocks into a real PDF.
 *
 * The output is vector text, not a rasterised picture of a page: the words stay
 * selectable, searchable and machine-readable, which is what an applicant
 * tracking system needs in order to read the resume at all. Exporting a PNG in
 * a PDF wrapper is the single most common way a good CV gets silently scored as
 * empty.
 */

export type ResumePdfResult = {
  bytes: Uint8Array;
  pageCount: number;
  /** Characters approximated to fit the standard-font encoding. */
  substitutions: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

export async function resumeToPdf(
  resume: Resume,
  options: LayoutOptions,
): Promise<ResumePdfResult> {
  const layout = await layoutResume(resume, options);
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();

  const doc = await PDFDocument.create();
  doc.setTitle(resume.name ? `${resume.name} — Resume` : 'Resume');
  if (resume.name) doc.setAuthor(resume.name);
  doc.setCreator('Toolpit');
  doc.setProducer('Toolpit');

  const fonts =
    layout.family === 'serif'
      ? {
          regular: await doc.embedFont(StandardFonts.TimesRoman),
          bold: await doc.embedFont(StandardFonts.TimesRomanBold),
          italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
        }
      : {
          regular: await doc.embedFont(StandardFonts.Helvetica),
          bold: await doc.embedFont(StandardFonts.HelveticaBold),
          italic: await doc.embedFont(StandardFonts.HelveticaOblique),
        };

  const pages = Array.from({ length: layout.pageCount }, () =>
    doc.addPage([layout.pageWidth, layout.pageHeight]),
  );

  for (const block of layout.blocks) {
    const page = pages[block.page];
    if (!page) continue;

    if (block.kind === 'rect') {
      const [r, g, b] = hexToRgb(block.color);
      page.drawRectangle({
        x: block.x,
        // Blocks measure y from the top; PDF measures from the bottom.
        y: layout.pageHeight - block.y - block.height,
        width: block.width,
        height: block.height,
        color: rgb(r, g, b),
      });
      continue;
    }

    const font = fonts[block.weight];
    const x = alignedX(block, (value, size) => font.widthOfTextAtSize(value, size));
    const [r, g, b] = hexToRgb(block.color);

    page.drawText(block.text, {
      x,
      y: layout.pageHeight - block.y - block.size * BASELINE_RATIO,
      size: block.size,
      font,
      color: rgb(r, g, b),
      ...(block.tracking ? { characterSpacing: block.tracking } : {}),
    });
  }

  return {
    bytes: await doc.save({ useObjectStreams: true }),
    pageCount: layout.pageCount,
    substitutions: layout.substitutions,
  };
}

/** Plain-text export, for pasting into an application form that wants one. */
export function resumeToText(resume: Resume): string {
  const lines: string[] = [];
  const push = (value: string) => lines.push(value);

  if (resume.name) push(resume.name);
  if (resume.headline) push(resume.headline);
  const contact = [resume.email, resume.phone, resume.location, resume.website].filter(Boolean);
  if (contact.length) push(contact.join(' | '));

  if (resume.summary) {
    push('');
    push('SUMMARY');
    push(resume.summary);
  }

  if (resume.experience.some((entry) => entry.role || entry.company)) {
    push('');
    push('EXPERIENCE');
    for (const entry of resume.experience) {
      if (!entry.role && !entry.company) continue;
      const dates = [entry.start, entry.end].filter(Boolean).join(' - ');
      push('');
      push([entry.role, entry.company].filter(Boolean).join(', ') + (dates ? ` (${dates})` : ''));
      for (const bullet of entry.bullets.filter(Boolean)) push(`- ${bullet}`);
    }
  }

  if (resume.education.some((entry) => entry.degree || entry.school)) {
    push('');
    push('EDUCATION');
    for (const entry of resume.education) {
      if (!entry.degree && !entry.school) continue;
      const dates = [entry.start, entry.end].filter(Boolean).join(' - ');
      push([entry.degree, entry.school].filter(Boolean).join(', ') + (dates ? ` (${dates})` : ''));
      if (entry.detail) push(entry.detail);
    }
  }

  if (resume.skills.filter(Boolean).length) {
    push('');
    push('SKILLS');
    push(resume.skills.filter(Boolean).join(', '));
  }

  if (resume.projects.some((entry) => entry.name)) {
    push('');
    push('PROJECTS');
    for (const entry of resume.projects) {
      if (!entry.name) continue;
      push(`${entry.name}${entry.link ? ` — ${entry.link}` : ''}`);
      if (entry.detail) push(entry.detail);
    }
  }

  if (resume.certifications.filter(Boolean).length) {
    push('');
    push('CERTIFICATIONS');
    for (const item of resume.certifications.filter(Boolean)) push(`- ${item}`);
  }

  if (resume.languages.filter(Boolean).length) {
    push('');
    push('LANGUAGES');
    push(resume.languages.filter(Boolean).join(', '));
  }

  return lines.join('\n');
}
