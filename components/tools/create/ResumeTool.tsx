'use client';

import { useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { ErrorMessage, Field, RangeInput, TextInput } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { layoutResume, type LayoutResult } from '@/lib/resume/layout';
import { resumeToPdf, resumeToText } from '@/lib/resume/pdf';
import { templates, type TemplateId } from '@/lib/resume/templates';
import {
  emptyResume,
  nextId,
  sampleResume,
  type PageSize,
  type Resume,
} from '@/lib/resume/types';

import { ResumePreview } from './ResumePreview';
import { Icon, type IconName } from '@/components/ui/Icon';

const STORAGE_KEY = 'toolpit.resume.v1';

export default function ResumeTool() {
  const [resume, setResume] = useState<Resume>(sampleResume);
  const [template, setTemplate] = useState<TemplateId>('modern');
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(0.62);

  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [restored, setRestored] = useState(false);

  // A draft is kept in this browser's own storage so a refresh doesn't wipe an
  // hour of work. It never leaves the device — there is no account and no sync,
  // which is also why the tool says so plainly rather than implying a backup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        resume?: Resume;
        template?: TemplateId;
        pageSize?: PageSize;
      };
      if (parsed.resume) {
        setResume(parsed.resume);
        setRestored(true);
      }
      if (parsed.template) setTemplate(parsed.template);
      if (parsed.pageSize) setPageSize(parsed.pageSize);
    } catch {
      // A corrupt or blocked store is not worth an error message; start fresh.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ resume, template, pageSize }));
      } catch {
        // Private mode and full quotas both throw here. Losing autosave is not
        // worth interrupting someone mid-sentence over.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [resume, template, pageSize]);

  // Re-layout on every change, behind a short debounce so typing stays smooth.
  const requestRef = useRef(0);
  useEffect(() => {
    const request = (requestRef.current += 1);
    const timer = setTimeout(() => {
      layoutResume(resume, { template, pageSize, scale })
        .then((result) => {
          if (request === requestRef.current) {
            setLayout(result);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (request === requestRef.current) {
            setError(cause instanceof Error ? cause.message : 'Could not lay out the resume.');
          }
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [resume, template, pageSize, scale]);

  function update<K extends keyof Resume>(key: K, value: Resume[K]) {
    setResume((current) => ({ ...current, [key]: value }));
  }

  async function exportPdf() {
    setIsExporting(true);
    setError(null);
    try {
      const result = await resumeToPdf(resume, { template, pageSize, scale });
      const name = resume.name.trim() ? resume.name.trim().replace(/\s+/g, '-').toLowerCase() : 'resume';
      downloadBlob(
        new Blob([result.bytes as unknown as BlobPart], { type: 'application/pdf' }),
        `${name}-resume.pdf`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build the PDF.');
    } finally {
      setIsExporting(false);
    }
  }

  function exportText() {
    downloadBlob(new Blob([resumeToText(resume)], { type: 'text/plain' }), 'resume.txt');
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="flex flex-col gap-6">
        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Template</ToolSectionHeading>

          <ul className="grid gap-2 sm:grid-cols-2">
            {templates.map((entry) => {
              const selected = entry.id === template;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setTemplate(entry.id)}
                    aria-pressed={selected}
                    className={`flex w-full flex-col rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span className="text-sm font-medium">{entry.name}</span>
                    <span className="mt-0.5 text-xs text-muted">{entry.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <Dropdown
              label="Page size"
              value={pageSize}
              onChange={(value) => value && setPageSize(value as PageSize)}
              options={[
                { value: 'a4', label: 'A4', description: 'Most of the world' },
                { value: 'letter', label: 'US Letter', description: 'North America' },
              ]}
            />

            <Field
              label={`Text size — ${Math.round(scale * 100)}%`}
              hint={
                layout && layout.pageCount > 1
                  ? `Currently ${layout.pageCount} pages. Nudge this down to fit fewer.`
                  : 'Fits on one page.'
              }
            >
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={75}
                  max={130}
                  step={1}
                  value={scale * 100}
                  onChange={(event) => setScale(Number(event.target.value) / 100)}
                />
              )}
            </Field>
          </div>
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Details</ToolSectionHeading>

          {restored ? (
            <p className="rounded-xl border border-line bg-sunken px-3 py-2.5 text-xs text-muted">
              Picked up where you left off — this draft was saved in this browser, on this device.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={resume.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              )}
            </Field>
            <Field label="Headline" hint="The role you are going for.">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={resume.headline}
                  onChange={(event) => update('headline', event.target.value)}
                />
              )}
            </Field>
            <Field label="Email">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="email"
                  value={resume.email}
                  onChange={(event) => update('email', event.target.value)}
                />
              )}
            </Field>
            <Field label="Phone">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="tel"
                  value={resume.phone}
                  onChange={(event) => update('phone', event.target.value)}
                />
              )}
            </Field>
            <Field label="Location">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={resume.location}
                  onChange={(event) => update('location', event.target.value)}
                />
              )}
            </Field>
            <Field label="Website or portfolio">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={resume.website}
                  onChange={(event) => update('website', event.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Summary" hint="Two or three sentences. What you do and who for.">
            {({ id }) => (
              <TextArea
                id={id}
                rows={4}
                value={resume.summary}
                onChange={(value) => update('summary', value)}
              />
            )}
          </Field>
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <ToolSectionHeading>Experience</ToolSectionHeading>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                update('experience', [
                  ...resume.experience,
                  {
                    id: nextId('exp'),
                    role: '',
                    company: '',
                    location: '',
                    start: '',
                    end: '',
                    bullets: [''],
                  },
                ])
              }
            >
              Add a role
            </Button>
          </div>

          {resume.experience.map((entry, index) => (
            <EntryCard
              key={entry.id}
              title={entry.role || entry.company || `Role ${index + 1}`}
              onRemove={
                resume.experience.length > 1
                  ? () =>
                      update(
                        'experience',
                        resume.experience.filter((item) => item.id !== entry.id),
                      )
                  : undefined
              }
              onMove={(direction) => update('experience', move(resume.experience, index, direction))}
              canMoveUp={index > 0}
              canMoveDown={index < resume.experience.length - 1}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Job title">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.role}
                      onChange={(event) =>
                        update(
                          'experience',
                          patch(resume.experience, entry.id, { role: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
                <Field label="Company">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.company}
                      onChange={(event) =>
                        update(
                          'experience',
                          patch(resume.experience, entry.id, { company: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
                <Field label="Location">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.location}
                      onChange={(event) =>
                        update(
                          'experience',
                          patch(resume.experience, entry.id, { location: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        value={entry.start}
                        placeholder="2021"
                        onChange={(event) =>
                          update(
                            'experience',
                            patch(resume.experience, entry.id, { start: event.target.value }),
                          )
                        }
                      />
                    )}
                  </Field>
                  <Field label="To">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        value={entry.end}
                        placeholder="Present"
                        onChange={(event) =>
                          update(
                            'experience',
                            patch(resume.experience, entry.id, { end: event.target.value }),
                          )
                        }
                      />
                    )}
                  </Field>
                </div>
              </div>

              <BulletEditor
                bullets={entry.bullets}
                onChange={(bullets) =>
                  update('experience', patch(resume.experience, entry.id, { bullets }))
                }
              />
            </EntryCard>
          ))}
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <ToolSectionHeading>Education</ToolSectionHeading>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                update('education', [
                  ...resume.education,
                  {
                    id: nextId('edu'),
                    degree: '',
                    school: '',
                    location: '',
                    start: '',
                    end: '',
                    detail: '',
                  },
                ])
              }
            >
              Add
            </Button>
          </div>

          {resume.education.map((entry, index) => (
            <EntryCard
              key={entry.id}
              title={entry.degree || entry.school || `Education ${index + 1}`}
              onRemove={
                resume.education.length > 1
                  ? () =>
                      update(
                        'education',
                        resume.education.filter((item) => item.id !== entry.id),
                      )
                  : undefined
              }
              onMove={(direction) => update('education', move(resume.education, index, direction))}
              canMoveUp={index > 0}
              canMoveDown={index < resume.education.length - 1}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Qualification">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.degree}
                      onChange={(event) =>
                        update(
                          'education',
                          patch(resume.education, entry.id, { degree: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
                <Field label="Institution">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.school}
                      onChange={(event) =>
                        update(
                          'education',
                          patch(resume.education, entry.id, { school: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        value={entry.start}
                        onChange={(event) =>
                          update(
                            'education',
                            patch(resume.education, entry.id, { start: event.target.value }),
                          )
                        }
                      />
                    )}
                  </Field>
                  <Field label="To">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        value={entry.end}
                        onChange={(event) =>
                          update(
                            'education',
                            patch(resume.education, entry.id, { end: event.target.value }),
                          )
                        }
                      />
                    )}
                  </Field>
                </div>
                <Field label="Location">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.location}
                      onChange={(event) =>
                        update(
                          'education',
                          patch(resume.education, entry.id, { location: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
              </div>
              <Field label="Detail">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={entry.detail}
                    onChange={(value) =>
                      update('education', patch(resume.education, entry.id, { detail: value }))
                    }
                  />
                )}
              </Field>
            </EntryCard>
          ))}
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Skills &amp; extras</ToolSectionHeading>

          <Field
            label="Skills"
            hint="One per line. They print as a single run, which is what a parser reads cleanly."
          >
            {({ id }) => (
              <TextArea
                id={id}
                rows={5}
                value={resume.skills.join('\n')}
                onChange={(value) => update('skills', value.split('\n'))}
              />
            )}
          </Field>

          <Field label="Certifications" hint="One per line.">
            {({ id }) => (
              <TextArea
                id={id}
                rows={3}
                value={resume.certifications.join('\n')}
                onChange={(value) => update('certifications', value.split('\n'))}
              />
            )}
          </Field>

          <Field label="Languages" hint="One per line.">
            {({ id }) => (
              <TextArea
                id={id}
                rows={3}
                value={resume.languages.join('\n')}
                onChange={(value) => update('languages', value.split('\n'))}
              />
            )}
          </Field>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <ToolSectionHeading>Projects</ToolSectionHeading>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                update('projects', [
                  ...resume.projects,
                  { id: nextId('prj'), name: '', detail: '', link: '' },
                ])
              }
            >
              Add
            </Button>
          </div>

          {resume.projects.map((entry, index) => (
            <EntryCard
              key={entry.id}
              title={entry.name || `Project ${index + 1}`}
              onRemove={() =>
                update(
                  'projects',
                  resume.projects.filter((item) => item.id !== entry.id),
                )
              }
              onMove={(direction) => update('projects', move(resume.projects, index, direction))}
              canMoveUp={index > 0}
              canMoveDown={index < resume.projects.length - 1}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.name}
                      onChange={(event) =>
                        update(
                          'projects',
                          patch(resume.projects, entry.id, { name: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
                <Field label="Link">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      value={entry.link}
                      onChange={(event) =>
                        update(
                          'projects',
                          patch(resume.projects, entry.id, { link: event.target.value }),
                        )
                      }
                    />
                  )}
                </Field>
              </div>
              <Field label="What it is">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={entry.detail}
                    onChange={(value) =>
                      update('projects', patch(resume.projects, entry.id, { detail: value }))
                    }
                  />
                )}
              </Field>
            </EntryCard>
          ))}
        </ToolSurface>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setResume(sampleResume())}>
            Load the example again
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Clear every field and start from a blank resume?')) {
                setResume(emptyResume());
              }
            }}
          >
            Start from blank
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <ToolSurface className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToolSectionHeading>Preview</ToolSectionHeading>
            <span className="text-xs text-muted">
              {layout ? `${layout.pageCount} page${layout.pageCount === 1 ? '' : 's'}` : '…'}
            </span>
          </div>

          <div className="max-h-[38rem] overflow-y-auto rounded-xl bg-sunken p-4">
            {layout ? (
              <ResumePreview layout={layout} scale={zoom} />
            ) : (
              <p className="py-16 text-center text-sm text-muted">Laying out your resume…</p>
            )}
          </div>

          <Field label={`Zoom — ${Math.round(zoom * 100)}%`}>
            {({ id }) => (
              <RangeInput
                id={id}
                min={35}
                max={110}
                step={1}
                value={zoom * 100}
                onChange={(event) => setZoom(Number(event.target.value) / 100)}
              />
            )}
          </Field>

          {layout && layout.substitutions > 0 ? (
            <p className="text-xs text-muted">
              {layout.substitutions} character{layout.substitutions === 1 ? '' : 's'} will be
              approximated in the PDF — the standard PDF fonts cannot draw them.
            </p>
          ) : null}

          <ErrorMessage>{error}</ErrorMessage>

          <Button size="lg" onClick={exportPdf} disabled={isExporting}>
            {isExporting ? 'Building the PDF…' : 'Download PDF'}
          </Button>
          <Button variant="secondary" onClick={exportText}>
            Download as plain text
          </Button>

          <p className="text-xs text-muted">
            The PDF contains real text, not a picture of a page, so applicant tracking systems can
            read it. Your details are held in this tab and in this browser&rsquo;s own storage —
            there is no account and nothing is uploaded.
          </p>
        </ToolSurface>
      </div>
    </div>
  );
}

function TextArea({
  id,
  rows,
  value,
  onChange,
}: {
  id: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-line-strong focus:border-accent"
    />
  );
}

function EntryCard({
  title,
  children,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  title: string;
  children: React.ReactNode;
  onRemove?: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <SmallButton label="Move up" icon="arrowUp" disabled={!canMoveUp} onClick={() => onMove(-1)} />
          <SmallButton
            label="Move down"
            icon="arrowDown"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          />
          {onRemove ? <SmallButton label="Remove" icon="close" onClick={onRemove} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function SmallButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function BulletEditor({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (bullets: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">What you did</p>
      {bullets.map((bullet, index) => (
        <div key={index} className="flex items-start gap-2">
          <span aria-hidden="true" className="pt-2.5 text-muted">
            •
          </span>
          <textarea
            rows={2}
            value={bullet}
            aria-label={`Bullet ${index + 1}`}
            placeholder="Start with a verb and end with a number, if you have one."
            onChange={(event) =>
              onChange(bullets.map((item, i) => (i === index ? event.target.value : item)))
            }
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-line-strong focus:border-accent"
          />
          <SmallButton
            label={`Remove bullet ${index + 1}`}
            icon="close"
            disabled={bullets.length === 1}
            onClick={() => onChange(bullets.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...bullets, ''])}>
        Add a bullet
      </Button>
    </div>
  );
}

/** Replaces one entry in a list, by id. */
function patch<T extends { id: string }>(list: T[], id: string, changes: Partial<T>): T[] {
  return list.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry));
}

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}
