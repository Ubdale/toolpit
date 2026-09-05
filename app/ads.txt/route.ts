import { adsEnabled, adsTxt } from '@/lib/ads';

/**
 * Serves /ads.txt from the same constant the ad script reads, so the publisher
 * ID Google finds here always matches the one in the page.
 *
 * Static so it ships as a plain file on the CDN — Google's crawler wants this
 * at the web root of the serving host with a text/plain content type.
 */
export const dynamic = 'force-static';

export function GET() {
  if (!adsEnabled) {
    // Better a 404 than a file naming a publisher we cannot prove we are.
    return new Response('Not found', { status: 404 });
  }

  return new Response(adsTxt(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
