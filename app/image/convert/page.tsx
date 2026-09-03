import type { Metadata } from 'next';

import { ToolPage } from '@/components/tool/ToolPage';
import ConvertTool from '@/components/tools/image/ConvertTool';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/image/convert';
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
      <ConvertTool />
    </ToolPage>
  );
}
