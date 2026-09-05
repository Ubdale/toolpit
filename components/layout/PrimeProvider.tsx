'use client';

import { PrimeReactProvider } from '@primereact/core';
import type { ReactNode } from 'react';

/**
 * PrimeReact's context, which every one of its primitives requires.
 *
 * It carries no theme: the v11 primitives ship no CSS at all, so this provides
 * locale, portal target and pass-through plumbing rather than any styling. The
 * look of every control still comes entirely from our own classes.
 *
 * A client component because the provider holds React context, and the root
 * layout is a server component.
 */
export function PrimeProvider({ children }: { children: ReactNode }) {
  return <PrimeReactProvider>{children}</PrimeReactProvider>;
}
