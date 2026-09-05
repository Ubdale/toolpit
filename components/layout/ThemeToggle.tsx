'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'toolpit-theme';

/**
 * Stores which theme you picked, and nothing else. Other parts of the site keep
 * their own local state (resume drafts, saved templates) and the ad script sets
 * its own cookies — all of it catalogued on /privacy. Never a byte of a file.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode browsers can refuse storage; the toggle still works.
    }
    setTheme(next);
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      className="grid size-11 place-items-center rounded-xl border border-line text-muted transition-colors hover:bg-sunken hover:text-text"
    >
      {/* Both glyphs render and CSS picks one, so there is no hydration
          mismatch and no icon flash before the effect runs.
          The `hidden` sits on a wrapper rather than on the Icon itself: Icon
          carries its own `inline-block`, `cn` is a plain joiner with no
          conflict resolution, and two competing display utilities on one
          element are settled by stylesheet order — which put both glyphs on
          screen in light mode. A span has no display class to compete with. */}
      <span className="row-start-1 col-start-1 dark:hidden">
        <Icon name="lightMode" size={20} />
      </span>
      <span className="row-start-1 col-start-1 hidden dark:inline-flex">
        <Icon name="darkMode" size={20} />
      </span>
    </button>
  );
}

/**
 * Runs before first paint to apply the stored theme, so a dark-mode visitor
 * never gets a white flash. Injected as a raw <script> from the root layout.
 */
export const themeInitScript = `
try {
  var stored = localStorage.getItem('${STORAGE_KEY}');
  var dark = stored ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;
