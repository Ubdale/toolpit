import Link from 'next/link';

import { site } from '@/lib/site';
import { categories, toolsIn } from '@/lib/tools';

import { Container } from './Container';
import { LogoMark } from './Logo';

/**
 * The footer doubles as the site's full internal-link map: every tool on
 * Toolpit is one click from every page.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-sunken">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
          <div>
            <div className="flex items-center gap-2.5 font-display text-lg font-semibold">
              <LogoMark className="size-6 text-accent" />
              <span>
                Tool<span className="text-accent">pit</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">{site.footerTagline}</p>
          </div>

          {categories.map((category) => (
            <nav key={category.id} aria-labelledby={`footer-${category.id}`}>
              <h2 id={`footer-${category.id}`} className="font-display text-sm font-semibold">
                <Link href={`/${category.segment}`} className="hover:text-accent">
                  {category.label}
                </Link>
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {toolsIn(category.id).map((tool) => (
                  <li key={tool.href}>
                    <Link href={tool.href} className="text-sm text-muted hover:text-accent">
                      {tool.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
          <p>{site.promise}</p>
          <nav aria-label="Site information">
            <ul className="flex gap-5">
              <li>
                <Link href="/how-it-works" className="hover:text-accent">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-accent">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-accent">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-accent">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-accent">
                  Terms
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
