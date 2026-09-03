export type ExperienceEntry = {
  id: string;
  role: string;
  company: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
};

export type EducationEntry = {
  id: string;
  degree: string;
  school: string;
  location: string;
  start: string;
  end: string;
  detail: string;
};

export type ProjectEntry = {
  id: string;
  name: string;
  detail: string;
  link: string;
};

export type Resume = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  /** Free-form list; the layout wraps it as a comma-separated run. */
  skills: string[];
  projects: ProjectEntry[];
  certifications: string[];
  languages: string[];
};

export type PageSize = 'a4' | 'letter';

export const PAGE_DIMENSIONS: Record<PageSize, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

let counter = 0;
export const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

export function emptyResume(): Resume {
  return {
    name: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    website: '',
    summary: '',
    experience: [
      { id: nextId('exp'), role: '', company: '', location: '', start: '', end: '', bullets: [''] },
    ],
    education: [
      { id: nextId('edu'), degree: '', school: '', location: '', start: '', end: '', detail: '' },
    ],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
  };
}

/**
 * The starter content. It is deliberately a *filled-in* resume rather than
 * empty fields: a blank form gives no sense of what a finished page looks like,
 * and the fastest way to a good resume is editing a good one.
 */
export function sampleResume(): Resume {
  return {
    name: 'Alex Moreno',
    headline: 'Senior Product Designer',
    email: 'alex.moreno@example.com',
    phone: '+1 (555) 018-2244',
    location: 'Lisbon, Portugal',
    website: 'alexmoreno.design',
    summary:
      'Product designer with nine years shipping data-heavy tools for small teams. I work close to engineering, prototype in code, and care most about the boring screens that people use every day.',
    experience: [
      {
        id: nextId('exp'),
        role: 'Senior Product Designer',
        company: 'Northwind Analytics',
        location: 'Remote',
        start: '2021',
        end: 'Present',
        bullets: [
          'Redesigned the reporting workspace used by 40,000 weekly users, cutting median time-to-first-report from 11 minutes to under 3.',
          'Built and maintained the design system adopted by four product teams, reducing new-screen build time by roughly a third.',
          'Ran the research programme end to end — 60+ interviews a year, synthesised into a roadmap the exec team actually used.',
        ],
      },
      {
        id: nextId('exp'),
        role: 'Product Designer',
        company: 'Kestrel Software',
        location: 'Lisbon',
        start: '2017',
        end: '2021',
        bullets: [
          'Owned billing and onboarding, taking trial-to-paid conversion from 8% to 14% over six quarters.',
          'Introduced weekly usability testing, which became standard practice across the product org.',
        ],
      },
    ],
    education: [
      {
        id: nextId('edu'),
        degree: 'BA, Graphic Design',
        school: 'University of Porto',
        location: 'Porto',
        start: '2012',
        end: '2016',
        detail: 'Graduated with distinction. Thesis on typographic hierarchy in dense interfaces.',
      },
    ],
    skills: [
      'Interaction design',
      'Design systems',
      'User research',
      'Prototyping',
      'Figma',
      'HTML & CSS',
      'Accessibility (WCAG 2.2)',
      'Data visualisation',
    ],
    projects: [
      {
        id: nextId('prj'),
        name: 'Openbench',
        detail: 'An open-source component gallery for internal tools. 2.4k stars.',
        link: 'github.com/example/openbench',
      },
    ],
    certifications: ['Nielsen Norman Group UX Certification, 2020'],
    languages: ['English (native)', 'Portuguese (fluent)', 'Spanish (conversational)'],
  };
}

/** Sections in the order they are laid out, with the fields that decide if one is empty. */
export function hasContent(resume: Resume, section: SectionId): boolean {
  switch (section) {
    case 'summary':
      return resume.summary.trim().length > 0;
    case 'experience':
      return resume.experience.some((entry) => entry.role || entry.company || entry.bullets.some(Boolean));
    case 'education':
      return resume.education.some((entry) => entry.degree || entry.school);
    case 'skills':
      return resume.skills.some((skill) => skill.trim().length > 0);
    case 'projects':
      return resume.projects.some((entry) => entry.name || entry.detail);
    case 'certifications':
      return resume.certifications.some((item) => item.trim().length > 0);
    case 'languages':
      return resume.languages.some((item) => item.trim().length > 0);
  }
}

export type SectionId =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages';

export const sectionOrder: SectionId[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
];

export const sectionTitles: Record<SectionId, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
};
