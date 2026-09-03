'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { loadImage } from '@/lib/image/transform';

export type LoadedImageFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  /** Object URL for previews. Revoked when the entry is dropped. */
  url: string;
};

let counter = 0;
const nextId = () => `image-${(counter += 1)}`;

/**
 * File intake for the image tools: reads each file's real dimensions and hands
 * back a preview URL.
 *
 * Object URLs are the one thing here that leaks if ignored — they pin the whole
 * decoded file in memory until revoked, and a batch of forty photos is a lot to
 * pin. Every path that drops an entry revokes its URL, including unmount.
 */
export function useImageFiles(multiple: boolean) {
  const [files, setFiles] = useState<LoadedImageFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  // Revoking on unmount needs the latest list without making the effect depend
  // on it, or every change would tear down and rebuild the cleanup.
  const filesRef = useRef<LoadedImageFile[]>([]);
  filesRef.current = files;

  useEffect(
    () => () => {
      for (const entry of filesRef.current) URL.revokeObjectURL(entry.url);
    },
    [],
  );

  const add = useCallback(
    async (incoming: File[]) => {
      setError(null);
      setIsReading(true);

      const loaded: LoadedImageFile[] = [];
      const rejected: string[] = [];

      for (const file of incoming) {
        try {
          const image = await loadImage(file);
          image.bitmap.close();
          loaded.push({
            id: nextId(),
            file,
            name: file.name,
            size: file.size,
            width: image.width,
            height: image.height,
            url: URL.createObjectURL(file),
          });
        } catch {
          rejected.push(file.name);
        }
      }

      if (rejected.length > 0) {
        setError(
          rejected.length === 1
            ? `${rejected[0]} could not be read as an image.`
            : `${rejected.length} files could not be read as images.`,
        );
      }

      setFiles((current) => {
        if (multiple) return [...current, ...loaded];
        for (const entry of current) URL.revokeObjectURL(entry.url);
        return loaded.slice(-1);
      });
      setIsReading(false);
    },
    [multiple],
  );

  const remove = useCallback((id: string) => {
    setFiles((current) => {
      const target = current.find((entry) => entry.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setFiles((current) => {
      for (const entry of current) URL.revokeObjectURL(entry.url);
      return [];
    });
    setError(null);
  }, []);

  return { files, error, setError, isReading, add, remove, clear };
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp';
