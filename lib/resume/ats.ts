/**
 * Checking a resume the way an applicant tracking system reads one.
 *
 * An ATS does not look at your resume. It extracts the text, tries to find
 * sections and dates in it, and hands the result to a recruiter's search. Every
 * check below is therefore about the extracted text, not the design - which is
 * why a beautiful resume can score badly and a plain one can score well.
 *
 * Everything runs on the text this browser pulled out of the file. There is no
 * model and no server: these are the rules that actually decide whether a
 * parser can read a document, and they are checkable arithmetic.
 */

export type Severity = 'critical' | 'warning' | 'good';

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  /** What was found, in the reader's terms. */
  detail: string;
  /** What to do about it. Omitted when there is nothing to fix. */
  fix?: string;
};

export type AtsReport = {
  /** 0-100. Weighted by how badly each failure hurts a real parse. */
  score: number;
  findings: Finding[];
  stats: {
    words: number;
    pages: number;
    characters: number;
    bullets: number;
    quantified: number;
  };
  /** Present only when a job description was supplied. */
  keywords?: {
    matched: string[];
    missing: string[];
    coverage: number;
  };
};

// --------------------------------------------------------------- vocabulary

const SECTION_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'Experience', pattern: /\b(work|professional)?\s*(experience|employment|history)\b/i },
  { name: 'Education', pattern: /\beducation|academic|qualifications\b/i },
  { name: 'Skills', pattern: /\bskills|competenc|technologies|technical\b/i },
];

/**
 * Verbs that describe activity rather than achievement. A bullet opening with
 * one of these usually says what the job was, not what the person did with it.
 */
const WEAK_OPENERS = [
  'responsible for', 'duties included', 'worked on', 'helped with', 'assisted with',
  'involved in', 'participated in', 'tasked with', 'in charge of', 'various',
];

/** Words a recruiter's search will never match on, and a parser cannot use. */
const FILLER = [
  'team player', 'hard worker', 'go-getter', 'think outside the box', 'synergy',
  'results-driven', 'detail-oriented', 'self-starter', 'dynamic', 'proactive',
];

const STOP_WORDS = new Set([
  'the','and','for','with','you','your','our','are','will','have','has','that','this','from',
  'their','they','them','all','any','can','who','was','were','been','not','but','its','into',
  'about','more','than','when','what','which','also','such','other','over','each','some','then',
  'work','working','role','team','teams','years','year','experience','strong','ability','able',
  'well','across','within','using','use','including','include','plus','etc','job','candidate',
  'must','should','would','could','may','new','one','two','three','via','per','both','while',
]);

// ------------------------------------------------------------------ helpers

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z+#.-]{1,}/g) ?? [];
}

/**
 * A bullet is a line the writer marked as one. Parsers key off the same
 * characters, so anything else is a paragraph however it looks on the page.
 */
function bulletLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[•▪◦‣·*\-–—]\s+/.test(line) && line.length > 12);
}

/** A bullet earns its place when it carries a number. */
function isQuantified(line: string): boolean {
  return /\d+\s*(%|percent|k\b|m\b|bn\b|x\b)|[$£€]\s?\d|\b\d{2,}\b/i.test(line);
}

// ------------------------------------------------------------------- checks

export type AnalyseInput = {
  text: string;
  pages: number;
  /** True when the file had no text layer at all. */
  imageOnly?: boolean;
  /** Optional posting to match against. */
  jobDescription?: string;
};

