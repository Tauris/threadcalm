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
 * English, German and French were checked against a live tenant first. The
 * labels observed in all of Engage's 41 interface languages are merged in
 * below the hand-written packs (see OBSERVED).
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

/**
 * What may follow "Show original": the source language in brackets, as Engage
 * appends it -- "(Japanese)" -- or, in Arabic, empty brackets.
 */
const ORIGINAL_SUFFIX = '(?:\\s*\\([^)]*\\))?$';

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
    showOriginal: ['^(?:show|see)\\s+original(?:\\s+post)?(?:\\s*\\([^)]*\\))?$', '^undo\\s+translation$'],
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
    showOriginal: ['^Original\\s+anzeigen(?:\\s*\\([^)]*\\))?$', '^Übersetzung\\s+rückgängig'],
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
    showOriginal: ['^(?:afficher|voir)\\s+l[’\']original(?:\\s*\\([^)]*\\))?$'],
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
    showOriginal: ['^(?:mostrar|ver)\\s+original(?:\\s*\\([^)]*\\))?$'],
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
    showOriginal: ['^origineel\\s+weergeven(?:\\s*\\([^)]*\\))?$'],
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
    showOriginal: ['^mostra\\s+originale(?:\\s*\\([^)]*\\))?$'],
    promoted: ['^sponsorizzato$', '^suggerito$'],
    menu: ['altre opzioni', 'altre azioni', 'menù', 'impostazioni'],
  },
};

/**
 * Labels observed on a live Engage page in every interface language Engage
 * offers (41 locale entries, 36 languages), September 2026: the in-post
 * "see more" and "Show translation" of one post, read in each language in
 * turn, plus "Show original" and reply pagination where they were seen.
 *
 * These make the text layer complete for Engage's own language list. The
 * translation control and "see more" are also recognised structurally (see
 * dom.js), so a label missing or reworded here degrades to that, not to
 * nothing.
 *
 * Regional variants share a pack: pt-br and pt-pt are `pt`, zh-cn and zh-tw
 * are `zh`, sr-latn-rs is `sr`.
 */
const OBSERVED = {
  ar: { name: 'العربية', seeMore: ['إظهار المزيد'], translate: ['إظهار الترجمة'], original: ['إظهار النسخة الأصلية'],
    // "Show 1 previous comment", with Arabic-Indic digits.
    pagination: ['^إظهار\\s+[0-9٠-٩]+\\s+تعليق(?:ات)?\\s+ساب'] },
  bg: { name: 'Български', seeMore: ['вижте повече'], translate: ['Показване на превод'], original: ['Показване на оригинала'] },
  ca: { name: 'Català', seeMore: ['mostra més'], translate: ['Mostra la traducció'] },
  cs: { name: 'Čeština', seeMore: ['zobrazit více'], translate: ['Zobrazit překlad'] },
  da: { name: 'Dansk', seeMore: ['se mere'], translate: ['Vis oversættelse'] },
  de: { seeMore: ['Mehr anzeigen'], translate: ['Übersetzung anzeigen'] },
  el: { name: 'Ελληνικά', seeMore: ['εμφάνιση περισσότερων'], translate: ['Εμφάνιση μετάφρασης'] },
  en: { seeMore: ['see more'], translate: ['Show translation'], original: ['Show original'] },
  es: { seeMore: ['ver más'], translate: ['Mostrar traducción'] },
  et: { name: 'Eesti', seeMore: ['kuva rohkem'], translate: ['Kuva tõlge'] },
  fi: { name: 'Suomi', seeMore: ['näytä enemmän'], translate: ['Näytä käännös'] },
  fr: { seeMore: ['afficher plus'], translate: ['Afficher la traduction'] },
  he: { name: 'עברית', seeMore: ['הצג עוד'], translate: ['הצג תרגום'] },
  hr: { name: 'Hrvatski', seeMore: ['prikaži više'], translate: ['Prikaži prijevod'] },
  hu: { name: 'Magyar', seeMore: ['Kibontás'], translate: ['Fordítás megjelenítése'] },
  id: { name: 'Bahasa Indonesia', seeMore: ['lihat selengkapnya'], translate: ['Perlihatkan terjemahan'] },
  it: { seeMore: ['vedi altro'], translate: ['Mostra traduzione'] },
  ja: { name: '日本語', seeMore: ['詳細を表示'], translate: ['翻訳を表示'], original: ['原文を表示'] },
  ko: { name: '한국어', seeMore: ['더 보기'], translate: ['번역 표시'] },
  lt: { name: 'Lietuvių', seeMore: ['žr. daugiau'], translate: ['Rodyti vertimą'] },
  lv: { name: 'Latviešu', seeMore: ['skatīt vairāk'], translate: ['Rādīt tulkojumu'] },
  nb: { name: 'Norsk bokmål', seeMore: ['se mer'], translate: ['Vis oversettelse'] },
  nl: { seeMore: ['meer weergeven'], translate: ['Vertaling weergeven'] },
  pl: { name: 'Polski', seeMore: ['zobacz więcej'], translate: ['Pokaż tłumaczenie'] },
  pt: { name: 'Português', seeMore: ['ver mais'], translate: ['Mostrar tradução', 'Exibir tradução'], original: ['Exibir original'] },
  ro: { name: 'Română', seeMore: ['vedeți mai multe'], translate: ['Afișează traducerea'] },
  ru: { name: 'Русский', seeMore: ['Показать больше'], translate: ['Показать перевод'], original: ['Показать оригинал'] },
  sk: { name: 'Slovenčina', seeMore: ['zobraziť viac'], translate: ['Zobraziť preklad'] },
  sl: { name: 'Slovenščina', seeMore: ['pokaži več'], translate: ['Pokaži prevod'] },
  sr: { name: 'Srpski', seeMore: ['pogledajte više'], translate: ['Prikaži prevod'] },
  sv: { name: 'Svenska', seeMore: ['visa mer'], translate: ['Visa översättning'] },
  th: { name: 'ไทย', seeMore: ['ดูเพิ่มเติม'], translate: ['แสดงคำแปล'] },
  tr: { name: 'Türkçe', seeMore: ['daha fazla göster'], translate: ['Çeviriyi göster'] },
  uk: { name: 'Українська', seeMore: ['показати більше'], translate: ['Показати переклад'] },
  vi: { name: 'Tiếng Việt', seeMore: ['xem thêm'], translate: ['Hiển thị bản dịch'] },
  zh: { name: '中文', seeMore: ['查看更多'], translate: ['显示翻译', '顯示翻譯'] },
};

