import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free Image Tools — Resize, Crop, Convert & AI | Toolpit',
  description:
    'Resize, crop and convert images, or remove backgrounds and upscale with on-device AI. Free, no signup, no watermark — your photos are never uploaded.',
  path: '/image',
  keywords: [
    'free image tools',
    'resize image online',
    'convert image format',
    'ai image tools',
    'image editor no upload',
  ],
});

export default function ImageCategoryPage() {
  return (
    <CategoryIndex
      id="image"
      h1="Image tools"
      intro="The everyday jobs — resizing, cropping, converting between formats, in bulk — alongside four AI tools that remove backgrounds, erase objects, strip watermarks and enlarge photos. The AI models are quantized to download once and then run entirely on your own hardware, which is the whole point: those are exactly the tools that normally demand an upload, an account and a watermark."
    />
  );
}
