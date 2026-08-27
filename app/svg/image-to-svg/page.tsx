import type { Metadata } from 'next';

import { ComingSoon } from '@/components/tool/ComingSoon';
import { ToolPage } from '@/components/tool/ToolPage';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/svg/image-to-svg';
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
        plan="The tracer will run a Potrace-style algorithm compiled to WebAssembly, with controls for colour count, path smoothing and speckle removal, and a live side-by-side preview of the bitmap and the traced result before you download the SVG."
      />
    </ToolPage>
  );
}
