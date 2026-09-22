/**
 * Label packs.
 *
 * These are the *fallback* layer. Reply counters, action rows and menus are
 * recognised structurally and need nothing from here; what remains — reply
 * pagination, "see more", the translation controls and promoted markers — has
 * no structural signal, so it is matched on what the UI *says*.
 *
 * That part is locale-bound, so labels live here as data: adding a language is
 * a pull request against this file, and a user can add patterns from the
 * settings panel without editing code at all.
 *
 * English, German and French have been checked against a live tenant. Spanish,
 * Dutch and Italian are offered as a starting point and have not been, so
 * corrections to them are especially welcome.
 *
 * Patterns are stored as strings rather than literals so they can round-trip
 * through settings storage and be merged with user-supplied ones.
 */

/**
 * @typedef {object} LabelPack
 * @property {string} name             human-readable language name
 * @property {string} replyCount       matches a bare reply counter, e.g. "3 replies"
 * @property {string[]} expandReplies  reply-pagination controls
 * @property {string[]} expandText     "read the rest of this post" controls
 * @property {string[]} translate      "show translation" controls
 * @property {string[]} showOriginal   the inverse control, once translated
 * @property {string[]} promoted       markers of suggested/sponsored content
 * @property {string[]} menu           controls that must never be auto-clicked
 */

/** @type {Record<string, LabelPack>} */
export const LABEL_PACKS = {
  en: {
    name: 'English',
    replyCount: '^(\\d+)\\s+(?:repl(?:y|ies)|comments?|responses?)$',
    expandReplies: [
      '(?:show|view|load|see|read)\\s+(?:\\d+\\s+)?(?:more|all|previous|earlier|next|older|additional)\\s+(?:repl(?:y|ies)|responses?|comments?)',
      '(?:more|view all)\\s+(?:repl(?:y|ies)|responses?|comments?)',
      '^\\d+\\s+previous\\s+(?:repl(?:y|ies)|comments?)$',
    ],
    expandText: ['^see\\s+more$', '^show\\s+more$', '^read\\s+more$', '^\\.\\.\\.\\s*more$'],
    translate: [
      '^(?:show\\s+)?translat(?:e|ion)(?:\\s+this\\s+post)?$',
      '^translate\\s+post$',
      '^see\\s+translation$',
    ],
    showOriginal: ['^(?:show|see)\\s+original(?:\\s+post)?$', '^undo\\s+translation$'],
    promoted: [
      '^promoted$',
      '^sponsored$',
      '^suggested(?:\\s+for\\s+you)?$',
      '^people\\s+you\\s+may\\s+know$',
      '^discover\\s+communities$',
    ],
    menu: ['more options', 'more actions', 'post actions', 'overflow', 'ellipsis', 'menu', 'settings'],
  },

  de: {
    name: 'Deutsch',
    replyCount: '^(\\d+)\\s+(?:Antwort(?:en)?|Kommentare?)$',
    expandReplies: [
      '(?:weitere|mehr|alle|ältere|vorherige)\\s+(?:Antworten|Kommentare)(?:\\s+(?:anzeigen|laden))?',
      '(?:Antworten|Kommentare)\\s+(?:anzeigen|laden)',
      '^\\d+\\s+(?:weitere|vorherige)\\s+(?:Antwort(?:en)?|Kommentare?)$',
    ],
    expandText: ['^mehr\\s+anzeigen$', '^weiterlesen$', '^mehr$'],
    translate: [
      '^Übersetzung\\s+anzeigen$',
      '^übersetzen$',
      '^Beitrag\\s+übersetzen$',
    ],
    showOriginal: ['^Original\\s+anzeigen$', '^Übersetzung\\s+rückgängig'],
    promoted: ['^gesponsert$', '^beworben$', '^vorgeschlagen$', '^vorschläge\\s+für\\s+dich$'],
    menu: ['weitere optionen', 'mehr optionen', 'weitere aktionen', 'menü', 'einstellungen'],
  },

  fr: {
    name: 'Français',
    replyCount: '^(\\d+)\\s+(?:réponses?|commentaires?)$',
    expandReplies: [
      '(?:afficher|voir|charger)\\s+(?:les\\s+)?(?:\\d+\\s+)?(?:autres?|plus\\s+de|anciennes?|précédentes?)\\s+(?:réponses?|commentaires?)',
      '(?:afficher|voir)\\s+(?:toutes\\s+les\\s+)?réponses',
      // French puts the adjective after the noun: "les réponses précédentes".
      '(?:afficher|voir|charger)\\s+(?:les\\s+)?(?:réponses?|commentaires?)\\s+(?:précédent(?:e|es)?|antérieur(?:e|es)?|plus\\s+ancien(?:ne|nes)?)',
    ],
    expandText: ['^voir\\s+plus$', '^afficher\\s+plus$', '^lire\\s+la\\s+suite$'],
    translate: ['^(?:afficher\\s+la\\s+)?traduction$', '^traduire(?:\\s+la\\s+publication)?$'],
    showOriginal: ['^(?:afficher|voir)\\s+l[’\']original$'],
    promoted: ['^sponsorisé$', '^promu$', '^suggéré$'],
    menu: ['plus d’options', 'plus d\'options', 'autres actions', 'menu', 'paramètres'],
  },

  es: {
    name: 'Español',
    replyCount: '^(\\d+)\\s+(?:respuestas?|comentarios?)$',
    expandReplies: [
      '(?:ver|mostrar|cargar)\\s+(?:\\d+\\s+)?(?:más|todas\\s+las|anteriores)\\s+(?:respuestas?|comentarios?)',
      '(?:respuestas?|comentarios?)\\s+(?:anteriores|más)',
    ],
    expandText: ['^ver\\s+más$', '^mostrar\\s+más$', '^leer\\s+más$'],
    translate: ['^(?:mostrar\\s+)?traducción$', '^traducir(?:\\s+publicación)?$'],
    showOriginal: ['^(?:mostrar|ver)\\s+original$'],
    promoted: ['^patrocinado$', '^promocionado$', '^sugerido$'],
    menu: ['más opciones', 'más acciones', 'menú', 'configuración'],
  },

  nl: {
    name: 'Nederlands',
    replyCount: '^(\\d+)\\s+(?:reacties?|antwoord(?:en)?|opmerkingen?)$',
    expandReplies: [
      '(?:meer|alle|vorige|oudere)\\s+(?:reacties|antwoorden|opmerkingen)(?:\\s+(?:weergeven|tonen|laden))?',
      '(?:reacties|antwoorden)\\s+(?:weergeven|tonen|laden)',
    ],
    expandText: ['^meer\\s+weergeven$', '^meer\\s+tonen$', '^lees\\s+meer$'],
    translate: ['^vertaling\\s+weergeven$', '^vertalen$'],
    showOriginal: ['^origineel\\s+weergeven$'],
    promoted: ['^gesponsord$', '^voorgesteld$'],
    menu: ['meer opties', 'meer acties', 'menu', 'instellingen'],
  },

  it: {
    name: 'Italiano',
    replyCount: '^(\\d+)\\s+(?:rispost[ae]|commenti?)$',
    expandReplies: [
      '(?:mostra|visualizza|carica)\\s+(?:\\d+\\s+)?(?:altre|tutte\\s+le|precedenti)\\s+(?:risposte|commenti)',
      '(?:risposte|commenti)\\s+precedenti',
    ],
    expandText: ['^mostra\\s+(?:di\\s+)?più$', '^leggi\\s+tutto$'],
    translate: ['^(?:mostra\\s+)?traduzione$', '^traduci(?:\\s+post)?$'],
    showOriginal: ['^mostra\\s+originale$'],
    promoted: ['^sponsorizzato$', '^suggerito$'],
    menu: ['altre opzioni', 'altre azioni', 'menù', 'impostazioni'],
  },
};