/** A whole label as a pattern: anchored, any run of spaces allowed. */
function phrase(text) {
  return `^${text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}$`;
}

/**
 * The same, allowing the source language Engage appends in brackets:
 * "Show original (Japanese)", and in Arabic an empty "()".
 */
function originalPhrase(text) {
  return phrase(text).replace(/\$$/, () => ORIGINAL_SUFFIX);
}

for (const [code, observed] of Object.entries(OBSERVED)) {
  const pack = (LABEL_PACKS[code] ??= {
    name: observed.name,
    replyCount: null,
    expandReplies: [],
    expandText: [],
    translate: [],
    showOriginal: [],
    promoted: [],
    menu: [],
  });
  pack.expandText.push(...(observed.seeMore ?? []).map(phrase));
  pack.translate.push(...(observed.translate ?? []).map(phrase));
  pack.showOriginal.push(...(observed.original ?? []).map(originalPhrase));
  pack.expandReplies.push(...(observed.pagination ?? []));
}

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
    // A missing pattern must not become an empty one, which matches anything.
    if (typeof pattern !== 'string' || pattern === '') return false;
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
 * Engage's interface language, as a bare code ("de"), or null if the page
 * does not say.
 *
 * Engage sets `<html lang>` from the reader's own Engage language setting
 * ("de-de", "ja-jp"), independently of the browser's languages -- checked
 * across six locales. So the right label set can be chosen without asking.
 */
export function pageLanguage(doc = globalThis.document) {
  const raw = doc?.documentElement?.lang?.trim().toLowerCase() ?? '';
  return raw ? raw.split(/[-_]/)[0] : null;
}

/**
 * The label sets to use: the page's own, then any the reader added.
 *
 * `supported` is false when the page names a language there is no label set
 * for -- the case where the label-bound features quietly find nothing, and
 * the reader deserves to be told.
 *
 * @param {string|null} page
 * @param {string[]} [extra]
 */
export function resolveLanguages(page, extra = []) {
  const codes = [];
  if (page && page in LABEL_PACKS) codes.push(page);
  for (const code of extra ?? []) {
    if (code in LABEL_PACKS && !codes.includes(code)) codes.push(code);
  }
  return { codes, page, supported: !page || page in LABEL_PACKS };
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
