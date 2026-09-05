import { adClient, adsEnabled } from '@/lib/ads';

/**
 * The AdSense loader, rendered as a plain script tag in the document head.
 *
 * It deliberately does not use next/script. With `strategy="afterInteractive"`
 * Next emits only a `<link rel="preload" as="script">` into the server HTML and
 * injects the real element after hydration - so a crawler that reads the markup
 * without running React finds a preload hint and no snippet. AdSense's
 * ownership check is exactly such a crawler, and it fails on that.
 *
 * A raw tag costs nothing here: `async` already keeps it off the critical path,
 * and being in the initial HTML is the whole point.
 */
export function AdSenseScript() {
  if (!adsEnabled) return null;

  return (
    <script
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`}
    />
  );
}
