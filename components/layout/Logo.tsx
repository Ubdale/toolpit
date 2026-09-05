import Link from 'next/link';

/**
 * A tool descending into a pit.
 *
 * The old mark was a padlock, which said "private" but could have belonged to
 * any password manager on the internet. This says the name instead: the T of
 * Toolpit drops into the pit that gives the site its second half, and the stem
 * carries on inside as negative space, so the tool reads as going in rather
 * than sitting on top.
 *
 * It survives 16px, which ruled out the alternatives. A bowl with tokens
 * floating above it turns into a smiley face the moment the shapes are knocked
 * out of a coloured badge, and a triangle over a container reads as an upload
 * arrow - the one thing this site promises never to do.
 */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={className} fill="none">
      {/* The pit: a flat mouth over a half-round floor. */}
      <path d="M3.8 13.2h24.4v5.8a12.2 12.2 0 0 1-24.4 0z" fill="currentColor" />
      {/* The T, its stem reaching the mouth. */}
      <path
        d="M10.6 6.2h10.8M16 6.2v7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="flex h-11 items-center gap-2.5 rounded-lg font-display text-lg font-semibold tracking-tight"
    >
      <LogoMark className="size-7 text-accent" />
      <span>
        Tool<span className="text-accent">pit</span>
      </span>
    </Link>
  );
}
