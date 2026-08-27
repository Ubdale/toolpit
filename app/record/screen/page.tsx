import type { Metadata } from 'next';

import { ComingSoon } from '@/components/tool/ComingSoon';
import { ToolPage } from '@/components/tool/ToolPage';
import { pageMetadata } from '@/lib/seo';
import { getTool } from '@/lib/tools';

const HREF = '/record/screen';
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
        plan="Recording will use getDisplayMedia and MediaRecorder directly — the APIs your browser already ships — with optional microphone audio, a trim handle for the start and end of the clip, and simple annotation tools before you save the WebM file."
      />
    </ToolPage>
  );
}
