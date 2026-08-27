import type { Metadata } from 'next';

import { CategoryIndex } from '@/components/tool/CategoryIndex';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free AI Image Tools That Run On Your Device | Toolpit',
  description:
    'Remove backgrounds, upscale photos and erase objects with AI models that run in your browser. Free, no watermark, no signup — your photo is never uploaded.',
  path: '/image',
  keywords: [
    'ai image tools',
    'on-device ai',
    'free background remover',
    'ai photo editor no upload',
  ],
});

export default function ImageCategoryPage() {
  return (
    <CategoryIndex
      id="image"
      h1="AI image tools"
      intro="Background removal, upscaling and object removal, powered by quantized models that download once and then run entirely on your own hardware. That is the whole point: the AI tools people reach for most are also the ones that usually demand an upload, an account and a watermark."
    />
  );
}
