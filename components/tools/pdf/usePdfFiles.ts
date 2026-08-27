'use client';

import { useCallback, useState } from 'react';

import { readPageCount } from '@/lib/pdf/operations';

export type LoadedPdf = {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
};

let counter = 0;
const nextId = () => `pdf-${(counter += 1)}`;

/**
 * Shared file-intake state for the PDF tools: reads each dropped file into
 * memory, records its page count, and exposes reorder/remove helpers.
 *
 * Bytes are held in React state and nowhere else — no IndexedDB, no cache, no
 * network. Dropping the state (or closing the tab) is the whole cleanup story.
 */
export function usePdfFiles(multiple: boolean) {
  const [files, setFiles] = useState<LoadedPdf[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const add = useCallback(
    async (incoming: File[]) => {
      setError(null);
      setIsReading(true);

      const loaded: LoadedPdf[] = [];
      const rejected: string[] = [];

      for (const file of incoming) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const pageCount = await readPageCount(bytes);
          loaded.push({ id: nextId(), name: file.name, size: file.size, bytes, pageCount });
        } catch {
          rejected.push(file.name);
        }
      }

      if (rejected.length > 0) {
        setError(
          rejected.length === 1
            ? `${rejected[0]} could not be read — is it a valid PDF?`
            : `${rejected.length} files could not be read — are they valid PDFs?`,
        );
      }

      setFiles((current) => (multiple ? [...current, ...loaded] : loaded.slice(-1)));
      setIsReading(false);
    },
    [multiple],
  );

  const remove = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setFiles((current) => {
      const index = current.findIndex((file) => file.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  return { files, error, setError, isReading, add, remove, move, clear };
}
