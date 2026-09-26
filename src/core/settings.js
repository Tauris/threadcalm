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
 * @property {Array<{value: string, label: string, gain?: string, cost?: string}>} [options]
 */

const languageOptions = AVAILABLE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_NAMES[code],
}));

/**
 * A language's name in that language: "Português", "Dansk".
 *
 * Some detectable languages have no label pack, so no name of our own; the
 * browser already knows them all, and in the form a speaker would look for.
 */
function endonym(code) {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // An engine without Intl.DisplayNames falls through to the code.
  }
  return code.toUpperCase();
}

const detectableOptions = DETECTABLE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_NAMES[code] ?? endonym(code),
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
    help: 'Used by hiding and automatic translation. Latin-script languages use stop words; Japanese, Chinese, Korean, Greek, Thai, Armenian, and Georgian are recognised by their script, which wins over any English the post quotes. Han text can be ambiguous between Japanese and Chinese.',
  },
  {
    key: 'translate.minConfidence',
    type: 'number',
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
    label: 'Minimum detection confidence',
    help: 'Below this the control is only compacted, never hidden, and the post is never translated automatically.',
  },
  {
    key: 'translate.autoWhenVisible',
    type: 'boolean',
    default: false,
    label: 'Automatic translation',
    help: 'Uses Engage’s own translation, once per post, when a post in a language you do not read has been on screen for half a second. Posts you scroll past or never reach are not translated. Posts too short to judge are left alone, and so is Han-only text if you read Japanese or Chinese. “Show original” always takes you back. Shift+T switches it; pausing expansion switches it off.',
  },

  // -- Post chrome ---------------------------------------------------------
  {
    key: 'quiet.actions',
    type: 'select',
    default: 'off',
    label: 'Like / Comment / Share bar',
    options: [
      {
        value: 'off',
        label: 'Always visible',
        gain: 'nothing is hidden, nothing to learn',
        cost: 'a row of buttons under every post',
      },
      {
        value: 'dim',
        label: 'Fade out until hovered',
        gain: 'nothing ever moves, nothing is ever covered',
        cost: 'the row still takes its space',
      },
      {
        value: 'collapse',
        label: 'Collapse until hovered',
        gain: 'wins the row back',
        cost: 'the post grows as you point at it, shifting the page',
      },
      {
        value: 'cluster',
        label: 'Corner cluster on hover',
        gain: 'wins the row back and nothing ever moves',
        cost: 'covers a corner of the post while it shows',
      },
      {
        value: 'cluster-focus',
        label: 'Corner cluster, keyboard only',
        gain: 'wins the row back; a mouse never summons it at all',
        cost: 'reachable only by tabbing into the post',
      },
      {
        value: 'edge',
        label: 'Full-width bar at the bottom edge',
        gain: 'wins the row back; the familiar bar, only when asked for',
        cost: 'the last line is hard to select, and a touch can hit it unseen',
      },
    ],
    help: 'Every mode keeps the buttons reachable by keyboard. They trade three things against one another: whether the row\u2019s space is won back, whether anything moves as you point at a post, and how much of the post is covered while the actions show.',
  },
  {
    key: 'quiet.composer',
    type: 'boolean',
    default: false,
    label: 'Hide inline comment and reply boxes',
    help:
      'Hides the "Write a comment" and "Write a reply" boxes. Hovering the post '
      + 'or tabbing into the box brings it back.',
  },

  // -- Reading -------------------------------------------------------------
  {
    key: 'reading.enabled',
    type: 'boolean',
    default: false,
    label: 'Reading mode',
    help:
      'One switch for a quiet page: the action bar becomes a corner cluster, comment boxes and '
      + 'copy buttons stay out of sight, translate controls shrink to an icon, promoted cards go, '
      + 'and so does the app bar. Your own settings below are kept and come back when it is off. '
      + 'Press r to switch it.',
  },
  {
    // Named for keeping rather than hiding so its default is the one the
    // preset wants for everybody: a stored "hide the banner: false" written
    // by an older version would otherwise have kept the bar for anyone who
    // had ever changed any setting.
    key: 'reading.keepBanner',
    type: 'boolean',
    default: false,
    label: 'Keep the app bar in reading mode',
    help: 'Reading mode hides the sticky bar at the top. Search, the app launcher and the account menu go with it; keep it if you need those while reading.',
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
    key: 'copy.includeOriginal',
    type: 'boolean',
    default: false,
    label: 'Include the original under translated posts',
    help: 'Copied translations are always marked as such. With this on, the text as its author wrote it follows, so whoever reads the copy can check the translation. Doubles the length of those posts.',
  },
  {
    key: 'copy.showButtons',
    type: 'select',
    default: 'hover',
    label: 'Copy buttons on posts',
    options: [
      {
        value: 'hover',
        label: 'Show when I point at a post',
        gain: 'the only visible sign that copying exists',
        cost: 'one more thing moving as you read',
      },
      {
        value: 'focus',
        label: 'Show only when I tab into a post',
        gain: 'nothing appears while reading with a mouse',
        cost: 'invisible unless you use the keyboard',
      },
      {
        value: 'off',
        label: 'Never \u2014 use the keyboard',
        gain: 'nothing is added to a post at all',
        cost: 'copying is only c, y and the manager\u2019s menu',
      },
    ],
    help: 'These buttons are this script\u2019s own addition \u2014 Engage has nothing like them. c copies the focused thread and y copies a link to it whichever setting you pick, so turning them off loses no ability, only the reminder that it is there.',
  },
  {
    key: 'copy.chipCorner',
    type: 'select',
    default: 'top-right',
    label: 'Where the copy buttons sit',
    options: [
      {
        value: 'top-right',
        label: 'Top right',
        gain: 'out of the way of the post body',
        cost: 'shares the corner Engage puts reactions in',
      },
      {
        value: 'top-left',
        label: 'Top left',
        gain: 'clear of the reactions and of the action bar',
        cost: 'sits near the author name and avatar',
      },
      {
        value: 'bottom-left',
        label: 'Bottom left',
        gain: 'clear of reactions, author and the corner cluster',
        cost: 'closest to the post body, so it can cover the last line',
      },
      {
        value: 'bottom-right',
        label: 'Bottom right',
        gain: 'furthest from everything Engage draws at the top',
        cost: 'collides with the action bar\u2019s corner cluster, if you use it',
      },
    ],
    help: 'Engage draws its own controls in the corners of a post \u2014 reactions in one, the action bar along the bottom \u2014 and which corner is free differs between tenants and layouts. Move the buttons to whichever one is clear for you.',
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
    default: [],
    label: 'Additional interface languages',
    options: languageOptions,
    help: 'Threadcalm reads your Engage language from the page and uses its labels automatically. Add a language here only if your page mixes several, or if controls are not found.',
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
/**
 * Rewrites a stored value whose shape has changed since it was written.
 *
 * Without this, a setting that grows from a switch into a choice silently
 * reverts everyone to its default, which is the opposite of what they asked
 * for. Keyed by the old shape rather than by a version number, so it stays
 * correct however old the stored settings are.
 */
function migrate(key, value) {
  // copy.showButtons was a boolean before it offered "only on focus".
  if (key === 'copy.showButtons' && typeof value === 'boolean') {
    return value ? 'hover' : 'off';
  }
  return value;
}

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
      if (definition) next[key] = coerce(definition, migrate(key, value));
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
/**
 * Values imposed on top of the reader's own, for as long as something asks.
 *
 * Reading mode works through this rather than by writing settings: switching
 * it off must hand back exactly what the reader had chosen, and it cannot do
 * that if it has overwritten those choices. Overrides are never stored.
 */
let overrides = {};

/** The value in effect: an override if one is imposed, else the reader's own. */
export function get(key) {
  if (!BY_KEY.has(key)) {
    throw new Error(`Unknown setting: ${key}`);
  }
  return Object.hasOwn(overrides, key) ? overrides[key] : current[key];
}

/** The reader's own value, ignoring overrides: what the settings sheet shows and edits. */
export function getOwn(key) {
  if (!BY_KEY.has(key)) {
    throw new Error(`Unknown setting: ${key}`);
  }
  return current[key];
}

/** Whether a setting is currently being overridden. */
export function isOverridden(key) {
  return Object.hasOwn(overrides, key);
}

/**
 * Replaces the whole set of overrides.
 *
 * Emits SETTINGS_CHANGED for exactly the keys whose *effective* value moved,
 * so features re-apply only what changed -- and emits nothing when nothing
 * did, which is what keeps a caller that reacts to that event from looping.
 */
export function setOverrides(next) {
  const coerced = {};
  for (const [key, value] of Object.entries(next ?? {})) {
    const definition = BY_KEY.get(key);
    if (definition) coerced[key] = coerce(definition, value);
  }

  const touched = new Set([...Object.keys(overrides), ...Object.keys(coerced)]);
  const before = {};
  for (const key of touched) before[key] = get(key);

  overrides = coerced;

  const changed = {};
  for (const key of touched) {
    const after = get(key);
    if (JSON.stringify(after) !== JSON.stringify(before[key])) changed[key] = after;
  }
  if (Object.keys(changed).length > 0) {
    bus.emit(EVENTS.SETTINGS_CHANGED, { changed, settings: current });
  }
  return changed;
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
