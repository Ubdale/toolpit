'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CategoryIcon } from '@/components/tool/ToolIcon';
import { cn } from '@/lib/cn';
import { categories } from '@/lib/tools';

import { CommandPalette, SearchGlyph, useCommandPalette } from './CommandPalette';
import { Container } from './Container';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();
  const [platform, setPlatform] = useState<'mac' | 'other' | null>(null);

  // The shortcut hint has to match the keyboard in front of the visitor, and
  // that is only knowable in the browser — so it renders as nothing until then
  // rather than guessing and hydrating into a correction.
  useEffect(() => {
    setPlatform(/mac|iphone|ipad/i.test(navigator.userAgent) ? 'mac' : 'other');
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
        <Container className="flex h-16 items-center gap-3">
          <Logo />

          <nav aria-label="Tool categories" className="ml-auto hidden lg:block">
            <ul className="flex items-center gap-0.5">
              {categories.map((category) => {
                const href = `/${category.segment}`;
                const active = isActive(href);
                return (
                  <li key={category.id}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                        active
                          ? 'bg-sunken text-text'
                          : 'text-muted hover:bg-sunken hover:text-text',
                      )}
                    >
                      <CategoryIcon
                        id={category.id}
                        className={cn('size-4', active && 'text-accent')}
                      />
                      {category.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Search tools"
              className={cn(
                'flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-muted',
                'transition-colors hover:border-line-strong hover:text-text',
              )}
            >
              <SearchGlyph className="size-4" />
              <span className="hidden sm:inline">Search tools</span>
              {platform ? (
                <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-sans text-[11px] md:inline">
                  {platform === 'mac' ? '⌘K' : 'Ctrl K'}
                </kbd>
              ) : null}
            </button>

            <ThemeToggle />
          </div>
        </Container>

        {/* On narrow screens the categories become a scrollable strip rather
            than a menu that hides them behind a tap. */}
        <nav aria-label="Tool categories" className="border-t border-line lg:hidden">
          <ul className="flex gap-1 overflow-x-auto px-4 py-2">
            {categories.map((category) => {
              const href = `/${category.segment}`;
              const active = isActive(href);
              return (
                <li key={category.id}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium',
                      active ? 'bg-sunken text-text' : 'text-muted',
                    )}
                  >
                    <CategoryIcon
                      id={category.id}
                      className={cn('size-4', active && 'text-accent')}
                    />
                    {category.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
