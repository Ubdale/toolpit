import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free Vector & SVG Tools — Trace, Optimize, Favicons | Toolpit',
  description:
    'Trace images into SVG, minify SVG files, and build a complete favicon set — all in your browser. Free, private, no upload and no watermark.',
  path: '/svg',
  keywords: ['svg tools', 'vector tools online', 'image to vector', 'free svg optimizer'],
});

export default function SvgCategoryPage() {
  return (
    <CategoryIndex
      id="svg"
      h1="Vector & SVG tools"
      intro="Turn raster artwork into clean vector paths, strip the bloat out of exported SVGs, and generate every favicon size a site needs. Vector work is fiddly enough without uploading your logo to somebody else's server, so these run locally in your browser."
    />
  );
}
