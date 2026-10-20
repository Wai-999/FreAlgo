// Bundles the ingestion worker into dist/worker/index.mjs (dependencies stay external and are
// installed with `npm ci --omit=dev` in the worker image).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'workers/index.ts')],
  outfile: path.join(root, 'dist/worker/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  packages: 'external',
  alias: { '@': root },
  tsconfig: path.join(root, 'tsconfig.json'),
  banner: {
    // Some CJS dependencies expect require() in ESM output.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
