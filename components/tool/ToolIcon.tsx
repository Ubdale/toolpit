import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { CategoryId } from '@/lib/tools';

/**
 * One line-drawn icon per tool.
 *
 * With twenty-six tools, a wall of text cards is genuinely hard to scan — the
 * eye has to read every title to find anything. These are deliberately built
 * from the same few primitives (a page, a frame, an arrow) at one stroke weight
 * so they read as a family rather than as twenty-six separate drawings, and so
 * the pairs that belong together (to-PDF and from-PDF, add and remove) are
 * visibly mirror images of each other.
 *
 * They are decorative: every card, link and heading they appear in already has
 * a real text label, so each is marked `aria-hidden`.
 */

const PAGE = <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />;
const PAGE_FOLD = <path d="M14 3v5h5" />;

const ICONS: Record<string, ReactNode> = {
  // ------------------------------------------------------------------- PDF
  '/pdf/merge': (
    <>
      <rect x="3" y="4" width="8" height="7" rx="1.5" />
      <rect x="3" y="13" width="8" height="7" rx="1.5" />
      <rect x="15" y="8.5" width="6" height="7" rx="1.5" />
      <path d="M11 7.5h2.5M11 16.5h2.5" />
    </>
  ),
  '/pdf/split': (
    <>
      <rect x="3" y="8.5" width="6" height="7" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="13" width="8" height="7" rx="1.5" />
      <path d="M9 10.5h2.5M9 13.5h2.5" />
    </>
  ),
  '/pdf/organize': (
    <>
      <rect x="3" y="4" width="7" height="8" rx="1.5" />
      <rect x="14" y="12" width="7" height="8" rx="1.5" />
      <path d="M14 7.5h5m0 0-2-2m2 2-2 2" />
      <path d="M10 16.5H5m0 0 2-2m-2 2 2 2" />
    </>
  ),
  '/pdf/compress': (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M9 12H5m0 0 2-2m-2 2 2 2M15 12h4m0 0-2-2m2 2-2 2" />
    </>
  ),
  '/pdf/images-to-pdf': (
    <>
      <rect x="2.5" y="6" width="9" height="9" rx="1.5" />
      <path d="m2.5 12.5 2.5-2 3 2.5" />
      <path d="M14 10.5h6m0 0-2.5-2.5M20 10.5l-2.5 2.5" />
      <path d="M16 15v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-4" />
    </>
  ),
  '/pdf/to-images': (
    <>
      <path d="M8 3h5l4 4v3" />
      <path d="M8 3H4a1 1 0 0 0-1 1v10" />
      <path d="M13 3v4h4" />
      <rect x="10.5" y="12" width="11" height="9" rx="1.5" />
      <path d="m10.5 18.5 3-2.5 3.5 3 2-1.5 2.5 2" />
    </>
  ),
  '/pdf/excel-to-pdf': (
    <>
      <rect x="2.5" y="5" width="9" height="9" rx="1.5" />
      <path d="M2.5 8.5h9M7 5v9" />
      <path d="M14 10.5h6m0 0-2.5-2.5M20 10.5l-2.5 2.5" />
      <path d="M16 15v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-4" />
    </>
  ),
  '/pdf/pdf-to-excel': (
    <>
      <path d="M8 3h5l4 4v3" />
      <path d="M8 3H4a1 1 0 0 0-1 1v10" />
      <path d="M13 3v4h4" />
      <rect x="10.5" y="12" width="11" height="9" rx="1.5" />
      <path d="M10.5 15.5h11M16 12v9" />
    </>
  ),
  '/pdf/edit': (
    <>
      <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7" />
      <path d="M13 3v5h5" />
      <path d="m20.5 3.5 1 1a1.4 1.4 0 0 1 0 2L16 12l-3 1 1-3z" />
    </>
  ),
  '/pdf/watermark': (
    <>
      {PAGE}
      {PAGE_FOLD}
      <path d="m8 17 8-6" />
      <path d="M8.5 13.5h3M12.5 15.5h3" />
    </>
  ),
  '/pdf/page-numbers': (
    <>
      {PAGE}
      {PAGE_FOLD}
      <path d="M8 11h6M8 14h6" />
      <path d="M12 18.5h2" />
    </>
  ),
  '/pdf/remove-watermark': (
    <>
      {PAGE}
      {PAGE_FOLD}
      <path d="M8.5 13.5h3" />
      <path d="m7 19 10-8" />
      <circle cx="18" cy="18" r="3.4" />
      <path d="M16.4 18h3.2" />
    </>
  ),

  // ------------------------------------------------------------------- SVG
  '/svg/image-to-svg': (
    <>
      <path d="M4 18c3-8 6-11 8-11s3 2 4 5 2 5 4 5" />
      <rect x="2" y="16" width="4" height="4" rx="1" />
      <rect x="18" y="15" width="4" height="4" rx="1" />
      <rect x="10" y="4" width="4" height="4" rx="1" />
    </>
  ),
  '/svg/optimize': (
    <>
      <path d="M4 16c3-7 5-10 7-10s3 3 5 8" />
      <path d="M14 19h7" />
      <path d="M17.5 4.5 19 8l3.5 1.5L19 11l-1.5 3.5L16 11l-3.5-1.5L16 8z" />
    </>
  ),
  '/svg/favicon-generator': (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <rect x="9" y="12" width="6" height="5" rx="1" />
    </>
  ),

  // ----------------------------------------------------------------- image
  '/image/remove-background': (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.5 17.5a4.8 4.8 0 0 1 9 0" />
    </>
  ),
  '/image/upscale': (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="9" y="9" width="12" height="12" rx="1.5" />
      <path d="M13 17v-4h4" />
    </>
  ),
  '/image/remove-object': (
    <>
      <path d="m14 4 6 6-8 8H6l-2-2z" />
      <path d="m9.5 8.5 6 6" />
      <path d="M12 21h9" />
    </>
  ),
  '/image/resize': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8h4v4" />
      <path d="M16 16h-4v-4" />
      <path d="m8 8 8 8" />
    </>
  ),
  '/image/convert': (
    <>
      <rect x="2.5" y="4" width="8" height="8" rx="1.5" />
      <rect x="13.5" y="12" width="8" height="8" rx="1.5" />
      <path d="M14 8h6m0 0-2-2m2 2-2 2" />
      <path d="M10 16H4m0 0 2-2m-2 2 2 2" />
    </>
  ),
  '/image/crop': (
    <>
      <path d="M6 2v14a1 1 0 0 0 1 1h14" />
      <path d="M2 6h15a1 1 0 0 1 1 1v15" />
    </>
  ),
  '/image/remove-watermark': (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="m3 14 4-3.5 4 3.5" />
      <path d="m8 17 8-7" />
      <circle cx="18" cy="17" r="3.4" />
      <path d="M16.4 17h3.2" />
    </>
  ),

  // ---------------------------------------------------------------- record
  '/record/screen': (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8" />
      <circle cx="12" cy="10.5" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),

  // ---------------------------------------------------------------- create
  '/create/resume': (
    <>
      {PAGE}
      {PAGE_FOLD}
      <circle cx="10" cy="12" r="1.8" />
      <path d="M7.5 17.5a2.9 2.9 0 0 1 5 0" />
      <path d="M14.5 11.5h2.5M14.5 14.5h2.5" />
    </>
  ),
  '/create/chart': (
    <>
      <path d="M4 3v16a1 1 0 0 0 1 1h16" />
      <rect x="7" y="11" width="3.2" height="6" rx="1" />
      <rect x="13" y="7" width="3.2" height="10" rx="1" />
    </>
  ),
  '/create/qr-code': (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM19 19h2M14 21h1M19 14h2" />
    </>
  ),
};

