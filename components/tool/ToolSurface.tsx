import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** The panel every tool UI sits in. */
export function ToolSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small heading used for option groups inside a tool. */
export function ToolSectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-base font-semibold">{children}</h2>;
}
