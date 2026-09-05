import type { MetadataRoute } from 'next';

import { absoluteUrl, site } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    // Nothing here is private, and the tools hold no server state to protect,
    // so every crawler gets the whole site.
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
    // `Host` takes a bare hostname, not a URL - it was emitting
    // "Host: https://toolpit.app/", which is not a value the directive
    // accepts. Google ignores it either way; Yandex reads it to pick the
    // canonical mirror, and a malformed one tells it nothing.
    host: new URL(site.url).host,
  };
}
