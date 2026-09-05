import { compile, runFormula, previewFormula, searchFunctions, FUNCTIONS } from '../lib/formula/index';
import type { FormulaTable } from '../lib/formula/types';

const sales: FormulaTable = {
  id: 't1',
  name: 'Sales',
  fields: [
    { key: 'Region', type: 'text' },
    { key: 'CustID', type: 'text' },
    { key: 'Amount', type: 'number' },
    { key: 'Cost', type: 'number' },
    { key: 'Date', type: 'date' },
  ],
  rows: [
    { Region: 'North', CustID: 'C1', Amount: 1000, Cost: 600, Date: '2026-01-15' },
    { Region: 'South', CustID: 'C2', Amount: 250, Cost: 200, Date: '2026-02-20' },
    { Region: 'North', CustID: 'C3', Amount: 4000, Cost: 1000, Date: '2026-03-05' },
    { Region: 'East', CustID: 'C9', Amount: 75, Cost: 90, Date: '2026-04-01' },
  ],
};

const customers: FormulaTable = {
  id: 't2',
  name: 'Customers',
  fields: [
    { key: 'ID', type: 'text' },
    { key: 'Email', type: 'text' },
    { key: 'Name', type: 'text' },
  ],
  rows: [
    { ID: 'C1', Email: 'a@acme.com', Name: 'acme ltd' },
    { ID: 'C2', Email: 'b@bolt.com', Name: 'bolt co' },
    { ID: 'C3', Email: 'c@cog.com', Name: 'cog inc' },
  ],
};

const tables = [sales, customers];
let pass = 0;
let fail = 0;

