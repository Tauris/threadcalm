/**
 * Very small stop-word language guesser.
 *
 * This exists for one job: deciding whether a post is already written in a
 * language the reader understands, so its "Show translation" control can be
 * hidden instead of merely shrunk. It is not a general-purpose detector and
 * deliberately does not try to be one — no n-gram tables, no model, no network.
 *
 * Cost is one lowercase pass plus a set lookup per word, over at most
 * `MAX_WORDS` words, which is negligible next to Engage's own rendering.
 *
 * Accuracy expectations: reliable on a paragraph of prose, unreliable on a
 * six-word post. Callers must respect `confidence` and fall back to showing
 * the control when the guess is weak — a hidden translate button on a post the
 * reader cannot read is a worse failure than a visible one they do not need.
 */

/**
 * Function words, which dominate ordinary prose in every supported language.
 * Words that are ambiguous across these languages ("a", "no", "in", "die")
 * still earn points for several languages at once, which is fine: the winner
 * is decided by the margin, not by absolute counts.
 */
const STOP_WORDS = {
  en: 'the and to of a in is it you that for on with as are this be have not but they we his her from will can all was would there what about which when your more has our who if out so up one time them some'.split(' '),
  de: 'der die das und ist nicht ich sie es ein eine zu den von mit auf für im dem auch wir aber oder wenn wird werden dass noch nur schon sich sind hat haben kann man bei nach aus über durch sehr wie was dies diese dieser alle'.split(' '),
  fr: 'le la les des une un et est pour dans que qui pas sur avec plus par ce cette nous vous ils elle au aux du en ne se sont mais ou comme tout tous faire fait bien peut tres être sans leur notre votre'.split(' '),
  es: 'el la los las una uno de que en por para con no se es un su lo como mas pero sus le ya este esta esto todo tambien hay son han sido muy sin sobre entre cuando donde nuestro'.split(' '),
  it: 'il lo la gli le di che e un una per non con sono come anche alla dei delle nel della ma piu questo questa sono essere fare hanno stato molto senza tra quando dove nostro vostro'.split(' '),
  nl: 'de het een en van is dat in te niet op voor met zijn aan er maar ook als om door dit deze worden wordt heeft hebben kan naar bij over wat hoe wanneer waar onze jullie nog wel'.split(' '),
  pt: 'de que nao uma para com dos das por mais como mas foi ele sua ou ser quando muito nos ja esta seu pela ate isso entre depois sem mesmo aos seus quem nas'.split(' '),
  da: 'og det er en til at den de for med han af ikke der var som men om vi har kan skal vil fra ved eller nar hvor hvad denne dette deres'.split(' '),
  sv: 'och det ar en till att den de for med han av inte som men om vi har kan ska vill fran vid eller nar var vad denna detta deras'.split(' '),
  pl: 'nie to jest sie na w z do co jak ale ten ta te tego dla po tylko juz czy bardzo jeszcze przez przy oraz gdy gdzie kiedy nasz wasz'.split(' '),
};

/** Pre-built lookup sets, so detection is O(words) rather than O(words x list). */
const WORD_SETS = Object.fromEntries(
  Object.entries(STOP_WORDS).map(([code, words]) => [code, new Set(words)]),
);

const SCRIPT_LANGUAGES = ['ja', 'zh', 'ko', 'el', 'th', 'hy', 'ka'];

export const DETECTABLE_LANGUAGES = [...Object.keys(STOP_WORDS), ...SCRIPT_LANGUAGES];

/** Enough words to judge prose; more adds cost without adding certainty. */
const MAX_WORDS = 120;

/** Below this, any result is noise, so we report "unknown" instead. */
const MIN_WORDS = 8;

/**
 * Strips accents so "más" matches the ASCII stop-word list, and drops
 * everything that is not a letter or space (URLs, @mentions, emoji, markup).
 */
function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-zß\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

/**
 * How much of a distinctive script makes a post count as that language,
 * however much else it contains. Absolute amounts, not shares: a Japanese post
 * that quotes a paragraph of English is still a Japanese post -- to its
 * author, and to a reader who does not read Japanese -- but a share of letters
 * would call it English, because one kanji carries as much as a whole Latin
 * word. The amounts are about a short sentence, so a single borrowed word in
 * an English post does not flip it.
 */
