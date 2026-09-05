import { analyseResume } from '../lib/resume/ats';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass += 1; console.log('ok    ' + label); }
  else { fail += 1; console.log('FAIL  ' + label + (extra ? '  ' + extra : '')); }
};

const good = `
Alex Moreno
alex.moreno@example.com  +1 (555) 018-2244  Lisbon, Portugal

EXPERIENCE
Senior Product Designer, Northwind Analytics    2021 – Present
• Redesigned the reporting workspace used by 40,000 weekly users, cutting median time-to-first-report from 11 minutes to under 3.
• Built and maintained the design system adopted by 4 product teams, reducing new-screen build time by roughly a third.
• Ran the research programme end to end — 60+ interviews a year.
Product Designer, Kestrel Software    Mar 2017 – Jun 2021
• Owned billing and onboarding, taking trial-to-paid conversion from 8% to 14% over six quarters.

EDUCATION
BA, Graphic Design, University of Porto    2012 – 2016

SKILLS
Interaction design, Design systems, Usability testing, Prototyping, Figma, HTML & CSS
`;

const r1 = analyseResume({ text: good, pages: 1 });
check('good resume scores high', r1.score >= 80, `score=${r1.score}`);
check('finds email', r1.findings.some(f => f.id === 'email' && f.severity === 'good'));
check('finds phone', r1.findings.some(f => f.id === 'phone' && f.severity === 'good'));
check('all sections found', r1.findings.some(f => f.id === 'sections' && f.severity === 'good'));
check('dates read', r1.findings.some(f => f.id === 'dates' && f.severity === 'good'));
check('counts bullets', r1.stats.bullets === 4, `bullets=${r1.stats.bullets}`);
check('counts quantified', r1.stats.quantified >= 3, `q=${r1.stats.quantified}`);

// Image-only PDF -> the one fatal case.
const r2 = analyseResume({ text: '', pages: 2, imageOnly: true });
check('image-only scores 0', r2.score === 0);
check('image-only is critical', r2.findings[0]!.severity === 'critical');
check('image-only returns early', r2.findings.length === 1);

// A weak resume.
const bad = `
My Journey
I am a results-driven team player and a self-starter who thinks outside the box.
I was responsible for various tasks and helped with a number of different projects
across the business. My duties included assisting with reporting and I participated
in meetings with stakeholders on a regular basis throughout my time there.
Where I have been
Worked on stuff at a company for a while, and then moved on to another company
where I was involved in similar work with a dynamic and proactive team.
`;
const r3 = analyseResume({ text: bad, pages: 1 });
check('weak resume scores low', r3.score < 45, `score=${r3.score}`);
check('flags missing sections', r3.findings.some(f => f.id === 'sections' && f.severity !== 'good'));
check('flags no dates', r3.findings.some(f => f.id === 'dates' && f.severity === 'critical'));
check('flags weak verbs', r3.findings.some(f => f.id === 'weak-verbs'));
check('flags filler', r3.findings.some(f => f.id === 'filler'));
check('flags first person', r3.findings.some(f => f.id === 'first-person'));
check('flags no email', r3.findings.some(f => f.id === 'email' && f.severity === 'critical'));

// Keyword matching.
const jd = `
We are looking for a product designer with strong figma skills.
You will run usability testing and build design systems.
Figma, design systems and usability testing are essential.
Experience with prototyping and accessibility is a plus. Accessibility matters.
`;
const r4 = analyseResume({ text: good, pages: 1, jobDescription: jd });
check('keywords present', Boolean(r4.keywords));
check('matches figma', r4.keywords!.matched.includes('figma'), JSON.stringify(r4.keywords!.matched));
check('spots missing accessibility', r4.keywords!.missing.includes('accessibility'), JSON.stringify(r4.keywords!.missing));
check('no keywords without a JD', analyseResume({ text: good, pages: 1 }).keywords === undefined);

// Ordering + bounds.
const sev = r3.findings.map(f => f.severity);
check('criticals sort first', sev.indexOf('critical') === 0);
check('score within bounds', r1.score <= 100 && r3.score >= 0);

// Long/dense documents.
const long = good.repeat(6);
const r5 = analyseResume({ text: long, pages: 4 });
check('flags too many pages', r5.findings.some(f => f.id === 'length' && f.detail.includes('4 pages') || f.title.includes('4 pages')), r5.findings.find(f=>f.id==='length')?.title);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
