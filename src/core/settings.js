/**
 * Settings: schema, defaults, persistence and change notification.
 *
 * The schema is the single source of truth. It supplies the defaults, coerces
 * anything read back from storage (which may have been written by an older
 * version, or hand-edited), and drives the settings panel so the UI can never
 * drift out of sync with the options the code actually reads.
 *
 * Keys are flat dotted strings. Flat keys keep persistence, migration and
 * form binding trivial; the dots exist only to group rows in the panel.
 */
import { getValue, setValue, deleteValue } from './gm.js';
import { bus, EVENTS } from './bus.js';
import { AVAILABLE_LANGUAGES, LANGUAGE_NAMES } from './i18n.js';
import { DETECTABLE_LANGUAGES } from './language.js';
import { setDebug } from './logger.js';

const STORAGE_KEY = 'settings';

export const GROUPS = [
  { id: 'expand', title: 'Thread expansion' },
  { id: 'translate', title: 'Translation controls' },
  { id: 'quiet', title: 'Post chrome' },
  { id: 'reading', title: 'Reading' },
  { id: 'declutter', title: 'Clutter' },
  { id: 'highlight', title: 'Highlighting' },
  { id: 'copy', title: 'Copying' },
  { id: 'shortcuts', title: 'Keyboard' },
  { id: 'general', title: 'General' },
  { id: 'advanced', title: 'Advanced' },
];

/**
 * @typedef {object} SettingDefinition
 * @property {string} key
 * @property {'boolean'|'number'|'select'|'multiselect'|'lines'} type
 * @property {any} default
 * @property {string} label
 * @property {string} [help]
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {Array<{value: string, label: string}>} [options]
 */

const languageOptions = AVAILABLE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_NAMES[code],
}));

const detectableOptions = DETECTABLE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_NAMES[code] ?? code.toUpperCase(),
}));

