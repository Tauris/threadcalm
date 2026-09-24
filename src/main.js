/**
 * Threadcalm — entry point.
 *
 * Responsibilities, and nothing else:
 *   1. load settings and compile the label matchers
 *   2. inject the stylesheet
 *   3. construct the features and the UI
 *   4. route navigation, DOM and settings events to whichever of them care
 *   5. register the Tampermonkey menu commands
 *
 * Every feature exposes the same optional lifecycle — start, stop,
 * onNavigate, onDomChanged, onSettingsChanged, setMatchers — so this file
 * fans events out without knowing what any of them do.
 */
import { bus, EVENTS } from './core/bus.js';
import { rootPosts } from './core/dom.js';
import { addStyle, copyToClipboard, registerMenuCommand } from './core/gm.js';
import { buildMatchers } from './core/i18n.js';
import { log } from './core/logger.js';
import * as settings from './core/settings.js';
import { startSpaWatcher } from './core/spa.js';

import { createCopyTools } from './features/copy.js';
import { createDeclutterer } from './features/declutter.js';
import { createExpander } from './features/expand.js';
import { createHighlighter } from './features/highlight.js';
import { createQuietChrome } from './features/quiet.js';
import { snapshot } from './core/stats.js';
import { createReadingMode } from './features/reading.js';
import { createShortcuts } from './features/shortcuts.js';
import { createTranslateTamer } from './features/translate.js';

import { createPanel } from './ui/panel.js';
import { ALL_STYLES } from './ui/styles.js';
import { createToaster } from './ui/toast.js';

/** Replaced at build time with the version from package.json. */
const VERSION = typeof __TC_VERSION__ === 'string' ? __TC_VERSION__ : '0.0.0-dev';

/**
 * Which build this is, and from which channel.
 *
 * The stamp is a hash of the bundle, so it changes whenever the sources do.
 * It exists to answer one question without ceremony: is the copy running in
 * this tab the one I just built?
 */
const CHANNEL = typeof __TC_CHANNEL__ === 'string' ? __TC_CHANNEL__ : 'dev';
const BUILD = typeof __TC_BUILD__ === 'string' ? __TC_BUILD__ : 'dev';

/** Settings whose change requires the label matchers to be rebuilt. */
const MATCHER_KEYS = [
  'general.languages',
  'advanced.extraExpandReplies',
  'advanced.extraExpandText',
  'advanced.extraPromoted',
];

function main() {
  settings.load();

  let matchers = buildMatchers(settings.get('general.languages'), settings.customPatterns());

  addStyle(ALL_STYLES);

  const expander = createExpander({ matchers });
  const translate = createTranslateTamer({ matchers });
  const declutter = createDeclutterer({ matchers });
  const highlighter = createHighlighter({ matchers });
  const quietChrome = createQuietChrome();
  const readingMode = createReadingMode();
  const copyTools = createCopyTools({ expander });
  const toaster = createToaster();

  const panel = createPanel({
    expander,
    highlighter,
    version: VERSION,
    channel: CHANNEL,
    build: BUILD,
  });

  const shortcuts = createShortcuts({
    expander,
    copyTools,
    readingMode,
    panel,
    quietChrome,
  });

  const features = [
    // First, so its overrides are in place before anything else reads a
    // setting; otherwise the page would briefly render without them.
    readingMode,
    expander,
    translate,
    declutter,
    highlighter,
    quietChrome,
    copyTools,
    toaster,
    panel,
    shortcuts,
  ];

  const dispatch = (hook, payload) => {
    for (const feature of features) {
      feature[hook]?.(payload);
    }
  };

  bus.on(EVENTS.NAVIGATE, (payload) => dispatch('onNavigate', payload));
  bus.on(EVENTS.DOM_CHANGED, () => dispatch('onDomChanged'));
  bus.on(EVENTS.COPY_DIAGNOSTICS, () => { copyDiagnostics(); });

  bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => {
    if (MATCHER_KEYS.some((key) => key in changed)) {
      matchers = buildMatchers(settings.get('general.languages'), settings.customPatterns());
      for (const feature of features) feature.setMatchers?.(matchers);
    }
    dispatch('onSettingsChanged', changed);
  });

  for (const feature of features) feature.start?.();

  startSpaWatcher();
  registerMenuCommands({ expander, panel, shortcuts, copyTools, readingMode });

  log.info(`v${VERSION} (${CHANNEL} ${BUILD}) ready on ${location.host}`);

  // Detecting no posts at all is the signature of Engage having changed its
  // markup. Say so once, rather than letting half the features do nothing in
  // silence - that failure mode cost a release to notice.
  setTimeout(() => {
    if (rootPosts().length === 0 && document.querySelector('[role="main"]')) {
      log.warn(
        'no posts recognised on this page. If this is a feed or a thread, the markup has '
        + 'probably changed - use the "Copy layout diagnostics" menu command when reporting it.',
      );
    }
  }, 5000);
}

