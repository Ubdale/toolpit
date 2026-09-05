import { encodeQr } from '../lib/qr/encode';
import { defaultStyle, qrToSvg } from '../lib/qr/render';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (ok) { pass += 1; console.log('ok    ' + label); }
  else { fail += 1; console.log('FAIL  ' + label + (extra ? '  ' + extra : '')); }
};

const matrix = encodeQr('hello', { ecc: 'M' });

const attacks = [
  '#000"/><script>alert(1)</script><rect fill="#fff',
  'red" onload="alert(1)',
  "#000'/><foreignObject><body onload=alert(1)>",
  'url(javascript:alert(1))',
  '</svg><img src=x onerror=alert(1)>',
];

for (const attack of attacks) {
  const svg = qrToSvg(matrix, { ...defaultStyle, dark: attack, light: attack });
  const clean =
    !svg.includes('<script') && !svg.includes('onerror') && !svg.includes('onload') &&
    !svg.includes('javascript:') && !svg.includes('</svg><') && !svg.includes('<foreignObject');
  check(`blocks ${JSON.stringify(attack.slice(0, 34))}`, clean, svg.slice(0, 130));
}

// Legitimate colours still work.
for (const good of ['#000000', '#fff', 'rebeccapurple', 'rgb(12, 34, 56)', '#11223344']) {
  const svg = qrToSvg(matrix, { ...defaultStyle, dark: good });
  check(`keeps ${good}`, svg.includes(`fill="${good}"`), svg.slice(0, 120));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
