'use client';

import { Dialog, Portal } from '@ark-ui/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The one modal.
 *
 * On Ark's Dialog because the parts that are easy to get wrong are exactly the
 * ones it handles: trapping focus inside the panel, restoring it to whatever
 * opened the dialog, closing on Escape from anywhere rather than only while
 * one input has focus, marking the rest of the page inert for screen readers,
 * and locking the background scroll without the page jumping as the scrollbar
 * disappears.
 *
 * Every one of those was hand-rolled - and two of them wrong - in the command
 * palette before this existed.
 */

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive technology. Rendered unless `hideTitle`. */
  title: string;
  description?: string;
  hideTitle?: boolean;
  children: ReactNode;
  /** Pinned to the bottom, outside the scrolling body. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
};

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-5xl',
  // Room for a full page preview without touching the viewport edges.
  full: 'max-w-[min(96rem,95vw)]',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  hideTitle,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[90] bg-canvas/70 backdrop-blur-sm motion-safe:transition-opacity" />

        <Dialog.Positioner className="fixed inset-0 z-[91] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <Dialog.Content
            className={cn(
              'relative my-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl',
              'border border-line bg-surface shadow-card',
              sizes[size],
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className={cn('min-w-0', hideTitle && 'sr-only')}>
                <Dialog.Title className="font-display text-base font-semibold">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-0.5 text-sm text-muted">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>

              <Dialog.CloseTrigger
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-text"
              >
                <Icon name="close" size={18} />
              </Dialog.CloseTrigger>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">{children}</div>

            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
                {footer}
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
