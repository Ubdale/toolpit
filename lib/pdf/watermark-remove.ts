'use client';

import type { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';

import {
  serializeContentStream,
  shownText,
  tokenizeContentStream,
  TEXT_SHOWING,
  type Operation,
} from './content-stream';
import { copyBytes, loadPdfLib } from './runtime';

/**
 * Finding and removing watermarks that are *objects in the file* rather than
 * pixels in a picture.
 *
 * This is the distinction the whole tool rests on. A watermark added by Word,
 * Acrobat, an online stamper — or by Toolpit's own watermark tool — is separate
 * content: a stamp annotation, an optional-content layer, a run of text, or an
 * image drawn on every page. All four can be taken out and leave the document
 * otherwise identical, with its text still text and selectable.
 *
 * What is *not* removable this way is a watermark that was flattened into a
 * scanned or re-rendered page. At that point it is not a watermark any more, it
 * is part of the picture, and the only options are to paint it out or to accept
 * it. The tool says so rather than pretending otherwise.
 */

const LOAD_OPTIONS = { ignoreEncryption: true } as const;

export type FindingKind = 'annotation' | 'layer' | 'text' | 'image';

export type Finding = {
  /** Stable across a scan/remove pair, so the UI can pass back a selection. */
  id: string;
  kind: FindingKind;
  /** What to show in the list. */
  label: string;
  /** Why this looked like a watermark. */
  detail: string;
  /** Zero-based pages it appears on. */
  pages: number[];
  /** How strongly this looks like a watermark rather than real content. */
  confidence: 'high' | 'medium' | 'low';
};

export type ScanResult = {
  findings: Finding[];
  pageCount: number;
  /** True when the pages carry no extractable text at all — i.e. they are scans. */
  looksRasterized: boolean;
};

/**
 * The human-readable name of an optional-content group.
 *
 * PDF name-of-a-layer is a text string, which pdf-lib models as either a
 * PDFString or a PDFHexString — both carry `decodeText`, and neither shares a
 * base type that declares it, so this probes for the method rather than
 * branching on two constructors.
 */
function textStringValue(value: unknown): string {
  const candidate = value as { decodeText?: () => string } | undefined;
  return typeof candidate?.decodeText === 'function' ? candidate.decodeText() : '';
}

/** A page is "most pages" if a thing appears on at least this share of them. */
const REPEAT_SHARE = 0.6;

function isRepeatedEnough(pages: Set<number>, pageCount: number): boolean {
  if (pageCount === 1) return true;
  return pages.size >= Math.max(2, Math.ceil(pageCount * REPEAT_SHARE));
}

/** Page content as one buffer, whether it was stored as one stream or several. */
async function pageContentBytes(page: PDFDict): Promise<Uint8Array | null> {
  const { PDFArray, PDFName, PDFRawStream, decodePDFRawStream } = await loadPdfLib();

  const contents = page.lookup(PDFName.of('Contents'));
  if (!contents) return null;

  const streams: Uint8Array[] = [];

  const push = (value: unknown) => {
    if (value instanceof PDFRawStream) {
      try {
        streams.push(decodePDFRawStream(value).decode());
      } catch {
        // An undecodable stream is skipped rather than failing the whole scan.
      }
    }
  };

  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) push(contents.lookup(i));
  } else {
    push(contents);
  }

  if (streams.length === 0) return null;
  if (streams.length === 1) return streams[0]!;

  // Viewers treat the array as one stream with whitespace between the parts.
  const total = streams.reduce((sum, part) => sum + part.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of streams) {
    joined.set(part, offset);
    offset += part.length;
    joined[offset] = 0x0a;
    offset += 1;
  }
  return joined;
}

/**
 * A page's XObject or Properties dictionary.
 *
 * /Resources is an *inheritable* attribute: a document may set it once on the
 * page-tree node and leave every page without one of its own. Looking the key
 * up directly on the page finds nothing in that case and the scan silently
 * misses every image and layer in the file, so this goes through pdf-lib's
 * `Resources()`, which walks up the parent chain.
 */
