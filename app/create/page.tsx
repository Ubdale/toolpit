import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free Resume, Chart & QR Code Makers — No Signup | Toolpit',
  description:
    'Build a resume, a chart or a QR code in your browser and export it clean. Free, no signup, no watermark — and nothing you type is uploaded.',
  path: '/create',
  keywords: [
    'free resume builder',
    'free chart maker',
    'free qr code generator',
    'design tools no signup',
  ],
});

export default function CreateCategoryPage() {
  return (
    <CategoryIndex
      id="create"
      h1="Create &amp; design"
      intro="The other tools on Toolpit take a file and change it. These three start from nothing: a resume, a chart, a QR code. They are also the tools where what you type is most personal — an employment history, unreleased revenue, a Wi-Fi password — so it matters more than anywhere else that none of it is uploaded."
    />
  );
}