function check(label: string, source: string, expected: unknown[]) {
  const compiled = compile(source);
  if (!compiled.ok) {
    console.log(`FAIL  ${label}\n      parse: ${compiled.issues.map((i) => i.message).join('; ')}`);
    fail += 1;
    return;
  }
  const got = runFormula(compiled, { tables, self: sales });
  const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);
  const a = JSON.stringify(got.map(round));
  const b = JSON.stringify(expected.map(round));
  if (a === b) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}\n      want ${b}\n      got  ${a}`);
  }
}

// --- arithmetic and precedence
check('arithmetic', '[Amount] - [Cost]', [400, 50, 3000, -15]);
check('precedence', '2 + 3 * 4', [14, 14, 14, 14]);
check('power right assoc', '2 ^ 3 ^ 2', [512, 512, 512, 512]);
check('unary minus', '-[Amount] + 1', [-999, -249, -3999, -74]);
check('percent suffix', '[Amount] * 10%', [100, 25, 400, 7.5]);
check('concat operator', '[Region] & "!"', ['North!', 'South!', 'North!', 'East!']);
check('comparison', '[Amount] > 500', [true, false, true, false]);
check('divide by zero', '[Amount] / 0', ['#DIV/0!', '#DIV/0!', '#DIV/0!', '#DIV/0!']);

// --- aggregates over a whole column
check('SUM column', 'SUM([Amount])', [5325, 5325, 5325, 5325]);
check('AVERAGE', 'AVERAGE([Amount])', [1331.25, 1331.25, 1331.25, 1331.25]);
check('MAX', 'MAX([Amount])', [4000, 4000, 4000, 4000]);
check('COUNTIF', 'COUNTIF([Region], "North")', [2, 2, 2, 2]);
check('SUMIF criteria op', 'SUMIF([Amount], ">500", [Amount])', [5000, 5000, 5000, 5000]);
check('SUMIFS two conds', 'SUMIFS([Amount], [Region], "North", [Amount], ">2000")', [4000, 4000, 4000, 4000]);
check('scalar vs range', '[Amount] / SUM([Amount])', [
  1000 / 5325, 250 / 5325, 4000 / 5325, 75 / 5325,
]);

// --- cross-table lookup
check('VLOOKUP hit', 'VLOOKUP([CustID], Customers[ID], Customers[Email], "none")', [
  'a@acme.com', 'b@bolt.com', 'c@cog.com', 'none',
]);
check('VLOOKUP default NA', 'VLOOKUP([CustID], Customers[ID], Customers[Email])', [
  'a@acme.com', 'b@bolt.com', 'c@cog.com', '#N/A',
]);
check('IFERROR wraps NA', 'IFERROR(VLOOKUP([CustID], Customers[ID], Customers[Email]), "missing")', [
  'a@acme.com', 'b@bolt.com', 'c@cog.com', 'missing',
]);
check('COUNTMATCH', 'COUNTMATCH([Region], [Region])', [2, 1, 2, 1]);

// --- logical
check('IF', 'IF([Amount] > 500, "Big", "Small")', ['Big', 'Small', 'Big', 'Small']);
check('nested IF via IFS', 'IFS([Amount] >= 4000, "A", [Amount] >= 500, "B", TRUE, "C")', ['B', 'C', 'A', 'C']);
check('SWITCH default', 'SWITCH([Region], "North", "N", "South", "S", "Other")', ['N', 'S', 'N', 'Other']);
check('AND/OR', 'AND([Amount] > 100, OR([Region] = "North", [Region] = "South"))', [true, true, true, false]);

// --- text
check('CONCAT', 'CONCAT([Region], "-", [CustID])', ['North-C1', 'South-C2', 'North-C3', 'East-C9']);
check('PROPER', 'PROPER(VLOOKUP([CustID], Customers[ID], Customers[Name], "x y"))', [
  'Acme Ltd', 'Bolt Co', 'Cog Inc', 'X Y',
]);
check('LEFT/LEN', 'LEFT([Region], 2) & LEN([Region])', ['No5', 'So5', 'No5', 'Ea4']);
check('SUBSTITUTE', 'SUBSTITUTE([Region], "or", "OR")', ['NORth', 'South', 'NORth', 'East']);
check('CONTAINS', 'CONTAINS([Region], "th")', [true, true, true, false]);
check('SPLITPART', 'SPLITPART("a,b,c", ",", 2)', ['b', 'b', 'b', 'b']);
check('TEXTJOIN skip empty', 'TEXTJOIN(", ", TRUE, [Region], "", [CustID])', [
  'North, C1', 'South, C2', 'North, C3', 'East, C9',
]);

// --- dates
check('YEAR/MONTH', 'YEAR([Date]) * 100 + MONTH([Date])', [202601, 202602, 202603, 202604]);
check('QUARTER', 'QUARTER([Date])', [1, 1, 1, 2]);
check('DATEDIF days', 'DATEDIF("2026-01-01", [Date], "d")', [14, 50, 63, 90]);
check('EOMONTH', 'EOMONTH([Date], 0)', ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
check('EDATE clamp', 'EDATE("2026-01-31", 1)', ['2026-02-28', '2026-02-28', '2026-02-28', '2026-02-28']);
check('WEEKDAY', 'WEEKDAY("2026-01-15")', ['Thursday', 'Thursday', 'Thursday', 'Thursday']);

// --- finance
check('MARGIN', 'ROUND(MARGIN([Amount] - [Cost], [Amount]), 3)', [0.4, 0.2, 0.75, -0.2]);
check('GROWTH', 'ROUND(GROWTH([Cost], [Amount]), 3)', [0.667, 0.25, 3, -0.167]);
check('PMT sign', 'ROUND(PMT(0.05/12, 360, 250000), 2)', [-1342.05, -1342.05, -1342.05, -1342.05]);

// --- errors surface as values
check('unknown column', '[Nope] + 1', ['#REF!', '#REF!', '#REF!', '#REF!']);
check('unknown function', 'NOPE(1)', ['#NAME?', '#NAME?', '#NAME?', '#NAME?']);
check('unknown table', 'Ghost[X]', ['#REF!', '#REF!', '#REF!', '#REF!']);

// --- parse errors are reported, not thrown
for (const bad of ['SUM(', '[Unclosed', '1 +', '2 ** 3', 'IF(', '"unterminated']) {
  const compiled = compile(bad);
  if (compiled.ok) {
    console.log(`FAIL  bad formula accepted: ${bad}`);
    fail += 1;
  } else {
    pass += 1;
    console.log(`ok    rejected ${JSON.stringify(bad)} -> ${compiled.issues[0]?.message}`);
  }
}

// --- dependency extraction
const dep = compile('VLOOKUP([CustID], Customers[ID], Customers[Email])');
console.log(`ok    deps fields=${JSON.stringify(dep.fields)} refs=${JSON.stringify(dep.refs.map((r) => r.table + '.' + r.field))}`);

// --- preview
const pv = previewFormula(compile('[Amount] * 2'), { tables, self: sales, rowIndex: 2 });
console.log(`ok    preview row2 = ${pv.value} (expect 8000)`);
if (pv.value !== 8000) fail += 1; else pass += 1;

// --- search
console.log(`ok    search "days between" -> ${searchFunctions('days between')[0]?.name}`);
console.log(`ok    search "join" -> ${searchFunctions('join')[0]?.name}`);
console.log(`ok    search "vlook" -> ${searchFunctions('vlook')[0]?.name}`);
console.log(`ok    total functions = ${FUNCTIONS.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
