import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free Private PDF Tools — No Upload, No Signup, No Watermark | Toolpit',
  description:
    'Merge, split, rotate, edit, watermark, compress and convert PDFs in your browser. Every Toolpit PDF tool is free and processes files on your device — nothing is uploaded.',
  path: '/pdf',
  keywords: [
    'free pdf tools',
    'online pdf editor',
    'pdf tools no upload',
    'private pdf tools',
    'edit pdf free',
  ],
});

export default function PdfCategoryPage() {
  return (
    <CategoryIndex
      id="pdf"
      h1="Free PDF tools"
      intro="Twelve PDF tools that do the everyday jobs — editing, signing, combining, splitting, reordering, rotating, watermarking and un-watermarking, numbering, shrinking and converting — without ever asking you to hand your document to a server. Pick a tool, drop your file in, and download the result."
    />
  );
}
