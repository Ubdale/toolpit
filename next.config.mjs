/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Toolpit is a pure client-side product: no API routes, no server functions
  // that ever see a user file. Everything below is static at build time.
  poweredByHeader: false,

  /**
   * One canonical hostname.
   *
   * Both `toolpit.app` and `www.toolpit.app` point at this project, so without
   * this rule the whole site answers on two hostnames with identical content.
   * Every canonical tag names the apex, so search engines consolidate the two
   * correctly either way - but serving one and redirecting the other removes
   * the ambiguity rather than relying on a hint.
   *
   * Kept here rather than in the Vercel dashboard so the rule is versioned
   * with the code, reviewable in a diff, and survives a project being
   * recreated.
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.toolpit.app' }],
        destination: 'https://toolpit.app/:path*',
        // 308 rather than 307: permanent, and it preserves the request method.
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
