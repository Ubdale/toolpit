import type { ToolGuide } from '@/lib/tool-guides';

/**
 * The steps and questions under every tool.
 *
 * These are the sections the HowTo and FAQPage structured data describes, which
 * is why they are rendered plainly rather than hidden behind an accordion that
 * never opens: the markup has to describe something a visitor can actually
 * read. The details/summary below is open-by-default for the same reason.
 */
export function ToolGuideSections({ guide, heading }: { guide: ToolGuide; heading: string }) {
  return (
    <>
      <section aria-labelledby="how-to" className="mt-16 max-w-3xl">
        <h2 id="how-to" className="font-display text-heading">
          {heading}
        </h2>
        <ol className="mt-6 flex flex-col gap-4">
          {guide.steps.map((step, index) => (
            <li key={step} className="flex gap-4">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-sm font-semibold text-accent"
              >
                {index + 1}
              </span>
              <p className="pt-1 text-muted">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" className="mt-16 max-w-3xl">
        <h2 id="faq" className="font-display text-heading">
          Questions
        </h2>
        <div className="mt-6 flex flex-col gap-3">
          {guide.faqs.map((faq) => (
            <details
              key={faq.question}
              open
              className="group rounded-2xl border border-line bg-surface px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                <span className="flex items-start justify-between gap-4">
                  <span>{faq.question}</span>
                  <span
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
