'use client';

/**
 * Lazy loader for SVGO, memoised per session.
 *
 * Same rule as the PDF engines: nothing here is imported at module scope, so a
 * visitor who never opens the optimizer never downloads it.
 */

type Svgo = typeof import('svgo/browser');

let svgoPromise: Promise<Svgo> | null = null;

export function loadSvgo(): Promise<Svgo> {
  svgoPromise ??= import('svgo/browser');
  return svgoPromise;
}
