// pdf.js needs its worker served as a static asset. Copy it out of
// node_modules on install/build so the client can point at /pdf.worker.min.mjs
// without bundling a ~1MB worker into a page chunk.
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkg = require.resolve('pdfjs-dist/package.json');
const src = path.join(path.dirname(pkg), 'build', 'pdf.worker.min.mjs');
const destDir = path.join(process.cwd(), 'public');
const dest = path.join(destDir, 'pdf.worker.min.mjs');

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log('[toolpit] copied pdf.js worker -> public/pdf.worker.min.mjs');
