import type { Metadata } from 'next';

import { ComingSoon } from '@/components/tool/ComingSoon';
import { ToolPage } from '@/components/tool/ToolPage';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/svg/favicon-generator';
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
        plan="It will render every size the modern web asks for — 16, 32, 48, 180 and 512 pixels, plus a multi-resolution .ico and a maskable PWA icon — bundle them into a ZIP, and hand you the matching &lt;link&gt; tags to paste into your &lt;head&gt;."
      />
    </ToolPage>
  );
}
