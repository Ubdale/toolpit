import type { Metadata } from 'next';

import { ComingSoon } from '@/components/tool/ComingSoon';
import { ToolPage } from '@/components/tool/ToolPage';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/image/upscale';
const tool = getTool(HREF);

export const metadata: Metadata = pageMetadata({
  title: tool.title,
  description: tool.description,
  path: HREF,
  keywords: tool.keywords,
});

export default function Page() {
  return (
    <ToolPage href={HREF}>
      <ComingSoon
        href={HREF}
        plan="A Real-ESRGAN web build will run 2x and 4x upscales tile by tile through WebAssembly, so even large photos fit in browser memory, with a split-slider preview to compare the result against a plain resize."
      />
    </ToolPage>
  );
}
