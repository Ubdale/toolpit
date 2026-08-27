import type { Metadata } from 'next';

import { ComingSoon } from '@/components/tool/ComingSoon';
import { ToolPage } from '@/components/tool/ToolPage';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/image/remove-object';
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
        plan="You will brush a mask over what you want gone and an inpainting model will reconstruct the area behind it, running entirely on your device. Masks are editable and the result is regenerated on demand until it looks right."
      />
    </ToolPage>
  );
}
