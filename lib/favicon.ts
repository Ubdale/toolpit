'use client';

import { canvasToBlob } from './pdf/operations';

export type FaviconSettings = {
  /** Hex colour, or 'transparent' to keep the source's alpha. */
  background: string;
  /** Percentage of the canvas left as empty margin around the artwork. */
  padding: number;
};

export const defaultFaviconSettings: FaviconSettings = {
  background: 'transparent',
  padding: 0,
};

export type GeneratedIcon = {
  filename: string;
  size: number;
  blob: Blob;
  /** What this file is for, shown next to it in the UI. */
  purpose: string;
};

/**
 * Every size a site actually needs in 2026 — not the forty-file dump that
 * favicon generators produced a decade ago, most of which no browser has read
 * for years.
 */
const OUTPUTS: { size: number; filename: string; purpose: string; opaque?: boolean }[] = [
  { size: 16, filename: 'favicon-16x16.png', purpose: 'Browser tab' },
  { size: 32, filename: 'favicon-32x32.png', purpose: 'Browser tab, retina' },
  { size: 48, filename: 'favicon-48x48.png', purpose: 'Windows shortcuts' },
  {
    size: 180,
    filename: 'apple-touch-icon.png',
    purpose: 'iOS home screen',
    // iOS composites transparent icons onto black, so this one always gets a
    // ground colour whether the visitor asked for one or not.
    opaque: true,
  },
  { size: 192, filename: 'icon-192.png', purpose: 'Android home screen' },
  { size: 512, filename: 'icon-512.png', purpose: 'PWA splash screen' },
];

/** The safe zone Android crops a maskable icon to is the middle 80%. */
const MASKABLE_PADDING = 0.1;

export type SourceImage = {
  draw: (context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
  width: number;
  height: number;
  release: () => void;
};

/**
 * Loads the source artwork.
 *
 * SVG goes through an <img> element rather than createImageBitmap, which
 * refuses SVG without an explicit intrinsic size in several browsers.
 */
export async function loadSourceImage(file: File): Promise<SourceImage> {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Could not read that SVG.'));
        element.src = url;
      });
      const width = image.naturalWidth || 512;
      const height = image.naturalHeight || 512;
      return {
        width,
        height,
        draw: (context, x, y, w, h) => context.drawImage(image, x, y, w, h),
        release: () => URL.revokeObjectURL(url),
      };
    } catch (cause) {
      URL.revokeObjectURL(url);
      throw cause;
    }
  }

  const bitmap = await createImageBitmap(file);
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw: (context, x, y, w, h) => context.drawImage(bitmap, x, y, w, h),
    release: () => bitmap.close(),
  };
}

function renderIcon(
  source: SourceImage,
  size: number,
  background: string,
  padding: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not open a 2D canvas.');

  if (background !== 'transparent') {
    context.fillStyle = background;
    context.fillRect(0, 0, size, size);
  }

  const box = size * (1 - padding * 2);
  const scale = Math.min(box / source.width, box / source.height);
  const width = source.width * scale;
  const height = source.height * scale;

  context.imageSmoothingQuality = 'high';
  source.draw(context, (size - width) / 2, (size - height) / 2, width, height);

  return canvas;
}

export async function generateIcons(
  source: SourceImage,
  settings: FaviconSettings,
): Promise<GeneratedIcon[]> {
  const icons: GeneratedIcon[] = [];
  const opaqueFallback =
    settings.background === 'transparent' ? '#ffffff' : settings.background;

  for (const output of OUTPUTS) {
    const background = output.opaque ? opaqueFallback : settings.background;
    const canvas = renderIcon(source, output.size, background, settings.padding);
    icons.push({
      filename: output.filename,
      size: output.size,
      purpose: output.purpose,
      blob: await canvasToBlob(canvas, 'image/png'),
    });
  }

  // Maskable icons are cropped to a circle on some launchers, so the artwork
  // has to sit inside the safe zone with a solid ground behind it.
  const maskable = renderIcon(
    source,
    512,
    opaqueFallback,
    Math.max(settings.padding, MASKABLE_PADDING),
  );
  icons.push({
    filename: 'icon-maskable-512.png',
    size: 512,
    purpose: 'Android adaptive icon',
    blob: await canvasToBlob(maskable, 'image/png'),
  });

  return icons;
}

/**
 * Packs PNGs into an .ico container.
 *
 * Windows has accepted PNG-compressed ICO entries since Vista, so there is no
 * need to encode a BMP with its upside-down rows and separate AND mask.
 */
export async function buildIco(icons: GeneratedIcon[]): Promise<Blob> {
  const entries = icons
    .filter((icon) => [16, 32, 48].includes(icon.size))
    .sort((a, b) => a.size - b.size);

  const payloads = await Promise.all(
    entries.map(async (icon) => new Uint8Array(await icon.blob.arrayBuffer())),
  );

  const header = new Uint8Array(6 + entries.length * 16);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, entries.length, true);

  let offset = header.length;
  entries.forEach((icon, index) => {
    const base = 6 + index * 16;
    const payload = payloads[index]!;
    // 256px is stored as 0 in a single byte; none of our sizes hit that, but
    // the mask keeps the field honest.
    header[base] = icon.size & 0xff;
    header[base + 1] = icon.size & 0xff;
    header[base + 2] = 0; // palette size
    header[base + 3] = 0; // reserved
    view.setUint16(base + 4, 1, true); // colour planes
    view.setUint16(base + 6, 32, true); // bits per pixel
    view.setUint32(base + 8, payload.length, true);
    view.setUint32(base + 12, offset, true);
    offset += payload.length;
  });

  return new Blob([header as unknown as BlobPart, ...(payloads as unknown as BlobPart[])], {
    type: 'image/x-icon',
  });
}

export function headSnippet(): string {
  return `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
<link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;
}

export function manifestJson(background: string): string {
  return JSON.stringify(
    {
      name: 'Your site',
      short_name: 'Your site',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
      theme_color: background === 'transparent' ? '#ffffff' : background,
      background_color: background === 'transparent' ? '#ffffff' : background,
      display: 'standalone',
      start_url: '/',
    },
    null,
    2,
  );
}
