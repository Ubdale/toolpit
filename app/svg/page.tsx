import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free SVG Tools — Optimize SVG & Generate Favicons | Toolpit',
  description:
    'Minify bloated SVG exports and build a complete favicon set, all in your browser. Free, private, no upload and no watermark.',
  path: '/svg',
  keywords: ['svg tools', 'svg optimizer', 'minify svg', 'favicon generator'],
});

export default function SvgCategoryPage() {
  return (
    <CategoryIndex
      id="svg"
      h1="Vector & SVG tools"
      intro="Strip the bloat out of SVGs your design tool exported, and generate every favicon size a site needs. Vector work is fiddly enough without uploading your logo to somebody else's server, so these run locally in your browser."
    />
  );
}
