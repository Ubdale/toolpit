'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Textarea } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { loadPdfJs, readFileBytes } from '@/lib/pdf/runtime';
import { analyseResume, type AtsReport, type Severity } from '@/lib/resume/ats';

/**
 * Reads the resume the way a parser does, then reports what it found.
 *
 * The extraction is the honest part of this tool: whatever pdf.js can pull out
 * of the file is roughly what an applicant tracking system will get, so a
 * resume that comes back empty here comes back empty there too.
 */

const SEVERITY_STYLE: Record<Severity, { ring: string; icon: string; label: string }> = {
  critical: { ring: 'border-danger/40 bg-danger/5', icon: 'error', label: 'Fix this' },
  warning: { ring: 'border-line bg-surface', icon: 'warning', label: 'Worth fixing' },
  good: { ring: 'border-line bg-sunken', icon: 'check', label: 'Fine' },
};

function scoreTone(score: number) {
  if (score >= 80) return { text: 'text-accent', label: 'Parses cleanly' };
  if (score >= 55) return { text: 'text-text', label: 'Needs some work' };
  return { text: 'text-danger', label: 'Likely to be dropped' };
}

export default function AtsCheckerTool() {
  const [filename, setFilename] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [report, setReport] = useState<AtsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [extracted, setExtracted] = useState<{ text: string; pages: number } | null>(null);

  async function readResume(files: File[]) {
    const file = files[0];
    if (!file) return;

    setError(null);
    setIsReading(true);
    setReport(null);

    try {
      const pdfjs = await loadPdfJs();
      const bytes = await readFileBytes(file);
      const doc = await pdfjs.getDocument({ data: bytes }).promise;

      let text = '';
      for (let index = 1; index <= doc.numPages; index += 1) {
        const page = await doc.getPage(index);
        const content = await page.getTextContent();

        // Rebuild lines from the fragments' vertical positions. A parser sees
        // reading order, so bullets and headings only survive if the lines do.
        const rows = new Map<number, { x: number; str: string }[]>();
        for (const item of content.items) {
          if (!('str' in item) || !item.str) continue;
          const y = Math.round((item.transform[5] as number) / 3) * 3;
          if (!rows.has(y)) rows.set(y, []);
          rows.get(y)!.push({ x: item.transform[4] as number, str: item.str });
        }

        const lines = [...rows.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, parts]) =>
            parts
              .sort((a, b) => a.x - b.x)
              .map((p) => p.str)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
          .filter(Boolean);

        text += `${lines.join('\n')}\n`;
      }

      const next = { text, pages: doc.numPages };
      setExtracted(next);
      setFilename(file.name);
      setReport(
        analyseResume({
          ...next,
          imageOnly: text.trim().length === 0,
          jobDescription: jobDescription || undefined,
        }),
      );
    } catch {
      setError('That PDF could not be read. If it is password-protected, save an unlocked copy first.');
    } finally {
      setIsReading(false);
    }
  }

  function rerunWithJob() {
    if (!extracted) return;
    setReport(
      analyseResume({
        ...extracted,
        imageOnly: extracted.text.trim().length === 0,
        jobDescription: jobDescription || undefined,
      }),
    );
  }

  const tone = report ? scoreTone(report.score) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-6">
        <ToolSurface className="flex flex-col gap-4">
          <ToolSectionHeading>Your resume</ToolSectionHeading>

          <Dropzone
            label="Drop your resume PDF"
            accept="application/pdf,.pdf"
            multiple={false}
            onFiles={(files) => void readResume(files)}
            hint="A PDF. It is read in this tab and never uploaded."
          />

          {filename ? (
            <p className="text-sm text-muted">
              Checked <span className="text-text">{filename}</span>
            </p>
          ) : null}

          {isReading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <Icon name="refresh" size={16} className="motion-safe:animate-spin" />
              Reading the text layer…
            </p>
          ) : null}

          <ErrorMessage>{error}</ErrorMessage>
        </ToolSurface>

        <ToolSurface className="flex flex-col gap-4">
          <ToolSectionHeading>Job description (optional)</ToolSectionHeading>
          <Textarea
            aria-label="Job description"
            value={jobDescription}
            onChange={setJobDescription}
            rows={8}
            placeholder="Paste the posting here to see which of its repeated terms are missing from your resume."
          />
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={rerunWithJob} disabled={!extracted}>
              Match against this posting
            </Button>
            {jobDescription ? (
              <Button variant="ghost" onClick={() => setJobDescription('')}>
                Clear
              </Button>
            ) : null}
          </div>
        </ToolSurface>
      </div>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <ToolSurface className="flex flex-col gap-5">
          <ToolSectionHeading>Report</ToolSectionHeading>

          {!report ? (
            <p className="py-16 text-center text-sm text-muted">
              Drop a PDF resume to see how a parser reads it.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-4">
                <span className={cn('font-display text-5xl font-semibold tabular-nums', tone!.text)}>
                  {report.score}
                </span>
                <span className="text-sm text-muted">
                  out of 100 — {tone!.label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Words', report.stats.words],
                  ['Pages', report.stats.pages],
                  ['Bullets', report.stats.bullets],
                  ['With numbers', report.stats.quantified],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-sunken px-3 py-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
                    <dd className="mt-0.5 font-display text-lg tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

              {report.keywords ? (
                <div className="rounded-xl border border-line p-4">
                  <p className="text-sm font-medium">
                    Keyword coverage — {Math.round(report.keywords.coverage * 100)}%
                  </p>
                  {report.keywords.missing.length > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {report.keywords.missing.slice(0, 14).map((word) => (
                        <span
                          key={word}
                          className="rounded-md border border-danger/40 bg-danger/5 px-1.5 py-0.5 text-xs"
                        >
                          {word}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Every repeated term appears.</p>
                  )}
                </div>
              ) : null}

              <ul className="flex flex-col gap-2.5">
                {report.findings.map((finding) => {
                  const style = SEVERITY_STYLE[finding.severity];
                  return (
                    <li
                      key={finding.id}
                      className={cn('rounded-xl border p-3.5', style.ring)}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon
                          name={style.icon as never}
                          size={16}
                          className={cn(
                            'mt-0.5 shrink-0',
                            finding.severity === 'critical'
                              ? 'text-danger'
                              : finding.severity === 'good'
                                ? 'text-accent'
                                : 'text-muted',
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{finding.title}</p>
                          <p className="mt-1 text-xs text-muted">{finding.detail}</p>
                          {finding.fix ? (
                            <p className="mt-1.5 text-xs">
                              <span className="text-muted">Fix: </span>
                              {finding.fix}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </ToolSurface>
      </div>
    </div>
  );
}
