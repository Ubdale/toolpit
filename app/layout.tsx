import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';

import { AdSenseScript } from '@/components/layout/AdSenseScript';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { themeInitScript } from '@/components/layout/ThemeToggle';
import { ToastProvider } from '@/components/ui/Toast';
import { jsonLdProps, organizationJsonLd } from '@/lib/jsonld';
import { site } from '@/lib/site';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.oneLiner}`,
    template: `%s`,
  },
  description: site.oneLiner,
  applicationName: site.name,
  authors: [{ name: site.name, url: site.url }],
  creator: site.name,
  publisher: site.name,
  category: 'technology',
  formatDetection: { telephone: false, address: false, email: false },
  manifest: '/manifest.webmanifest',
  icons: {
    // The .ico is declared first and also sits at /favicon.ico, because
    // browsers and crawlers request that path whether or not a page names it.
    // An SVG follows for anything that will render one crisply at any size.
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/icon-192.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: site.name,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0d0c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script below adds `dark` to this element before React
    // hydrates, so the client's className legitimately differs from the
    // server's. That is the entire point of running it pre-paint — suppressing
    // the warning here is the documented fix, and it is scoped to this one
    // element rather than the tree beneath it.
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before first paint so dark-mode visitors
            never see a white flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* The publisher behind every other structured-data node on the site. */}
        <script {...jsonLdProps(organizationJsonLd())} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-contrast"
        >
          Skip to content
        </a>
        <ToastProvider>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </ToastProvider>
        {/* Page views and real-user performance timings. Neither can see a file
            you opened, because no file is ever part of a request — but both do
            report something, so both are disclosed on /privacy rather than left
            unmentioned. */}
        <Analytics />
        <SpeedInsights />
        {/* Ads pay for the site and load on every page, which is why /privacy
            states that unconditionally rather than hedging with "if ads are
            shown". Renders nothing until a publisher ID is configured. */}
        <AdSenseScript />
      </body>
    </html>
  );
}
