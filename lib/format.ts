export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "report.pdf" -> "report" */
export function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

/**
 * Parses a page-range expression like "1-3, 5, 8-" against a document of
 * `pageCount` pages. Returns zero-based page indices in the order given,
 * de-duplicated. Throws on anything it can't read so the UI can show why.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const cleaned = input.trim();
  if (!cleaned) throw new Error('Enter at least one page or range.');

  const seen = new Set<number>();
  const pages: number[] = [];

  for (const part of cleaned.split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;

    const match = /^(\d+)?\s*(?:-\s*(\d+)?)?$/.exec(chunk);
    if (!match) throw new Error(`"${chunk}" is not a page or range.`);

    const isRange = chunk.includes('-');
    const start = match[1] ? Number(match[1]) : 1;
    const end = isRange ? (match[2] ? Number(match[2]) : pageCount) : start;

    if (start < 1 || end < 1) throw new Error('Pages start at 1.');
    if (start > pageCount || end > pageCount) {
      throw new Error(`This PDF only has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
    }
    if (start > end) throw new Error(`"${chunk}" runs backwards.`);

    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) continue;
      seen.add(page);
      pages.push(page - 1);
    }
  }

  if (pages.length === 0) throw new Error('Enter at least one page or range.');
  return pages;
}