/** Fallback for a tool with no icon of its own yet. */
const GENERIC = (
  <>
    {PAGE}
    {PAGE_FOLD}
  </>
);

const CATEGORY_ICONS: Record<CategoryId, ReactNode> = {
  pdf: (
    <>
      {PAGE}
      {PAGE_FOLD}
      <path d="M8 13h5M8 16.5h7" />
    </>
  ),
  svg: (
    <>
      <path d="M4 18c3-8 6-11 8-11s3 2 4 5 2 5 4 5" />
      <rect x="2" y="16" width="4" height="4" rx="1" />
      <rect x="18" y="15" width="4" height="4" rx="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m3 16 5-4 4 3.5 3-2.5 6 5" />
    </>
  ),
  record: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8" />
      <circle cx="12" cy="10.5" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  create: (
    <>
      <path d="m14 4 6 6L9 21H3v-6z" />
      <path d="m11.5 6.5 6 6" />
    </>
  ),
};

export function ToolIcon({ href, className }: { href: string; className?: string }) {
  return <Frame className={className}>{ICONS[href] ?? GENERIC}</Frame>;
}

export function CategoryIcon({ id, className }: { id: CategoryId; className?: string }) {
  return <Frame className={className}>{CATEGORY_ICONS[id]}</Frame>;
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('size-5 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
