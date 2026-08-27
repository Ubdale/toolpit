import type { Metadata } from 'next';

import { ToolPage } from '@/components/tool/ToolPage';
import BackgroundRemoverTool from '@/components/tools/ai/BackgroundRemoverTool';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/image/remove-background';
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
      <BackgroundRemoverTool />
    </ToolPage>
  );
}
