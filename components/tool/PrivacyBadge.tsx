import { cn } from '@/lib/cn';
import { site } from '@/lib/site';
import { Icon } from '@/components/ui/Icon';

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

export function LockGlyph({ className }: { className?: string }) {
  return <Icon name="lock" size={14} className={cn('shrink-0', className)} />;
}
