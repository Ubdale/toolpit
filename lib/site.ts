export const site = {
  name: 'Toolpit',
  url: 'https://toolpit.app',
  /**
   * Routed through Cloudflare Email Routing to a real inbox. /contact, /about,
   * /privacy and the Organization JSON-LD all render this one constant, so a
   * person and a crawler are never told different addresses.
   */
  contactEmail: 'contact@toolpit.app',
  promise: 'Private by design — your files never leave your device.',
  oneLiner:
    'Free, private browser tools for PDFs, images and vectors — no upload, no signup, no watermark.',
  tagline: 'A pit full of free, private tools.',
  footerTagline:
    'Toolpit — free, private browser tools that keep your files on your device.',
  // Every claim here is about files, which is the part that is structural
  // rather than a promise: there is no upload endpoint, so there is nothing to
  // trust us about. Site-wide wording deliberately stops short of "no
  // tracking", because the ads that pay for the site do set cookies and
  // /privacy says so.
  privacyBadge: 'Private — processed on your device, never uploaded',
  emptyState: 'Drop a file here, or click to choose one',
  comingSoon:
    "This tool is on its way. Like everything on Toolpit, it'll run privately in your browser — no upload, no signup, no watermark.",
  resultReady: 'Done — and your file stayed private the whole time. Download it below.',
  /** Who is behind the site. Named on /about and in the Organization JSON-LD. */
  publisher: 'Toolpit',
} as const;

/**
 * Absolute URL for a site-relative path. Canonicals, OG tags and the sitemap
 * all go through here so a domain change is a one-line edit.
 */
export function absoluteUrl(path: string): string {
  return new URL(path, site.url).toString();
}