export const AVAILABLE_LANGUAGES = Object.keys(LABEL_PACKS);

/** Human-readable names, for the settings panel. */
export const LANGUAGE_NAMES = Object.fromEntries(
  Object.entries(LABEL_PACKS).map(([code, pack]) => [code, pack.name]),
);

/**
 * Compiles pattern strings into one case-insensitive RegExp.
 * Invalid patterns are dropped rather than thrown: a typo in a user-supplied
 * pattern must not be able to disable every matcher in the script.
 */
function compile(patterns) {
  const usable = patterns.filter((pattern) => {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  });
  if (usable.length === 0) return null;
  return new RegExp(usable.map((pattern) => `(?:${pattern})`).join('|'), 'i');
}

/**
 * Builds the matcher set the features use.
 *
 * @param {string[]} languages active language codes
 * @param {Record<string, string[]>} [custom] extra user patterns, keyed by field
 */
export function buildMatchers(languages, custom = {}) {
  const active = (languages ?? []).filter((code) => code in LABEL_PACKS);
  // Never end up with no matchers at all: an empty selection falls back to English.
  const codes = active.length > 0 ? active : ['en'];
  const packs = codes.map((code) => LABEL_PACKS[code]);

  const collect = (field) => [
    ...packs.flatMap((pack) => pack[field] ?? []),
    ...(custom?.[field] ?? []),
  ];

  return {
    languages: codes,
    replyCount: compile(packs.map((pack) => pack.replyCount)),
    expandReplies: compile(collect('expandReplies')),
    expandText: compile(collect('expandText')),
    translate: compile(collect('translate')),
    showOriginal: compile(collect('showOriginal')),
    promoted: compile(collect('promoted')),
    menu: compile(collect('menu')),
  };
}
