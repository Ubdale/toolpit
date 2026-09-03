'use client';

import { useEffect, useState } from 'react';

import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { useToast } from './Toast';

export function CopyButton({
  text,
  label = 'Copy',
  variant = 'secondary',
  size = 'md',
}: {
  text: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.show('Copied to your clipboard.');
    } catch {
      // Clipboard access can be refused; the textarea is still selectable.
    }
  }

  return (
    <Button variant={variant} size={size} onClick={copy}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
