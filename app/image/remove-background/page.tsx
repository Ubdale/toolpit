import type { Metadata } from 'next';

import { ComingSoon } from '@/components/tool/ComingSoon';
import { ToolPage } from '@/components/tool/ToolPage';
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
      <ComingSoon
        href={HREF}
        plan="A quantized segmentation model will download once, cache in your browser, and then run through onnxruntime-web on your own hardware. You will get a transparent PNG at full resolution, with a brush for touching up edges the model gets wrong."
      />
    </ToolPage>
  );
}
