import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free Private Screen Recording — No Download, No Watermark | Toolpit',
  description:
    'Record and annotate your screen in the browser. Free, no signup, no watermark, and the recording is built on your device rather than uploaded.',
  path: '/record',
  keywords: ['screen recorder', 'browser screen recording', 'free screen capture'],
});

export default function RecordCategoryPage() {
  return (
    <CategoryIndex
      id="record"
      h1="Screen recorder"
      intro="Capture your screen straight from the browser using the recording APIs your browser already ships, then trim and annotate the clip before saving it. No installer, no account, and no upload to somebody else's video host."
    />
  );
}
