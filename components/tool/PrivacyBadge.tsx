import { cn } from '@/lib/cn';
import { site } from '@/lib/site';

/** The lock badge that appears on every single tool page. */
export function PrivacyBadge({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-vault-line bg-vault-soft',
        'px-3 py-1.5 text-xs font-medium text-vault',
        className,
      )}
    >
      <LockGlyph />
      {site.privacyBadge}
    </p>
  );
}

export function LockGlyph({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
