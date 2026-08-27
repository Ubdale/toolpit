import Link from 'next/link';

/**
 * The mark is a shackle over a pit — the two halves of the brand (privacy and
 * a deep well of tools) in one shape.
 */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 14V10a6 6 0 0 1 12 0v4" />
      <rect x="5" y="14" width="22" height="13" rx="3.5" fill="currentColor" stroke="none" />
      <path d="M16 19v3" className="text-canvas" stroke="var(--tp-canvas)" strokeWidth="2.4" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg font-display text-lg font-semibold tracking-tight"
    >
      <LogoMark className="size-7 text-accent" />
      <span>
        Tool<span className="text-accent">pit</span>
      </span>
    </Link>
  );
}