/** @type {SettingDefinition[]} */
export const SCHEMA = [
  // -- Thread expansion ----------------------------------------------------
  {
    key: 'expand.enabled',
    type: 'boolean',
    default: true,
    label: 'Expand threads automatically',
    help: 'Click reply counters and "show more replies" controls as they appear.',
  },
  {
    key: 'expand.scope',
    type: 'select',
    default: 'everywhere',
    label: 'Where to expand',
    options: [
      { value: 'everywhere', label: 'Feed and single threads' },
      { value: 'thread', label: 'Single threads only' },
    ],
    help: 'Restricting to single threads keeps the main feed short.',
  },
  {
    key: 'expand.truncatedText',
    type: 'boolean',
    default: true,
    label: 'Expand truncated post text',
    help: 'Also click "See more" inside a post body.',
  },
  {
    key: 'expand.maxClicksPerScan',
    type: 'number',
    default: 40,
    min: 1,
    max: 500,
    label: 'Max clicks per pass',
  },
  {
    key: 'expand.maxTotalClicks',
    type: 'number',
    default: 1500,
    min: 10,
    max: 100000,
    label: 'Max clicks per page visit',
    help: 'Safety limit against runaway clicking. Resets on navigation.',
  },
  {
    key: 'expand.scanDelayMs',
    type: 'number',
    default: 150,
    min: 0,
    max: 5000,
    step: 50,
    label: 'Scan delay (ms)',
  },
  {
    key: 'expand.settleDelayMs',
    type: 'number',
    default: 800,
    min: 100,
    max: 10000,
    step: 100,
    label: 'Settle delay after clicks (ms)',
    help: 'How long to let Engage re-render before the next pass.',
  },
  {
    key: 'expand.heartbeatMs',
    type: 'number',
    default: 1000,
    min: 0,
    max: 30000,
    step: 250,
    label: 'Heartbeat interval (ms)',
    help: 'Backup scan for content the mutation observer misses. 0 disables it.',
  },

  // -- Translation controls ------------------------------------------------
  {
    key: 'translate.mode',
    type: 'select',
    default: 'compact',
    label: '"Show translation" control',
    options: [
      { value: 'compact', label: 'Compact icon' },
      { value: 'known', label: 'Hide when I read the language' },
      { value: 'hide', label: 'Always hide' },
      { value: 'off', label: 'Leave unchanged' },
    ],
    help: 'Compact replaces the full label with a small globe that expands on hover or focus.',
  },
  {
    key: 'translate.knownLanguages',
    type: 'multiselect',
    default: ['en', 'de'],
    label: 'Languages I read',
    options: detectableOptions,
    help: 'Used by "Hide when I read the language". Detection is a stop-word guess and needs a sentence or two of text.',
  },
  {
    key: 'translate.minConfidence',
    type: 'number',
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
    label: 'Minimum detection confidence',
    help: 'Below this the control is only compacted, never hidden.',
  },

  // -- Post chrome ---------------------------------------------------------
  {
    key: 'quiet.actions',
    type: 'select',
    default: 'off',
    label: 'Like / Comment / Share bar',
    options: [
      { value: 'off', label: 'Always visible' },
      { value: 'dim', label: 'Fade out until hovered (keeps its space)' },
      { value: 'collapse', label: 'Collapse until hovered (saves a row)' },
    ],
    help: 'Revealed by hover and by keyboard focus, so the buttons stay reachable either way. "Collapse" wins back the most vertical space but makes the post grow slightly as you point at it.',
  },
  {
    key: 'quiet.composer',
    type: 'boolean',
    default: false,
    label: 'Collapse "Write a comment" boxes',
    help: 'Each inline composer costs a row per post. Expands on click or focus.',
  },

  // -- Reading -------------------------------------------------------------
  {
    key: 'reading.enabled',
    type: 'boolean',
    default: false,
    label: 'Compact reading mode',
    help: 'Narrower column, tighter spacing, quieter chrome.',
  },
  {
    key: 'reading.maxWidth',
    type: 'number',
    default: 760,
    min: 480,
    max: 1600,
    step: 20,
    label: 'Reading column width (px)',
  },
  {
    key: 'reading.hideSidebars',
    type: 'boolean',
    default: true,
    label: 'Hide side rails in reading mode',
  },
  {
    key: 'reading.hideBanner',
    type: 'boolean',
    default: false,
    label: 'Hide the top app bar in reading mode',
    help: 'Reclaims the sticky header. Search and the app launcher go with it, so this is off by default.',
  },

  // -- Clutter -------------------------------------------------------------
  {
    key: 'declutter.enabled',
    type: 'boolean',
    default: false,
    label: 'Hide suggested and promoted content',
    help: 'Hides feed cards labelled as sponsored, promoted or suggested.',
  },

  // -- Highlighting --------------------------------------------------------
  {
    key: 'highlight.unanswered',
    type: 'boolean',
    default: true,
    label: 'Mark posts with no replies',
  },
  {
    key: 'highlight.unread',
    type: 'boolean',
    default: true,
    label: 'Mark posts seen for the first time',
    help: 'Remembers post identities locally so returning to a feed shows what is new.',
  },

  // -- Copying -------------------------------------------------------------
  {
    key: 'copy.format',
    type: 'select',
    default: 'markdown',
    label: 'Copy format',
    options: [
      { value: 'markdown', label: 'Markdown' },
      { value: 'text', label: 'Plain text' },
    ],
  },
  {
    key: 'copy.includePermalink',
    type: 'boolean',
    default: true,
    label: 'Include the thread link',
  },
  {
    key: 'copy.includeTimestamps',
    type: 'boolean',
    default: true,
    label: 'Include timestamps',
  },
  {
    key: 'copy.showButtons',
    type: 'boolean',
    default: true,
    label: 'Show copy buttons on posts',
    help: 'Adds "copy thread" and "copy link" actions to each post header.',
  },

  // -- Keyboard ------------------------------------------------------------
  {
    key: 'shortcuts.enabled',
    type: 'boolean',
    default: true,
    label: 'Keyboard shortcuts',
    help: 'Press ? on an Engage page for the list.',
  },

  // -- General -------------------------------------------------------------
  {
    key: 'general.showPanel',
    type: 'boolean',
    default: true,
    label: 'Show the status panel',
  },
  {
    key: 'general.languages',
    type: 'multiselect',
    default: ['en', 'de'],
    label: 'Interface languages to recognise',
    options: languageOptions,
    help: 'Which label sets to match against. Add your tenant language here if controls are not found.',
  },
  {
    key: 'general.debug',
    type: 'boolean',
    default: false,
    label: 'Verbose console logging',
  },

  // -- Advanced ------------------------------------------------------------
  {
    key: 'advanced.replyIconSignatures',
    type: 'lines',
    default: ['M7.35 3.65c.2.2'],
    label: 'Reply icon signatures',
    help:
      "The start of the SVG path data for Engage's reply arrow, one per line. "
      + 'This is what finds reply counters in interface languages with no label '
      + 'pack. Clearing it falls back to matching labels only.',
  },
  {
    key: 'advanced.extraExpandReplies',
    type: 'lines',
    default: [],
    label: 'Extra reply-expansion patterns',
    help: 'One regular expression per line, matched case-insensitively against control labels.',
  },
  {
    key: 'advanced.extraExpandText',
    type: 'lines',
    default: [],
    label: 'Extra "see more" patterns',
  },
  {
    key: 'advanced.extraPromoted',
    type: 'lines',
    default: [],
    label: 'Extra promoted/suggested patterns',
  },
];

