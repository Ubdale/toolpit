import { ImageResponse } from 'next/og';

import { site } from '@/lib/site';

/**
 * Per-page social cards.
 *
 * The static `opengraph-image.tsx` gives every route the same card, which means
 * a link to the resume builder and a link to the QR generator look identical in
 * a Slack message or a tweet. This renders the page's own heading instead, so
 * the preview says what the link actually is — which is the whole job of an
 * OG image, and a real difference in click-through.
 */

export const contentType = 'image/png';

const SIZE = { width: 1200, height: 630 };

/** Satori has no line-breaking oracle, so long headings are wrapped by hand. */
function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > perLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const heading = (params.get('t') || 'Free online tools that never touch a server').slice(0, 120);
  const sub = (params.get('s') || site.oneLiner).slice(0, 200);

  const lines = wrap(heading, 26);
  // Long headings get smaller type rather than an overflowing box.
  const headingSize = lines.length >= 3 ? 60 : lines.length === 2 ? 68 : 76;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0e0d0c',
          color: '#f6f3ed',
          padding: '68px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 15,
              background: '#d1541f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
              <path
                d="M10 14V10a6 6 0 0 1 12 0v4"
                stroke="#fbfaf8"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <rect x="6" y="13.5" width="20" height="12.5" rx="3.2" fill="#fbfaf8" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
            <span>Tool</span>
            <span style={{ color: '#f0743d', marginLeft: -9 }}>pit</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: headingSize,
              fontWeight: 700,
              letterSpacing: -2.5,
              lineHeight: 1.05,
            }}
          >
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div
            style={{
              fontSize: 29,
              color: '#a29a8b',
              letterSpacing: -0.4,
              lineHeight: 1.35,
              display: 'flex',
            }}
          >
            {sub.length > 128 ? `${sub.slice(0, 125)}…` : sub}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            alignSelf: 'flex-start',
            padding: '13px 24px',
            borderRadius: 999,
            border: '1px solid #23453a',
            background: '#12241d',
            color: '#5fd6a6',
            fontSize: 25,
          }}
        >
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2.5" stroke="#5fd6a6" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#5fd6a6" strokeWidth="2" />
          </svg>
          <span>{site.promise}</span>
        </div>
      </div>
    ),
    SIZE,
  );
}
