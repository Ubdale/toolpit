import Script from 'next/script';

import { adClient, adsEnabled } from '@/lib/ads';

/**
 * The AdSense loader. It goes on every page, which is why /privacy describes
 * advertising unconditionally rather than saying "if ads are shown".
 *
 * `afterInteractive` keeps it off the critical path: the tools are the product
 * and none of them wait on this.
 */
export function AdSenseScript() {
  if (!adsEnabled) return null;

  return (
    <Script
      id="adsbygoogle-init"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`}
    />
  );
}