const BY_KEY = new Map(SCHEMA.map((definition) => [definition.key, definition]));

/** Defaults as a plain object, rebuilt on demand so callers cannot mutate ours. */
export function defaults() {
  const result = {};
  for (const definition of SCHEMA) {
    result[definition.key] = Array.isArray(definition.default)
      ? [...definition.default]
      : definition.default;
  }
  return result;
}

/**
 * Forces a stored value into the shape the schema promises.
 * Anything unusable falls back to the default rather than propagating.
 */
function coerce(definition, value) {
  const fallback = Array.isArray(definition.default)
    ? [...definition.default]
    : definition.default;
  if (value == null) return fallback;

  switch (definition.type) {
    case 'boolean':
      return Boolean(value);

    case 'number': {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return fallback;
      const min = definition.min ?? Number.NEGATIVE_INFINITY;
      const max = definition.max ?? Number.POSITIVE_INFINITY;
      return Math.min(max, Math.max(min, parsed));
    }

    case 'select': {
      const allowed = (definition.options ?? []).map((option) => option.value);
      return allowed.includes(value) ? value : fallback;
    }

    case 'multiselect': {
      if (!Array.isArray(value)) return fallback;
      const allowed = new Set((definition.options ?? []).map((option) => option.value));
      const filtered = value.filter((item) => allowed.has(item));
      return filtered;
    }

    case 'lines':
      if (!Array.isArray(value)) return fallback;
      return value.map((line) => String(line)).filter((line) => line.trim().length > 0);

    default:
      return value;
  }
}

let current = defaults();

/** Reads persisted settings, coercing every key through the schema. */
export function load() {
  const stored = getValue(STORAGE_KEY, null);
  const next = defaults();
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(stored)) {
      const definition = BY_KEY.get(key);
      // Unknown keys are dropped: they are leftovers from a removed feature.
      if (definition) next[key] = coerce(definition, value);
    }
  }
  current = next;
  setDebug(current['general.debug']);
  return current;
}

/** The whole settings object. Treat as read-only. */
export function all() {
  return current;
}

/** @param {string} key */
export function get(key) {
  if (!BY_KEY.has(key)) {
    throw new Error(`Unknown setting: ${key}`);
  }
  return current[key];
}

/**
 * Writes one or more settings, persists them and announces the change.
 * @param {Record<string, any>} changes
 */
export function update(changes) {
  const applied = {};
  for (const [key, value] of Object.entries(changes)) {
    const definition = BY_KEY.get(key);
    if (!definition) continue;
    const coerced = coerce(definition, value);
    if (JSON.stringify(coerced) === JSON.stringify(current[key])) continue;
    current[key] = coerced;
    applied[key] = coerced;
  }
  if (Object.keys(applied).length === 0) return applied;

  setValue(STORAGE_KEY, current);
  if ('general.debug' in applied) setDebug(applied['general.debug']);
  bus.emit(EVENTS.SETTINGS_CHANGED, { changed: applied, settings: current });
  return applied;
}

/** Convenience for the panel's toggle buttons. */
export function toggle(key) {
  update({ [key]: !get(key) });
  return get(key);
}

/** Restores factory defaults. */
export function reset() {
  current = defaults();
  deleteValue(STORAGE_KEY);
  setDebug(current['general.debug']);
  bus.emit(EVENTS.SETTINGS_CHANGED, { changed: current, settings: current });
  return current;
}

/** Definitions belonging to a panel group, in schema order. */
export function definitionsFor(groupId) {
  return SCHEMA.filter((definition) => definition.key.startsWith(`${groupId}.`));
}

export function definition(key) {
  return BY_KEY.get(key);
}

/** Custom pattern lists in the shape `buildMatchers` expects. */
export function customPatterns() {
  return {
    expandReplies: current['advanced.extraExpandReplies'],
    expandText: current['advanced.extraExpandText'],
    promoted: current['advanced.extraPromoted'],
  };
}
