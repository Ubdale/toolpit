// Copies the runtime binaries that have to be served as static assets rather
// than bundled: the pdf.js worker, and the ONNX Runtime WebAssembly build used
// by the inpainting tool. Each is fetched on demand by the tool that needs it,
// so neither touches any page's initial load.
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

async function copyInto(source, destination, label) {
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log(`[toolpit] copied ${label} -> ${path.relative(process.cwd(), destination)}`);
}

const publicDir = path.join(process.cwd(), 'public');

const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));
await copyInto(
  path.join(pdfjs, 'build', 'pdf.worker.min.mjs'),
  path.join(publicDir, 'pdf.worker.min.mjs'),
  'pdf.js worker',
);

// Only the plain SIMD build: the jsep/asyncify variants are twice the size and
// Toolpit runs inference on the wasm execution provider. The .mjs loader has to
// sit beside the .wasm — ORT resolves it relative to env.wasm.wasmPaths.
// onnxruntime-web does not export ./package.json, so resolve a dist entry and
// walk back up to the package root.
const ort = path.dirname(path.dirname(require.resolve('onnxruntime-web')));
for (const asset of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await copyInto(
    path.join(ort, 'dist', asset),
    path.join(publicDir, 'ort', asset),
    `ONNX Runtime ${path.extname(asset).slice(1)}`,
  );
}
