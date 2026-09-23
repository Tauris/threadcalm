#!/usr/bin/env node
/**
 * Bumps the beta build counter and rebuilds.
 *
 * A userscript manager decides whether to update by comparing `@version` and
 * nothing else, so a beta build that keeps the previous version never reaches
 * the people testing it. Nothing about the branch looks wrong when that
 * happens — the file served is correct, it is simply never fetched — so the
 * counter is bumped by a script rather than left to be remembered.
 *
 * Run this before every push to the beta branch:
 *
 *   npm run beta:bump && git commit -am "…" && git push --force origin HEAD:beta
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE = join(ROOT, 'package.json');

const raw = await readFile(PACKAGE, 'utf8');
const pkg = JSON.parse(raw);

const next = Number(pkg.betaBuild ?? 0) + 1;

// Rewritten textually rather than via JSON.stringify so the file keeps its own
// key order, indentation and trailing newline.
const pattern = /("betaBuild":\s*)(\d+)/;
if (!pattern.test(raw)) {
  console.error('package.json has no "betaBuild" key to bump.');
  process.exit(1);
}

await writeFile(PACKAGE, raw.replace(pattern, `$1${next}`), 'utf8');
console.log(`beta build ${pkg.betaBuild ?? 0} -> ${next} (version ${pkg.version}.${next})`);
console.log('Now run `npm run build` and commit the rebuilt dist/.');
