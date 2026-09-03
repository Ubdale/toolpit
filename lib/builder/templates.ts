'use client';

/**
 * Saved builder configurations.
 *
 * They live in this browser's own storage, because Toolpit has no accounts and
 * no server to save them to. That is a real limitation and the UI says so
 * rather than implying a backup: a template is available on this device, in
 * this browser, until the visitor clears their site data.
 *
 * Chart and report templates share one store and one shape, so the "duplicate"
 * and "load" mechanics are written once and a report can reference a chart
 * template by id.
 */

export type TemplateKind = 'chart' | 'report' | 'dashboard';

export type Template<T = unknown> = {
  id: string;
  kind: TemplateKind;
  name: string;
  /** ISO timestamp, for ordering the list. */
  savedAt: string;
  config: T;
};

const KEY = 'toolpit.builder.templates.v1';

function readAll(): Template[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Template[]) : [];
  } catch {
    // A corrupt or blocked store behaves as an empty one rather than throwing
    // in the middle of a builder someone is using.
    return [];
  }
}

function writeAll(templates: Template[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(templates));
    return true;
  } catch {
    // Private mode and full quotas both land here.
    return false;
  }
}

export function listTemplates<T>(kind: TemplateKind): Template<T>[] {
  return readAll()
    .filter((template) => template.kind === kind)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt)) as Template<T>[];
}

export function saveTemplate<T>(kind: TemplateKind, name: string, config: T, id?: string): Template<T> {
  const all = readAll();
  const record: Template<T> = {
    id: id ?? `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: name.trim() || 'Untitled',
    savedAt: new Date().toISOString(),
    config,
  };

  const index = all.findIndex((template) => template.id === record.id);
  if (index >= 0) all[index] = record as Template;
  else all.push(record as Template);

  writeAll(all);
  return record;
}

export function duplicateTemplate<T>(id: string): Template<T> | null {
  const all = readAll();
  const source = all.find((template) => template.id === id);
  if (!source) return null;
  return saveTemplate(source.kind, `${source.name} copy`, source.config as T);
}

export function deleteTemplate(id: string): void {
  writeAll(readAll().filter((template) => template.id !== id));
}

export function getTemplate<T>(id: string): Template<T> | null {
  return (readAll().find((template) => template.id === id) as Template<T>) ?? null;
}
