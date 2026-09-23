#!/usr/bin/env node
/**
 * Bundles src/main.js into a single installable userscript.
 *
 * Modes:
 *   node scripts/build.mjs                   build every channel into dist/
 *   node scripts/build.mjs --channel beta    build one channel only
 *   node scripts/build.mjs --watch           rebuild on change (one channel)
 *   node scripts/build.mjs --check           build to memory, fail if dist/ is stale
 *   node scripts/build.mjs --outfile PATH    build somewhere other than dist/
 *
 * Every channel is built from the same sources and differs only in identity
 * and its two URLs, so a pre-release build can never drift from the stable one
 * in anything that affects behaviour. Both artefacts are committed, and
 * --check verifies all of them, which is what lets CI guarantee that whatever
 * is installable matches the sources it was built from.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { CHANNELS, COPYRIGHT_HOLDER, DEFAULT_CHANNEL, metadataFor } from '../src/meta.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(ROOT, 'src', 'main.js');
const DIST_DIR = join(ROOT, 'dist');

const argv = process.argv.slice(2);
const args = new Set(argv);
const WATCH = args.has('--watch');
const CHECK = args.has('--check');

const flagValue = (name) => {
  const value = argv[argv.indexOf(name) + 1];
  return args.has(name) && value && !value.startsWith('--') ? value : null;
};

const channelArg = flagValue('--channel');
if (channelArg && !CHANNELS[channelArg]) {
  console.error(`Unknown channel "${channelArg}". Known: ${Object.keys(CHANNELS).join(', ')}.`);
  process.exit(2);
}

// No --channel means every channel, so one `npm run build` keeps the committed
// artefacts in step with one another.
const SELECTED = channelArg ? [channelArg] : Object.keys(CHANNELS);

const outfileArg = flagValue('--outfile');
if (outfileArg && SELECTED.length > 1) {
  console.error('--outfile needs a single --channel.');
  process.exit(2);
}

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
function noticeFor(meta) {
  return `/*!
 * ${meta.name} v${pkg.version}
 * ${meta.homepageURL}
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
}

/** Where a channel's artefact is written, unless --outfile overrides it. */
function outFileFor(channel) {
  if (outfileArg) return resolve(ROOT, outfileArg);
  return join(DIST_DIR, CHANNELS[channel].file);
}

/** @type {import('esbuild').BuildOptions} */
const baseOptions = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox115', 'safari16'],
  charset: 'utf8',
  legalComments: 'inline',
  define: {
    __TC_VERSION__: JSON.stringify(pkg.version),
  },
  // Readability beats byte count here: a userscript is reviewed by the people
  // who install it, so the shipped bundle stays unminified.
  minify: false,
};

/** esbuild options for one channel and one build stamp. */
function optionsFor(channel, build) {
  const meta = metadataFor(channel);
  const banner = `${renderMetadataBlock(meta, pkg.version)}\n${noticeFor(meta)}`;
  return {
    ...baseOptions,
    banner: { js: banner },
    define: {
      ...baseOptions.define,
      __TC_CHANNEL__: JSON.stringify(channel),
      __TC_BUILD__: JSON.stringify(build),
    },
  };
}

/**
 * A short stamp identifying exactly this build, shown in the panel.
 *
 * Deliberately derived from the bundle's own bytes rather than from git or the
 * clock: those would change the output on every commit or every run, and
 * --check compares a fresh build against the committed one. Same sources means
 * the same stamp, which is what keeps that comparison meaningful — and what
 * makes the stamp worth trusting when you are asking "is the version I have
 * installed the one I just built?".
 *
 * Two passes, because the stamp cannot be part of what it is a hash of: the
 * first builds with a placeholder, the second with the real value.
 */
const STAMP_PLACEHOLDER = '0000000';

async function buildToString(channel) {
  const first = await esbuild.build({
    ...optionsFor(channel, STAMP_PLACEHOLDER),
    write: false,
  });
  const stamp = createHash('sha256')
    .update(first.outputFiles[0].text)
    .digest('hex')
    .slice(0, 7);

  const final = await esbuild.build({ ...optionsFor(channel, stamp), write: false });
  return { text: final.outputFiles[0].text, stamp };
}

const display = (file) => relative(ROOT, file).replaceAll('\\', '/');

if (CHECK) {
  let stale = false;
  for (const channel of SELECTED) {
    const file = outFileFor(channel);
    const { text: fresh } = await buildToString(channel);
    const current = existsSync(file) ? await readFile(file, 'utf8') : null;
    if (current !== fresh) {
      console.error(`${display(file)} is out of date.`);
      stale = true;
    } else {
      console.log(`${display(file)} is up to date.`);
    }
  }
  if (stale) {
    console.error('Run `npm run build` and commit the result.');
    process.exit(1);
  }
} else if (WATCH) {
  // Watching every channel would rebuild files nobody is looking at, so watch
  // mode follows one: the default channel unless asked for another.
  const channel = channelArg ?? DEFAULT_CHANNEL;
  const OUT_FILE = outFileFor(channel);
  const shown = display(OUT_FILE);
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const ctx = await esbuild.context({
    ...optionsFor(channel, 'dev'),
    outfile: OUT_FILE,
  });
  await ctx.watch();
  console.log(`watching src/ -> ${shown} (${channel})`);
} else {
  await mkdir(DIST_DIR, { recursive: true });
  for (const channel of SELECTED) {
    const file = outFileFor(channel);
    const { text: output, stamp } = await buildToString(channel);
    await writeFile(file, output, 'utf8');
    const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
    console.log(`built ${display(file)} (${channel}, v${pkg.version}, ${stamp}, ${kb} kB)`);
  }
}
