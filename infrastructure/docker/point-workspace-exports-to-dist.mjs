#!/usr/bin/env node
/**
 * Point workspace package exports at compiled dist/ for production Node runtime.
 * Local/dev keeps src/*.ts exports; Docker invokes this after `pnpm build` of packages.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packages = process.argv.slice(2);
if (packages.length === 0) {
  console.error('Usage: point-workspace-exports-to-dist.mjs <pkg-dir>...');
  process.exit(1);
}

for (const dir of packages) {
  const pkgPath = resolve(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.main = './dist/index.js';
  pkg.types = './dist/index.d.ts';
  pkg.exports = { '.': './dist/index.js' };
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`pointed ${dir} exports to dist`);
}