function registerMenuCommands({ expander, panel, shortcuts, copyTools, readingMode }) {
  registerMenuCommand('Settings…', () => panel.openSettings());
  registerMenuCommand('Keyboard shortcuts…', () => shortcuts.showHelp());

  registerMenuCommand('Pause / resume automatic expansion', () => {
    const paused = expander.togglePause();
    bus.emit(EVENTS.TOAST, { message: paused ? 'Expansion paused' : 'Expansion resumed' });
  });

  registerMenuCommand('Expand everything on this page now', () => {
    expander.rescan();
    bus.emit(EVENTS.TOAST, { message: 'Rescanning this page…' });
  });

  registerMenuCommand('Copy the first thread on this page', () => {
    copyTools.copyThread(rootPosts()[0]);
  });

  registerMenuCommand('Toggle reading mode', () => {
    const on = readingMode.toggle();
    bus.emit(EVENTS.TOAST, { message: on ? 'Reading mode on' : 'Reading mode off' });
  });

  registerMenuCommand('Show the Threadcalm panel', () => panel.show());

  registerMenuCommand('Copy layout diagnostics (for bug reports)', copyDiagnostics);
}

/**
 * Selectors whose presence decides whether the script can work at all.
 * Counting them is the fastest way to tell "the page changed" apart from
 * "the feature is broken".
 */
const HEALTH_SELECTORS = [
  ['[role="main"]', 'main landmark'],
  ['[role="banner"]', 'app banner'],
  ['.qaContentMainColumn', 'main column'],
  ['[role="article"], article', 'semantic posts'],
  ['.qaThreadStarter', 'thread starter'],
  ['.y-fixedGridColumn', 'comment containers'],
  ['[data-testid="overflow-set"]', 'action rows'],
  ['.tc-quiet-post', 'posts tagged by Threadcalm'],
  ['.tc-translate-compact, .tc-translate-hidden', 'translate controls handled'],
];

/**
 * Describes the page's structure, without its content.
 *
 * Engage's markup cannot be inspected from outside the tenant, so when
 * something ends up the wrong size or simply never happens there is no way to
 * see why. This reports counts of the selectors the script depends on, then
 * the shape of the ancestor chain around the translate control — tags, roles,
 * display and box metrics. It deliberately reports no text, no names and no
 * ids, so the result can be pasted into an issue as-is.
 */
/**
 * How hard the script is working, as opposed to how the page is built.
 *
 * Two copies of this taken an hour apart answer the question a memory graph
 * cannot: whether anything is still running on a page nobody is touching.
 */
function activityLines() {
  const stats = snapshot();
  const idle = stats.sinceLastScanSeconds;

  return [
    '',
    'activity since load:',
    `  ${String(stats.uptimeSeconds).padStart(7)}  seconds running`,
    `  ${String(stats.scans).padStart(7)}  scans`,
    `  ${String(stats.candidates).padStart(7)}  controls examined`,
    `  ${String(stats.layoutReads).padStart(7)}  layout reads (innerText)`,
    `  ${String(stats.layoutSkips).padStart(7)}  skipped without layout`,
    `  ${String(stats.domNodes).padStart(7)}  elements on the page now`,
    `  ${String(idle === null ? 'never' : idle).padStart(7)}  seconds since the last scan`,
    '',
    'On an idle page the first four should barely move between two readings',
    'taken minutes apart. A rising element count means the page is still',
    'growing, which is expansion working rather than anything leaking.',
  ];
}

async function copyDiagnostics() {
  const control =
    document.querySelector('.tc-translate-compact, .tc-translate-hidden') ??
    document.querySelector('[data-tc-title]');

  const lines = [
    `Threadcalm ${VERSION} (${CHANNEL} ${BUILD})`,
    `${navigator.userAgent}`,
    `host: ${location.host}`,
    '',
    'selector health:',
  ];

  for (const [selector, label] of HEALTH_SELECTORS) {
    let count = 0;
    try {
      count = document.querySelectorAll(selector).length;
    } catch {
      count = -1;
    }
    lines.push(`  ${String(count).padStart(4)}  ${label}  (${selector})`);
  }

  lines.push('', `posts resolved: ${rootPosts().length}`);
  lines.push(...activityLines(), '');

  if (!control) {
    lines.push('No translate control found on this page.');
  } else {
    lines.push('translate control, then ancestors:');
    let node = control;
    for (let depth = 0; node && depth < 6; depth += 1) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const describe = [
        node.tagName.toLowerCase(),
        node.getAttribute('role') ? `role=${node.getAttribute('role')}` : '',
        `display:${style.display}`,
        `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        `pad:${style.paddingTop}/${style.paddingBottom}`,
        `margin:${style.marginTop}/${style.marginBottom}`,
        `minH:${style.minHeight}`,
        `children:${node.children.length}`,
        node.classList.contains('tc-translate-row') ? '[row-collapsed]' : '',
        node.classList.contains('tc-translate-compact') ? '[compacted]' : '',
      ]
        .filter(Boolean)
        .join('  ');
      lines.push(`${'  '.repeat(depth)}${describe}`);
      node = node.parentElement;
    }
  }

  const report = lines.join('\n');
  const copied = await copyToClipboard(report);
  bus.emit(EVENTS.TOAST, {
    message: copied ? 'Diagnostics copied' : 'Clipboard blocked — see the console',
    tone: copied ? 'info' : 'warn',
  });
  if (!copied) log.info(report);
}

// `@run-at document-idle` normally means the body already exists, but Engage
// is occasionally slower than the userscript manager; waiting costs nothing.
if (document.body) {
  main();
} else {
  document.addEventListener('DOMContentLoaded', main, { once: true });
}
