'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { categories } from '@/lib/tools';

import { Container } from './Container';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-4">
        <Logo />

        <nav aria-label="Tool categories" className="ml-auto hidden sm:block">
          <ul className="flex items-center gap-1">
            {categories.map((category) => {
              const href = `/${category.segment}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={category.id}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-sunken text-text' : 'text-muted hover:bg-sunken hover:text-text',
                    )}
                  >
                    {category.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto sm:ml-0">
          <ThemeToggle />
        </div>
      </Container>

      {/* On narrow screens the same nav becomes a scrollable strip rather than
          a menu that hides the categories behind a tap. */}
      <nav aria-label="Tool categories" className="border-t border-line sm:hidden">
        <ul className="flex gap-1 overflow-x-auto px-4 py-2">
          {categories.map((category) => {
            const href = `/${category.segment}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={category.id}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium',
                    active ? 'bg-sunken text-text' : 'text-muted',
                  )}
                >
                  {category.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