export function analyseResume(input: AnalyseInput): AtsReport {
  const { text, pages } = input;
  const findings: Finding[] = [];
  const allWords = words(text);
  const bullets = bulletLines(text);
  const quantified = bullets.filter(isQuantified);

  // ---- The one failure that makes everything else moot.
  //
  // The threshold is deliberately low. A short resume is a different problem
  // from an unreadable one, and telling someone their document is "a picture"
  // when it is merely brief would send them off to fix the wrong thing - so
  // anything with real words falls through to the checks below, where the
  // length rule reports it honestly.
  if (input.imageOnly || allWords.length < 12) {
    findings.push({
      id: 'no-text',
      severity: 'critical',
      title: 'The file has no readable text',
      detail:
        'Nothing could be extracted from this PDF. It is a picture of a resume - exported as an image, or scanned from paper - so an ATS sees an empty document and a recruiter searching for your skills will never find you.',
      fix: 'Export again from your word processor using "Save as PDF" rather than printing to an image, and check you can select the text in a PDF viewer afterwards.',
    });
    return {
      score: 0,
      findings,
      stats: { words: allWords.length, pages, characters: text.length, bullets: 0, quantified: 0 },
    };
  }

  // ---- Contact details, which the parser writes straight into its fields.
  const email = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.exec(text);
  const phone = /(\+?\d[\d\s().-]{7,}\d)/.exec(text);

  findings.push(
    email
      ? { id: 'email', severity: 'good', title: 'Email address found', detail: email[0] }
      : {
          id: 'email',
          severity: 'critical',
          title: 'No email address',
          detail: 'No email address could be found in the text.',
          fix: 'Put it in the body of the document as plain text. An address that only exists inside a header, a text box or a logo is invisible to most parsers.',
        },
  );

  findings.push(
    phone
      ? { id: 'phone', severity: 'good', title: 'Phone number found', detail: phone[0].trim() }
      : {
          id: 'phone',
          severity: 'warning',
          title: 'No phone number',
          detail: 'No phone number could be found.',
          fix: 'Add one as plain text beside your email. Some systems will not progress an application without it.',
        },
  );

  // ---- Sections. A parser finds your history by finding these headings.
  const missingSections = SECTION_PATTERNS.filter((s) => !s.pattern.test(text)).map((s) => s.name);
  findings.push(
    missingSections.length === 0
      ? {
          id: 'sections',
          severity: 'good',
          title: 'All the standard sections are present',
          detail: 'Experience, Education and Skills headings were all found.',
        }
      : {
          id: 'sections',
          severity: missingSections.includes('Experience') ? 'critical' : 'warning',
          title: `Missing section heading${missingSections.length > 1 ? 's' : ''}: ${missingSections.join(', ')}`,
          detail:
            'A parser locates your history by finding conventional headings. Creative alternatives - "Where I have been", "My journey" - are not recognised.',
          fix: 'Use the plain words: Experience, Education, Skills.',
        },
  );

  // ---- Dates. No dates, no timeline.
  const dateRanges = text.match(
    /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now)\b/gi,
  );
  const monthYears = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}\b/gi,
  );
  const dateCount = (dateRanges?.length ?? 0) + (monthYears?.length ?? 0);

  findings.push(
    dateCount >= 2
      ? {
          id: 'dates',
          severity: 'good',
          title: 'Dates are in a readable format',
          detail: `${dateCount} date${dateCount === 1 ? '' : 's'} recognised.`,
        }
      : {
          id: 'dates',
          severity: 'critical',
          title: 'Dates could not be read',
          detail:
            'Few or no employment dates were recognised. Without them a system cannot build your timeline or answer "how many years of X".',
          fix: 'Write ranges plainly, as "2021 – Present" or "Mar 2019 – Jun 2021". Avoid bare seasons, "’18" and graphical timelines.',
        },
  );

  // ---- Length, judged against the page rather than a word-count myth.
  const perPage = allWords.length / Math.max(1, pages);
  if (allWords.length < 250) {
    findings.push({
      id: 'length',
      severity: 'warning',
      title: 'The resume is very short',
      detail: `${allWords.length} words. There may not be enough for a recruiter's search to match against.`,
      fix: 'Add specifics to your recent roles: what you owned, what changed because of it, and the numbers.',
    });
  } else if (pages > 2) {
    findings.push({
      id: 'length',
      severity: 'warning',
      title: `${pages} pages`,
      detail: 'Beyond two pages, later pages are rarely read for most roles.',
      fix: 'Keep the last decade in detail and compress what came before into one line each. Academic and government CVs are the exception.',
    });
  } else if (perPage > 750) {
    findings.push({
      id: 'length',
      severity: 'warning',
      title: 'The pages are very dense',
      detail: `About ${Math.round(perPage)} words per page, which usually means small type and thin margins.`,
      fix: 'Cut rather than shrink. A page a human refuses to read scores no better for parsing cleanly.',
    });
  } else {
    findings.push({
      id: 'length',
      severity: 'good',
      title: 'Sensible length',
      detail: `${allWords.length} words across ${pages} page${pages === 1 ? '' : 's'}.`,
    });
  }

  // ---- Bullets: the part a human actually reads.
  if (bullets.length === 0) {
    findings.push({
      id: 'bullets',
      severity: 'warning',
      title: 'No bullet points found',
      detail: 'Your experience appears to be written as paragraphs.',
      fix: 'Break each role into three or four bullets. Paragraphs of duties are skimmed past.',
    });
  } else {
    const ratio = quantified.length / bullets.length;
    findings.push(
      ratio >= 0.4
        ? {
            id: 'quantified',
            severity: 'good',
            title: 'Achievements are quantified',
            detail: `${quantified.length} of ${bullets.length} bullets carry a number.`,
          }
        : {
            id: 'quantified',
            severity: 'warning',
            title: 'Few bullets carry a number',
            detail: `Only ${quantified.length} of ${bullets.length} bullets contain a figure.`,
            fix: 'Give the scale and the result: how many users, how much money, how much faster, over what period. "Improved performance" says nothing that "cut load time from 4s to 1.2s" does.',
          },
    );
  }

  // ---- Phrasing that costs nothing to fix.
  const lower = text.toLowerCase();
  const weak = WEAK_OPENERS.filter((phrase) => lower.includes(phrase));
  if (weak.length > 0) {
    findings.push({
      id: 'weak-verbs',
      severity: 'warning',
      title: 'Passive phrasing',
      detail: `Found: ${weak.slice(0, 4).map((w) => `"${w}"`).join(', ')}.`,
      fix: 'Open each bullet with what you did - built, led, cut, shipped, negotiated - rather than what you were responsible for.',
    });
  }

  const filler = FILLER.filter((phrase) => lower.includes(phrase));
  if (filler.length > 0) {
    findings.push({
      id: 'filler',
      severity: 'warning',
      title: 'Clichés that carry no information',
      detail: `Found: ${filler.slice(0, 4).map((w) => `"${w}"`).join(', ')}.`,
      fix: 'Delete them and let a specific accomplishment make the same point.',
    });
  }

  // ---- First person, which resumes conventionally omit.
  const firstPerson = (text.match(/\b(I|my|me)\b/g) ?? []).length;
  if (firstPerson > 4) {
    findings.push({
      id: 'first-person',
      severity: 'warning',
      title: 'Written in the first person',
      detail: `"I", "my" or "me" appears ${firstPerson} times.`,
      fix: 'Drop the pronoun: "Led a team of six", not "I led a team of six".',
    });
  }

  // ---- Characters that survive the page and not the parse.
  const oddGlyphs = text.match(/[-]/g);
  if (oddGlyphs && oddGlyphs.length > 0) {
    findings.push({
      id: 'glyphs',
      severity: 'warning',
      title: 'Private-use characters found',
      detail: `${oddGlyphs.length} character${oddGlyphs.length === 1 ? '' : 's'} from an icon font were extracted as unreadable symbols.`,
      fix: 'Replace icon-font bullets and contact glyphs with plain text or standard characters.',
    });
  }

  // ---- Keyword match, when a posting was supplied.
  let keywords: AtsReport['keywords'];
  if (input.jobDescription && input.jobDescription.trim().length > 40) {
    const wanted = new Map<string, number>();
    for (const word of words(input.jobDescription)) {
      if (word.length < 3 || STOP_WORDS.has(word)) continue;
      wanted.set(word, (wanted.get(word) ?? 0) + 1);
    }

    // The terms a posting repeats are the ones it cares about.
    const ranked = [...wanted.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([word]) => word);

    const have = new Set(allWords);
    const matched = ranked.filter((word) => have.has(word));
    const missing = ranked.filter((word) => !have.has(word));
    const coverage = ranked.length === 0 ? 1 : matched.length / ranked.length;

    keywords = { matched, missing, coverage };

    findings.push(
      coverage >= 0.6
        ? {
            id: 'keywords',
            severity: 'good',
            title: 'Good overlap with the job description',
            detail: `${matched.length} of ${ranked.length} of the posting's repeated terms appear in your resume.`,
          }
        : {
            id: 'keywords',
            severity: 'warning',
            title: 'Thin overlap with the job description',
            detail: `Only ${matched.length} of ${ranked.length} repeated terms appear. Missing: ${missing.slice(0, 8).join(', ')}.`,
            fix: 'Work the genuinely applicable ones into your experience where they are true. Do not paste a keyword list - a recruiter reads the same document, and white-text keyword stuffing is both detectable and disqualifying.',
          },
    );
  }

  // ---- Score. Weighted by what actually breaks a parse.
  const weights: Record<Severity, number> = { critical: 22, warning: 7, good: 0 };
  const penalty = findings.reduce((total, f) => total + weights[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  // Criticals first, then warnings, then what is already right.
  const order: Record<Severity, number> = { critical: 0, warning: 1, good: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    score,
    findings,
    stats: {
      words: allWords.length,
      pages,
      characters: text.length,
      bullets: bullets.length,
      quantified: quantified.length,
    },
    keywords,
  };
}