const SCRIPT_MINIMUMS = {
  // Kana in any Japanese sentence (particles, endings), plus enough in all.
  jaKana: 3,
  jaTotal: 6,
  // Han without kana is Chinese or kanji-only Japanese; see detectScriptLanguage.
  han: 8,
};

const SCRIPTS = [
  ['ko', /\p{Script=Hangul}/gu, 6],
  ['th', /\p{Script=Thai}/gu, 15],
  ['el', /\p{Script=Greek}/gu, 20],
  ['hy', /\p{Script=Armenian}/gu, 20],
  ['ka', /\p{Script=Georgian}/gu, 20],
];

/**
 * Languages with a distinctive writing system. Runs before the stop-word
 * count and takes precedence over it: a post written in one of these is that
 * language even when it quotes plenty of English.
 */
function detectScriptLanguage(text) {
  const letters = countMatches(text, /\p{L}/gu);
  if (letters === 0) return null;

  const kana = countMatches(text, /\p{Script=Hiragana}|\p{Script=Katakana}/gu);
  const han = countMatches(text, /\p{Script=Han}/gu);
  if (kana >= SCRIPT_MINIMUMS.jaKana && kana + han >= SCRIPT_MINIMUMS.jaTotal) {
    return { language: 'ja', confidence: 0.95, words: kana + han };
  }

  // Han is shared by Chinese and Japanese; keep that ambiguity, so readers of
  // either are not auto-translated. Its confidence stays below the default
  // threshold unless Han dominates, so a mixed post keeps its control.
  if (han >= SCRIPT_MINIMUMS.han) {
    return { language: 'zh', confidence: han / letters >= 0.5 ? 0.7 : 0.45, words: han, ambiguous: true };
  }

  for (const [language, pattern, minimum] of SCRIPTS) {
    const count = countMatches(text, pattern);
    if (count >= minimum) return { language, confidence: 0.95, words: count };
  }
  return null;
}

/**
 * Guesses the language of a block of text.
 *
 * @param {string} text
 * @returns {{ language: string|null, confidence: number, words: number }}
 *   `confidence` is the winner's share of all stop-word hits, scaled by how
 *   much of the text consisted of recognised function words. 0 when unknown.
 */
export function detectLanguage(text) {
  const scriptResult = detectScriptLanguage(String(text ?? ''));
  if (scriptResult) return scriptResult;

  const words = tokenize(text).slice(0, MAX_WORDS);
  if (words.length < MIN_WORDS) {
    return { language: null, confidence: 0, words: words.length };
  }

  /** @type {Record<string, number>} */
  const scores = {};
  let hits = 0;
  for (const word of words) {
    for (const [code, set] of Object.entries(WORD_SETS)) {
      if (set.has(word)) {
        scores[code] = (scores[code] ?? 0) + 1;
        hits += 1;
      }
    }
  }
  if (hits === 0) {
    return { language: null, confidence: 0, words: words.length };
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [language, topScore] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;

  // Two signals must both hold for a confident answer: the winner has to beat
  // its closest rival, and enough of the text has to be recognised function
  // words at all (otherwise a two-hit match on a long post would count).
  const margin = (topScore - runnerUp) / topScore;
  const density = Math.min(1, topScore / Math.max(1, words.length * 0.18));
  const confidence = Number((margin * 0.5 + density * 0.5).toFixed(3));

  return { language, confidence, words: words.length };
}

/**
 * Convenience wrapper: is this text confidently in one of the reader's languages?
 *
 * @param {string} text
 * @param {string[]} knownLanguages
 * @param {number} [minConfidence]
 */
export function isKnownLanguage(text, knownLanguages, minConfidence = 0.55) {
  if (!Array.isArray(knownLanguages) || knownLanguages.length === 0) return false;
  const { language, confidence } = detectLanguage(text);
  return Boolean(language) && confidence >= minConfidence && knownLanguages.includes(language);
}