function resourceDict(
  page: PDFDict,
  category: string,
  PDFNameCtor: typeof PDFName,
): PDFDict | null {
  const leaf = page as PDFDict & { Resources?: () => PDFDict | undefined };
  const resources =
    typeof leaf.Resources === 'function'
      ? leaf.Resources()
      : (page.lookup(PDFNameCtor.of('Resources')) as PDFDict | undefined);

  const group = resources?.lookup(PDFNameCtor.of(category));
  return (group as PDFDict) ?? null;
}

export async function scanForWatermarks(bytes: Uint8Array): Promise<ScanResult> {
  const lib = await loadPdfLib();
  const { PDFDocument, PDFDict, PDFName, PDFArray, PDFRef } = lib;

  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const pages = doc.getPages();
  const pageCount = pages.length;

  // Grouped by what makes two occurrences "the same thing".
  const annotations = new Map<string, { label: string; pages: Set<number> }>();
  const layers = new Map<string, { label: string; pages: Set<number> }>();
  const texts = new Map<string, { text: string; pages: Set<number>; count: number }>();
  const images = new Map<string, { pages: Set<number>; count: number }>();

  let anyText = false;

  for (const [pageIndex, page] of pages.entries()) {
    const node = page.node;

    // -------------------------------------------------------- annotations
    const annots = node.lookup(PDFName.of('Annots'));
    if (annots instanceof PDFArray) {
      for (let i = 0; i < annots.size(); i += 1) {
        const annot = annots.lookup(i) as PDFDict | undefined;
        if (!(annot instanceof PDFDict)) continue;

        const subtype = annot.lookup(PDFName.of('Subtype')) as PDFName | undefined;
        const name = subtype?.asString?.() ?? '';
        if (name !== '/Watermark' && name !== '/Stamp') continue;

        const key = name;
        const entry = annotations.get(key) ?? {
          label: name === '/Watermark' ? 'Watermark annotation' : 'Stamp annotation',
          pages: new Set<number>(),
        };
        entry.pages.add(pageIndex);
        annotations.set(key, entry);
      }
    }

    // ------------------------------------------------------------- layers
    const properties = resourceDict(node, 'Properties', PDFName);
    if (properties) {
      for (const [key, value] of properties.entries()) {
        const group = (value instanceof PDFRef ? doc.context.lookup(value) : value) as
          | PDFDict
          | undefined;
        if (!(group instanceof PDFDict)) continue;

        const type = (group.lookup(PDFName.of('Type')) as PDFName | undefined)?.asString?.();
        if (type !== '/OCG') continue;

        const label =
          textStringValue(group.lookup(PDFName.of('Name'))) || key.asString().replace(/^\//, '');

        const entry = layers.get(label) ?? { label, pages: new Set<number>() };
        entry.pages.add(pageIndex);
        layers.set(label, entry);
      }
    }

    // ------------------------------------------------- content operations
    const content = await pageContentBytes(node);
    if (!content) continue;

    const operations = tokenizeContentStream(content);
    const xobjects = resourceDict(node, 'XObject', PDFName);

    for (const operation of operations) {
      if (TEXT_SHOWING.has(operation.operator)) {
        const text = shownText(operation);
        if (text.trim()) anyText = true;

        // Group on the raw operand rather than the decoded text: a subset font
        // decodes to nonsense, but the *same* nonsense on every page, which is
        // exactly the signal we want.
        const key = operation.operands.map((operand) => operand.raw).join(' ');
        if (!key.trim()) continue;

        const entry = texts.get(key) ?? { text, pages: new Set<number>(), count: 0 };
        entry.pages.add(pageIndex);
        entry.count += 1;
        texts.set(key, entry);
        continue;
      }

      if (operation.operator === 'Do' && xobjects) {
        const nameOperand = operation.operands[operation.operands.length - 1];
        if (!nameOperand || nameOperand.kind !== 'name') continue;

        const ref = xobjects.get(PDFName.of(nameOperand.raw.slice(1)));
        const target = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
        const subtype = (target as PDFDict | undefined)?.lookup?.(PDFName.of('Subtype')) as
          | PDFName
          | undefined;
        if (subtype?.asString?.() !== '/Image') continue;

        // Key on the object reference, so the same image reused across pages
        // groups together even under different resource names.
        const key = ref instanceof PDFRef ? ref.toString() : nameOperand.raw;
        const entry = images.get(key) ?? { pages: new Set<number>(), count: 0 };
        entry.pages.add(pageIndex);
        entry.count += 1;
        images.set(key, entry);
      }
    }
  }

  const findings: Finding[] = [];

  for (const [key, entry] of annotations) {
    findings.push({
      id: `annotation:${key}`,
      kind: 'annotation',
      label: entry.label,
      detail: 'An annotation layered over the page. Removing it cannot affect the page content.',
      pages: [...entry.pages].sort((a, b) => a - b),
      confidence: 'high',
    });
  }

  for (const [key, entry] of layers) {
    const named = /water ?mark|draft|confidential|sample|copy|logo|stamp/i.test(entry.label);
    findings.push({
      id: `layer:${key}`,
      kind: 'layer',
      label: `Layer “${entry.label}”`,
      detail: named
        ? 'An optional-content layer whose name says what it is.'
        : 'An optional-content layer. Check the preview — it may hold real content.',
      pages: [...entry.pages].sort((a, b) => a - b),
      confidence: named ? 'high' : 'low',
    });
  }

  for (const [key, entry] of texts) {
    if (!isRepeatedEnough(entry.pages, pageCount)) continue;

    const clean = entry.text.replace(/\s+/g, ' ').trim();
    // Page numbers and running heads repeat too, so they must not be offered as
    // confidently as something that actually reads like a watermark.
    const looksLikeWatermark = /draft|confidential|sample|copy|do not|watermark|preview|trial|©|\bwww\.|\.com\b/i.test(
      clean,
    );
    const shouty = clean.length >= 3 && clean === clean.toUpperCase() && /[A-Z]{3}/.test(clean);

    findings.push({
      id: `text:${key}`,
      kind: 'text',
      label: clean ? `Text “${truncate(clean, 42)}”` : 'Repeated text (unreadable font encoding)',
      detail: `Drawn on ${entry.pages.size} of ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
      pages: [...entry.pages].sort((a, b) => a - b),
      confidence: looksLikeWatermark ? 'high' : shouty ? 'medium' : 'low',
    });
  }

  for (const [key, entry] of images) {
    if (!isRepeatedEnough(entry.pages, pageCount)) continue;
    findings.push({
      id: `image:${key}`,
      kind: 'image',
      label: 'Repeated image',
      detail: `The same image is drawn on ${entry.pages.size} of ${pageCount} page${
        pageCount === 1 ? '' : 's'
      } — often a logo stamp.`,
      pages: [...entry.pages].sort((a, b) => a - b),
      confidence: 'medium',
    });
  }

  // Sort the likely answers to the top.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  findings.sort(
    (a, b) => rank[a.confidence] - rank[b.confidence] || b.pages.length - a.pages.length,
  );

  return { findings, pageCount, looksRasterized: !anyText };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// ------------------------------------------------------------------- removal

/**
 * Deletes the selected findings and returns the rebuilt document.
 *
 * Text and image removals are done by rewriting the content stream: the drawing
 * instruction goes, and everything around it — including the graphics state —
 * is written back exactly as it was found.
 */
export async function removeWatermarks(
  bytes: Uint8Array,
  selectedIds: string[],
): Promise<{ bytes: Uint8Array; removed: number }> {
  const lib = await loadPdfLib();
  const { PDFDocument, PDFDict, PDFName, PDFArray, PDFRef } = lib;

  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const pages = doc.getPages();

  const textKeys = new Set(
    selectedIds.filter((id) => id.startsWith('text:')).map((id) => id.slice('text:'.length)),
  );
  const imageKeys = new Set(
    selectedIds.filter((id) => id.startsWith('image:')).map((id) => id.slice('image:'.length)),
  );
  const layerNames = new Set(
    selectedIds.filter((id) => id.startsWith('layer:')).map((id) => id.slice('layer:'.length)),
  );
  const annotationTypes = new Set(
    selectedIds
      .filter((id) => id.startsWith('annotation:'))
      .map((id) => id.slice('annotation:'.length)),
  );

  let removed = 0;

  for (const page of pages) {
    const node = page.node;

    // -------------------------------------------------------- annotations
    if (annotationTypes.size > 0) {
      const annots = node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) {
        const keep: unknown[] = [];
        for (let i = 0; i < annots.size(); i += 1) {
          const raw = annots.get(i);
          const annot = annots.lookup(i) as PDFDict | undefined;
          const subtype = (annot?.lookup?.(PDFName.of('Subtype')) as PDFName | undefined)?.asString?.();

          if (subtype && annotationTypes.has(subtype)) {
            removed += 1;
            continue;
          }
          keep.push(raw);
        }

        if (keep.length !== annots.size()) {
          const replacement = doc.context.obj([]) as PDFArray;
          for (const entry of keep) replacement.push(entry as never);
          node.set(PDFName.of('Annots'), replacement);
        }
      }
    }

    // ------------------------------------------------- content operations
    if (textKeys.size === 0 && imageKeys.size === 0 && layerNames.size === 0) continue;

    const content = await pageContentBytes(node);
    if (!content) continue;

    const operations = tokenizeContentStream(content);
    const xobjects = resourceDict(node, 'XObject', PDFName);
    const properties = resourceDict(node, 'Properties', PDFName);

    // Which resource names on this page point at a selected image.
    const doomedNames = new Set<string>();
    if (imageKeys.size > 0 && xobjects) {
      for (const [key, value] of xobjects.entries()) {
        const id = value instanceof PDFRef ? value.toString() : key.asString();
        if (imageKeys.has(id) || imageKeys.has(key.asString())) doomedNames.add(key.asString());
      }
    }

    // Which marked-content property names refer to a selected layer.
    const doomedLayers = new Set<string>();
    if (layerNames.size > 0 && properties) {
      for (const [key, value] of properties.entries()) {
        const group = (value instanceof PDFRef ? doc.context.lookup(value) : value) as
          | PDFDict
          | undefined;
        if (!(group instanceof PDFDict)) continue;
        const label =
          textStringValue(group.lookup(PDFName.of('Name'))) || key.asString().replace(/^\//, '');
        if (layerNames.has(label)) doomedLayers.add(key.asString());
      }
    }

    const { kept, dropped } = filterOperations(operations, {
      textKeys,
      doomedNames,
      doomedLayers,
    });

    if (dropped === 0) continue;
    removed += dropped;

    const stream = doc.context.flateStream(serializeContentStream(kept));
    node.set(PDFName.of('Contents'), doc.context.register(stream));
  }

  // Selected layers are also switched off in the catalogue, so any reference
  // that survived in an appearance stream stops rendering too.
  if (layerNames.size > 0) {
    turnOffLayers(doc, layerNames, lib);
  }

  return { bytes: await doc.save({ useObjectStreams: true }), removed };
}

type FilterTargets = {
  textKeys: Set<string>;
  doomedNames: Set<string>;
  doomedLayers: Set<string>;
};

/**
 * Walks the operation list once, dropping the drawing instructions that belong
 * to a selected watermark.
 *
 * Text is dropped at the level of the whole `BT … ET` block when any showing
 * operation inside it matched — removing just the `Tj` would leave the text
 * positioning behind, which is harmless but leaves the file untidy, and a
 * watermark's text block never contains anything else.
 */
function filterOperations(
  operations: Operation[],
  targets: FilterTargets,
): { kept: Operation[]; dropped: number } {
  const kept: Operation[] = [];
  let dropped = 0;

  // Depth of nested marked-content blocks belonging to a doomed layer.
  let hiddenDepth = 0;
  let markedDepth = 0;

  for (let i = 0; i < operations.length; i += 1) {
    const operation = operations[i]!;

    // ------------------------------------------------------ marked content
    if (operation.operator === 'BDC' || operation.operator === 'BMC') {
      markedDepth += 1;
      if (hiddenDepth === 0 && operation.operator === 'BDC') {
        const tag = operation.operands[0];
        const property = operation.operands[1];
        if (
          tag?.raw === '/OC' &&
          property?.kind === 'name' &&
          targets.doomedLayers.has(property.raw)
        ) {
          hiddenDepth = markedDepth;
          dropped += 1;
          continue;
        }
      }
      if (hiddenDepth > 0) continue;
    }

    if (operation.operator === 'EMC') {
      if (hiddenDepth > 0 && markedDepth === hiddenDepth) {
        hiddenDepth = 0;
        markedDepth -= 1;
        continue;
      }
      markedDepth = Math.max(0, markedDepth - 1);
      if (hiddenDepth > 0) continue;
    }

    if (hiddenDepth > 0) continue;

    // --------------------------------------------------------------- text
    if (operation.operator === 'BT') {
      // Look ahead to the matching ET and decide about the block as a whole.
      let end = i + 1;
      let matched = false;
      while (end < operations.length && operations[end]!.operator !== 'ET') {
        const inner = operations[end]!;
        if (TEXT_SHOWING.has(inner.operator)) {
          const key = inner.operands.map((operand) => operand.raw).join(' ');
          if (targets.textKeys.has(key)) matched = true;
        }
        end += 1;
      }

      if (matched) {
        dropped += 1;
        i = end; // Skip past the ET as well.
        continue;
      }
    }

    // -------------------------------------------------------------- image
    if (operation.operator === 'Do') {
      const name = operation.operands[operation.operands.length - 1];
      if (name?.kind === 'name' && targets.doomedNames.has(name.raw)) {
        dropped += 1;
        continue;
      }
    }

    kept.push(operation);
  }

  return { kept, dropped };
}

/** Adds the named optional-content groups to the default configuration's OFF list. */
function turnOffLayers(
  doc: PDFDocument,
  layerNames: Set<string>,
  lib: Awaited<ReturnType<typeof loadPdfLib>>,
): void {
  const { PDFArray, PDFDict, PDFName, PDFRef } = lib;

  const properties = doc.catalog.lookup(PDFName.of('OCProperties')) as PDFDict | undefined;
  if (!(properties instanceof PDFDict)) return;

  const groups = properties.lookup(PDFName.of('OCGs'));
  const config = properties.lookup(PDFName.of('D')) as PDFDict | undefined;
  if (!(groups instanceof PDFArray) || !(config instanceof PDFDict)) return;

  const off: unknown[] = [];
  const existing = config.lookup(PDFName.of('OFF'));
  if (existing instanceof PDFArray) {
    for (let i = 0; i < existing.size(); i += 1) off.push(existing.get(i));
  }

  for (let i = 0; i < groups.size(); i += 1) {
    const raw = groups.get(i);
    const group = groups.lookup(i) as PDFDict | undefined;
    if (!(group instanceof PDFDict)) continue;

    const label = textStringValue(group.lookup(PDFName.of('Name')));
    if (label && layerNames.has(label) && raw instanceof PDFRef) off.push(raw);
  }

  if (off.length === 0) return;

  const array = doc.context.obj([]) as PDFArray;
  for (const entry of off) array.push(entry as never);
  config.set(PDFName.of('OFF'), array);
}
