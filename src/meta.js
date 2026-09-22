/**
 * Userscript metadata block, expressed as data.
 *
 * `scripts/build.mjs` turns this into the `// ==UserScript== ... // ==/UserScript==`
 * header of the bundled file. Keeping it here means the header is reviewable,
 * diffable and testable like any other source file.
 *
 * `version` is intentionally absent: the build injects it from package.json so
 * there is exactly one source of truth for the release number.
 */
export const REPOSITORY = 'https://github.com/Tauris/threadcalm';

export const SCRIPT_NAME = 'Threadcalm';

/**
 * The copyright holder, as named in LICENSE.
 *
 * Kept as its own constant rather than read from `metadata.author`, even
 * though the two currently read the same: one is a rights statement that has
 * to match LICENSE, the other is attribution that does not. A test keeps this
 * string and the LICENSE file from drifting apart.
 */
export const COPYRIGHT_HOLDER = 'Jörg Türmer';

/**
 * Whether the repository is publicly reachable.
 *
 * The in-page links to GitHub are gated on this. A fork kept private has no
 * working URLs to offer, and a dead "Documentation" link is worse than no
 * link at all — so such a fork sets this to false and the links disappear
 * rather than 404.
 */
export const PUBLIC_REPO = true;

/**
 * Where the script points people, once it may.
 *
 * `docs` is the full guide rather than the README: the README sells and
 * installs, the guide documents every setting.
 */
export const LINKS = {
  repository: REPOSITORY,
  docs: `${REPOSITORY}/blob/main/docs/USAGE.md`,
  shortcuts: `${REPOSITORY}/blob/main/docs/USAGE.md#keyboard-shortcuts`,
  issues: `${REPOSITORY}/issues`,
};

/**
 * The script's icon: three stepped bars, a thread opened out with each reply
 * sitting under its parent.
 *
 * It is an inline SVG rather than a hosted file because a hosted one would have
 * every userscript manager fetch an asset on the script's behalf, which is the
 * one thing "no external assets" in the README rules out.
 *
 * `@icon` renders outside any stylesheet, so `currentColor` is unavailable and
 * the colours are baked in. A white mark on a filled badge reads against a
 * light and a dark dashboard alike, which a bare stroke would not.
 */
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="10" fill="#2f6f68"/>
  <g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">
    <path d="M5 8h22"/>
    <path d="M11 16h16"/>
    <path d="M17 24h10"/>
  </g>
</svg>`;

/** Sites the script runs on. Also reused by the docs. */
export const MATCHES = [
  'https://engage.cloud.microsoft/*',
  'https://*.engage.cloud.microsoft/*',
  'https://web.yammer.com/*',
  'https://www.yammer.com/*',
];

export const metadata = {
  name: SCRIPT_NAME,
  namespace: REPOSITORY,
  description:
    'Expand whole Viva Engage threads automatically, copy them as Markdown, and read them with shortcuts, a reading mode and less clutter.',
  author: 'Jörg Türmer',
  icon: ICON_SVG,
  license: 'BSD-3-Clause',
  homepageURL: REPOSITORY,
  supportURL: `${REPOSITORY}/issues`,
  downloadURL: `${REPOSITORY}/raw/main/dist/threadcalm.user.js`,
  updateURL: `${REPOSITORY}/raw/main/dist/threadcalm.user.js`,
  match: MATCHES,
  // Some Tampermonkey configurations still honour @include more reliably than
  // @match on wildcard subdomains, so both are declared.
  include: MATCHES,
  'run-at': 'document-idle',
  noframes: true,
  grant: [
    'GM_addStyle',
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_setClipboard',
    'GM_registerMenuCommand',
  ],
};
