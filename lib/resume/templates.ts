export type TemplateId =
  | 'classic'
  | 'modern'
  | 'minimal'
  | 'sidebar'
  | 'executive'
  | 'compact'
  | 'academic'
  | 'technical'
  | 'graduate'
  | 'consulting'
  | 'creative'
  | 'federal';

export type FontFamily = 'sans' | 'serif';

export type ResumeTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  family: FontFamily;
  /** Accent colour for rules and headings. Empty string means "ink only". */
  accent: string;
  headerAlign: 'left' | 'center';
  /** How a section heading is set off from the entries under it. */
  sectionStyle: 'rule' | 'underline' | 'plain';
  sectionCaps: boolean;
  /** Puts contact, skills and languages in a left column. */
  sidebar: boolean;
  density: 'airy' | 'normal' | 'dense';
};

/**
 * Twelve templates, one layout engine.
 *
 * Every template below is the same set of blocks with different spacing, rules
 * and type — which is the honest version of "pre-built templates". None of them
 * use a photo, a skills bar chart, or a two-column body for the experience
 * section: applicant tracking systems read a PDF's text in layout order, and
 * those three are the reliable ways to make a resume parse as nonsense.
 */
export const templates: ResumeTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Centred serif header with ruled sections. The safe choice everywhere.',
    family: 'serif',
    accent: '',
    headerAlign: 'center',
    sectionStyle: 'rule',
    sectionCaps: true,
    sidebar: false,
    density: 'normal',
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Left-aligned sans with a coloured rule under each heading.',
    family: 'sans',
    accent: '#d1541f',
    headerAlign: 'left',
    sectionStyle: 'underline',
    sectionCaps: true,
    sidebar: false,
    density: 'normal',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'No rules, generous space, headings that whisper.',
    family: 'sans',
    accent: '',
    headerAlign: 'left',
    sectionStyle: 'plain',
    sectionCaps: false,
    sidebar: false,
    density: 'airy',
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    description: 'Contact, skills and languages in a left column; history on the right.',
    family: 'sans',
    accent: '#14684d',
    headerAlign: 'left',
    sectionStyle: 'plain',
    sectionCaps: true,
    sidebar: true,
    density: 'normal',
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Serif with wide letter-spacing and full-width rules.',
    family: 'serif',
    accent: '#191712',
    headerAlign: 'left',
    sectionStyle: 'rule',
    sectionCaps: true,
    sidebar: false,
    density: 'normal',
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Tight spacing to fit a long history onto one page.',
    family: 'sans',
    accent: '#2a78d6',
    headerAlign: 'left',
    sectionStyle: 'underline',
    sectionCaps: true,
    sidebar: false,
    density: 'dense',
  },

  // --------------------------------------------------------- second batch
  {
    id: 'academic',
    name: 'Academic',
    description: 'Serif, airy and unadorned - the register a CV for research posts expects.',
    family: 'serif',
    accent: '',
    headerAlign: 'center',
    sectionStyle: 'plain',
    sectionCaps: false,
    sidebar: false,
    density: 'airy',
  },
  {
    id: 'technical',
    name: 'Technical',
    description: 'Skills in a left column so a long stack does not crowd the history.',
    family: 'sans',
    accent: '#2f5d8c',
    headerAlign: 'left',
    sectionStyle: 'underline',
    sectionCaps: true,
    sidebar: true,
    density: 'dense',
  },
  {
    id: 'graduate',
    name: 'Graduate',
    description: 'Roomy sans for a first CV, where the page is not yet full.',
    family: 'sans',
    accent: '#6b4ea8',
    headerAlign: 'center',
    sectionStyle: 'underline',
    sectionCaps: true,
    sidebar: false,
    density: 'airy',
  },
  {
    id: 'consulting',
    name: 'Consulting',
    description: 'Dense serif with full-width rules, for a history measured in decades.',
    family: 'serif',
    accent: '#33302a',
    headerAlign: 'left',
    sectionStyle: 'rule',
    sectionCaps: true,
    sidebar: false,
    density: 'dense',
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'A warm accent and quiet headings - as much colour as parses safely.',
    family: 'sans',
    accent: '#b23c6b',
    headerAlign: 'left',
    sectionStyle: 'plain',
    sectionCaps: false,
    sidebar: false,
    density: 'normal',
  },
  {
    id: 'federal',
    name: 'Government',
    description: 'Ink only, capitals and rules. Nothing for a strict parser to trip on.',
    family: 'serif',
    accent: '',
    headerAlign: 'left',
    sectionStyle: 'rule',
    sectionCaps: true,
    sidebar: false,
    density: 'normal',
  },
];

export function getTemplate(id: TemplateId): ResumeTemplate {
  return templates.find((template) => template.id === id) ?? templates[0]!;
}

export type DensityMetrics = {
  margin: number;
  bodySize: number;
  lineGap: number;
  sectionGap: number;
  entryGap: number;
};

export const densityMetrics: Record<ResumeTemplate['density'], DensityMetrics> = {
  airy: { margin: 60, bodySize: 10.5, lineGap: 1.5, sectionGap: 20, entryGap: 13 },
  normal: { margin: 50, bodySize: 10, lineGap: 1.2, sectionGap: 15, entryGap: 10 },
  dense: { margin: 40, bodySize: 9.2, lineGap: 0.8, sectionGap: 10, entryGap: 7 },
};
