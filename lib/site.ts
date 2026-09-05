export const site = {
  name: 'Toolpit',
  url: 'https://toolpit.app',
  /**
   * PLACEHOLDER — set this to a mailbox you actually read before launch.
   * AdSense checks that a stated contact method works, and /contact, /about
   * and /privacy all render this one constant, so there is a single line to
   * change. Keep it a role address on the site's own domain rather than a
   * personal inbox.
   */
  contactEmail: 'hello@toolpit.app',
  promise: 'Your files never leave your device.',
  oneLiner:
    'Free browser tools for PDFs, images, and vectors — no upload, no signup, no watermark.',
  tagline: 'A pit full of free tools.',
  footerTagline:
    'Toolpit — free browser tools that keep your files on your device.',
  privacyBadge: 'Processed on your device — never uploaded',
  emptyState: 'Drop a file here, or click to choose one',
  comingSoon:
    "This tool is on its way. Like everything on Toolpit, it'll run entirely in your browser — no upload, no signup, no watermark.",
  resultReady: 'Done — and your file never left your device. Download it below.',
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
