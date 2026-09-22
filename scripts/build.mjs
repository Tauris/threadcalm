#!/usr/bin/env node
/**
 * Bundles src/main.js into a single installable userscript.
 *
 * Modes:
 *   node scripts/build.mjs                   build once, to dist/
 *   node scripts/build.mjs --watch           rebuild on change
 *   node scripts/build.mjs --check           build to memory, fail if dist/ is stale
 *   node scripts/build.mjs --outfile PATH    build somewhere other than dist/
 *
 * The --check mode is what CI uses to guarantee that the committed dist file
 * always matches the sources it was built from.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { COPYRIGHT_HOLDER, metadata } from '../src/meta.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(ROOT, 'src', 'main.js');
const DIST_FILE = join(ROOT, 'dist', 'threadcalm.user.js');

const argv = process.argv.slice(2);
const args = new Set(argv);
const WATCH = args.has('--watch');
const CHECK = args.has('--check');

const outfileArg = argv[argv.indexOf('--outfile') + 1];
const OUT_FILE =
  args.has('--outfile') && outfileArg && !outfileArg.startsWith('--')
    ? resolve(ROOT, outfileArg)
    : DIST_FILE;

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

/**
 * The icon travels as a percent-encoded data URI.
 *
 * The readable SVG lives in src/meta.js; encoding it here keeps the emitted
 * header clear of the spaces and angle brackets a metadata parser could trip
 * over, without the repository having to store an unreadable blob. Only the
 * line breaks and their indentation are stripped — every remaining space is
 * inside an attribute and has to survive.
 */
function renderIcon(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
}

/**
 * Renders the `// ==UserScript==` header.
 *
 * Keys are padded to a fixed column so the generated header stays readable in
 * the Tampermonkey editor, which is where most people will first see it.
 */
function renderMetadataBlock(meta, version) {
  const entries = [];
  const push = (key, value) => entries.push([key, value]);

  push('name', meta.name);
  push('namespace', meta.namespace);
  push('version', version);
  push('description', meta.description);
  push('author', meta.author);
  push('icon', renderIcon(meta.icon));
  push('license', meta.license);
  push('homepageURL', meta.homepageURL);
  push('supportURL', meta.supportURL);
  push('downloadURL', meta.downloadURL);
  push('updateURL', meta.updateURL);
  for (const value of meta.match) push('match', value);
  for (const value of meta.include) push('include', value);
  push('run-at', meta['run-at']);
  if (meta.noframes) push('noframes', '');
  for (const value of meta.grant) push('grant', value);

  const width = Math.max(...entries.map(([key]) => key.length)) + 1;
  const lines = entries.map(
    ([key, value]) => `// @${key.padEnd(width)}${value}`.trimEnd(),
  );

  return ['// ==UserScript==', ...lines, '// ==/UserScript=='].join('\n');
}

/**
 * Notice carried by the installed file itself.
 *
 * The README is not what ends up in someone's userscript manager, so the
 * non-affiliation statement and the licence travel with the code.
 */
const NOTICE = `/*!
 * ${metadata.name} v${pkg.version}
 * ${metadata.homepageURL}
 *
 * Copyright (c) 2026 ${COPYRIGHT_HOLDER}. Licensed under the BSD 3-Clause License.
 * Provided "as is", without warranty of any kind. See LICENSE in the repository.
 *
 * INDEPENDENT PROJECT - NOT AFFILIATED WITH MICROSOFT.
 * This is an unofficial, community-maintained userscript. It is not affiliated
 * with, endorsed by, sponsored by or supported by Microsoft Corporation, and
 * Microsoft has not reviewed it and has no responsibility for it. "Microsoft",
 * "Viva", "Viva Engage", "Yammer" and related marks are trademarks of Microsoft
 * Corporation, used here only to identify the product this script works with.
 * It contains no Microsoft code or assets, sends no data anywhere, and only
 * changes how an already-loaded page is displayed in your own browser.
 *
 * Check your organisation's policy before using it on a corporate tenant.
 */
`;

const banner = `${renderMetadataBlock(metadata, pkg.version)}\n${NOTICE}`;

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox115', 'safari16'],
  charset: 'utf8',
  legalComments: 'inline',
  banner: { js: banner },
  define: {
    __TC_VERSION__: JSON.stringify(pkg.version),
  },
  // Readability beats byte count here: a userscript is reviewed by the people
  // who install it, so the shipped bundle stays unminified.
  minify: false,
};

async function buildToString() {
  const result = await esbuild.build({ ...options, write: false });
  return result.outputFiles[0].text;
}

const shown = relative(ROOT, OUT_FILE).replaceAll('\\', '/');

if (CHECK) {
  const fresh = await buildToString();
  const current = existsSync(OUT_FILE) ? await readFile(OUT_FILE, 'utf8') : null;
  if (current !== fresh) {
    console.error(`${shown} is out of date.\nRun \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${shown} is up to date.`);
} else if (WATCH) {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const ctx = await esbuild.context({ ...options, outfile: OUT_FILE });
  await ctx.watch();
  console.log(`watching src/ -> ${shown}`);
} else {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const output = await buildToString();
  await writeFile(OUT_FILE, output, 'utf8');
  const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
  console.log(`built ${shown} (v${pkg.version}, ${kb} kB)`);
}
