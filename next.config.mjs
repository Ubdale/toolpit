/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Toolpit is a pure client-side product: no API routes, no server functions
  // that ever see a user file. Everything below is static at build time.
  poweredByHeader: false,
};

export default nextConfig;
