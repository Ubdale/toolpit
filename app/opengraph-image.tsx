import { ImageResponse } from 'next/og';

import { site } from '@/lib/site';

export const alt = `${site.name} — ${site.oneLiner}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The default social card, prerendered at build time. Every route inherits it
 * unless it sets its own `openGraph.images`.
 */
export default function OpengraphImage() {
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
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#d1541f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <path
                d="M10 14V10a6 6 0 0 1 12 0v4"
                stroke="#fbfaf8"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <rect x="6" y="13.5" width="20" height="12.5" rx="3.2" fill="#fbfaf8" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            {/* Satori spaces adjacent spans; the negative margin closes the
                seam so the wordmark reads as one word. */}
            <span>Tool</span>
            <span style={{ color: '#f0743d', marginLeft: -10 }}>pit</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 68,
              fontWeight: 700,
              letterSpacing: -2.5,
              lineHeight: 1.05,
            }}
          >
            <span>Free online tools that</span>
            <span>never touch a server</span>
          </div>
          <div style={{ fontSize: 32, color: '#a29a8b', letterSpacing: -0.5 }}>
            PDFs, images and vectors — no upload, no signup, no watermark.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            alignSelf: 'flex-start',
            padding: '14px 24px',
            borderRadius: 999,
            border: '1px solid #23453a',
            background: '#12241d',
            color: '#5fd6a6',
            fontSize: 26,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect
              x="4"
              y="10"
              width="16"
              height="10"
              rx="2.5"
              stroke="#5fd6a6"
              strokeWidth="2"
            />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#5fd6a6" strokeWidth="2" />
          </svg>
          <span>{site.promise}</span>
        </div>
      </div>
    ),
    size,
  );
}
