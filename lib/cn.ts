type ClassValue = string | false | null | undefined;

/** Minimal class joiner — Toolpit has no need for a runtime class merger. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
