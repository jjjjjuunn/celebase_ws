// Copy src/**/*.module.css -> dist/**/*.module.css after tsc emit.
// tsc does not include .css in its output; Next.js (transpilePackages) and Vite
// (Storybook) resolve CSS Modules from the package's dist by filename, so the
// files must sit alongside the emitted JS.

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const SRC_DIR = join(PACKAGE_ROOT, 'src');
const DIST_DIR = join(PACKAGE_ROOT, 'dist');

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.module.css')) {
      yield full;
    }
  }
}

async function main() {
  try {
    await stat(DIST_DIR);
  } catch {
    throw new Error('dist/ not found — run tsc first.');
  }

  let copied = 0;
  for await (const src of walk(SRC_DIR)) {
    const rel = relative(SRC_DIR, src);
    const dest = join(DIST_DIR, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest);
    copied += 1;
  }
  process.stdout.write(`[ui-kit] copied ${copied} .module.css file(s) to dist\n`);
}

main();
