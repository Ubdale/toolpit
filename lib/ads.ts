/**
 * Google AdSense configuration.
 *
 * This is the ONLY place the publisher ID is written. Both declarations Google
 * cross-checks — the `ads.txt` file at the web root and the `data-ad-client`
 * on the loader script — are generated from this constant, so the two can never
 * drift apart. A mismatch between them is one of the most common AdSense
 * rejections, and making it structurally impossible is cheaper than remembering
 * to keep two files in sync.
 *
 * Set this to the `pub-…` ID exactly as AdSense shows it, including the `ca-`
 * prefix on the script side (added below, not stored here). While it is empty,
 * no ad script renders and /ads.txt returns 404 rather than serving a file that
 * declares a seller who is not us.
 */
export const ADSENSE_PUBLISHER_ID = 'pub-1955444550229676';

/** True once a real publisher ID is configured. */
export const adsEnabled = ADSENSE_PUBLISHER_ID.startsWith('pub-');

/** The `data-ad-client` value: the same ID, with the AdSense `ca-` prefix. */
export const adClient = `ca-${ADSENSE_PUBLISHER_ID}`;

/**
 * The ads.txt body. `DIRECT` because we sell our own inventory, and
 * f08c47fec0942fa0 is Google's certification-authority ID — a fixed constant
 * every AdSense publisher's line carries, not a per-account value.
 */
export function adsTxt(): string {
  return `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`;
}
