import { Icon, type IconName } from '@/components/ui/Icon';
import type { CategoryId } from '@/lib/tools';

/**
 * The icon for a tool or a category.
 *
 * These were hand-drawn as a matched family; they are now Google Material
 * Symbols like every other icon in the app, so there is one icon set rather
 * than a bespoke one for tool cards and a library everywhere else.
 *
 * The mapping is explicit rather than derived from the route, so a tool whose
 * URL changes keeps its icon, and a new tool fails loudly at the type level
 * instead of silently falling back.
 */
const TOOL_ICONS: Record<string, IconName> = {
  '/pdf/merge': 'toolMerge',
  '/pdf/split': 'toolSplit',
  '/pdf/organize': 'toolOrganize',
  '/pdf/compress': 'toolCompress',
  '/pdf/images-to-pdf': 'toolImagesToPdf',
  '/pdf/to-images': 'toolPdfToImages',
  '/pdf/excel-to-pdf': 'toolExcelToPdf',
  '/pdf/pdf-to-excel': 'toolPdfToExcel',
  '/pdf/edit': 'toolEditPdf',
  '/pdf/watermark': 'toolWatermark',
  '/pdf/page-numbers': 'toolPageNumbers',
  '/pdf/remove-watermark': 'toolRemoveWatermark',

  '/svg/image-to-svg': 'toolTrace',
  '/svg/optimize': 'toolOptimizeSvg',
  '/svg/favicon-generator': 'toolFavicon',

  '/image/remove-background': 'toolRemoveBackground',
  '/image/upscale': 'toolUpscale',
  '/image/remove-object': 'toolRemoveObject',
  '/image/resize': 'toolResize',
  '/image/convert': 'toolConvert',
  '/image/crop': 'toolCrop',
  '/image/remove-watermark': 'toolRemoveWatermark',

  '/record/screen': 'toolRecord',

  '/create/resume': 'toolResume',
  '/create/chart': 'chartBar',
  '/create/qr-code': 'toolQr',
  '/create/chart-builder': 'chartColumn',
  '/create/report-builder': 'toolReport',
  '/create/dashboard': 'toolDashboard',
};

const CATEGORY_ICONS: Record<CategoryId, IconName> = {
  pdf: 'catPdf',
  svg: 'catSvg',
  image: 'catImage',
  record: 'catRecord',
  create: 'catCreate',
};

export function ToolIcon({ href, className }: { href: string; className?: string }) {
  return <Icon name={TOOL_ICONS[href] ?? 'catPdf'} size={20} className={className} />;
}

export function CategoryIcon({ id, className }: { id: CategoryId; className?: string }) {
  return <Icon name={CATEGORY_ICONS[id]} size={20} className={className} />;
}
