/**
 * Taming the per-post "Show translation" control.
 *
 * Engage puts a full-width text control under every post that it believes
 * might need translating, which in a multilingual tenant means nearly all of
 * them. It is the single noisiest piece of chrome in the feed.
 *
 * Strategy, in one sentence: never touch the DOM of the control, only tag it
 * and let CSS do the work.
 *
 * That matters. Removing or rewriting a React-owned node invites the next
 * render to put it back, or worse, to throw. Adding one class to an element
 * React does not track is inert — React re-renders the element's contents,
 * not its className soup, and even if it did the next scan re-tags it.
 *
 * Modes:
 *   compact  the label collapses to a small glyph, and expands again on hover
 *            or keyboard focus, so the feature is still reachable
 *   known    compact, plus fully hidden when the post is confidently in a
 *            language the reader listed as one they read
 *   hide     always hidden
 *   off      left exactly as Engage rendered it
 *
 * "Show original" is only ever compacted, never hidden: hiding the way back
 * out of a translation would strand the reader.
 */
import { POST_SELECTOR, accessibleTexts, closestPost, debounce, visibleText } from '../core/dom.js';
import { detectLanguage } from '../core/language.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';

export const COMPACT_CLASS = 'tc-translate-compact';
export const HIDDEN_CLASS = 'tc-translate-hidden';
/** Applied to a wrapper that holds nothing but the control. */
export const ROW_CLASS = 'tc-translate-row';
export const ROW_HIDDEN_CLASS = 'tc-translate-row-hidden';
const MARKER = 'tcTranslate';

/** Labels are short; anything longer is prose that merely contains the word. */
const MAX_LABEL_LENGTH = 40;

export function createTranslateTamer({ matchers }) {
  let active = matchers;

  // Language detection is the only non-trivial cost in this module, so its
  // result is cached per post element rather than per control.
  const languageCache = new WeakMap();

  function detectFor(article) {
    if (!article) return { language: null, confidence: 0 };
    const cached = languageCache.get(article);
    if (cached) return cached;

    // The article's own text minus nested replies: a reply in another
    // language must not decide the parent's translate control.
    const clone = article.cloneNode(true);
    for (const nested of clone.querySelectorAll(POST_SELECTOR)) nested.remove();
    const result = detectLanguage(visibleText(clone));

    languageCache.set(article, result);
    return result;
  }

  /** @returns {'translate'|'original'|null} */
  function classify(element) {
    const texts = accessibleTexts(element).filter((text) => text.length <= MAX_LABEL_LENGTH);
    if (texts.length === 0) return null;
    if (active.showOriginal && texts.some((text) => active.showOriginal.test(text))) {
      return 'original';
    }
    if (active.translate && texts.some((text) => active.translate.test(text))) {
      return 'translate';
    }
    return null;
  }

  /**
   * The wrapper that exists only to hold this control.
   *
   * Shrinking the control is not enough to win back vertical space: Engage
   * usually gives the translate link a row of its own, and that row keeps its
   * padding and min-height whatever we do to the child. So when a parent has
   * no other element children, it is treated as belonging to the control and
   * collapsed with it.
   *
   * The "no other element children" test is what keeps this safe — a wrapper
   * shared with other actions is left alone.
   */
  function rowHost(element) {
    const parent = element.parentElement;
    if (!parent || parent === document.body) return null;
    const siblings = [...parent.children].filter((child) => child !== element);
    return siblings.length === 0 ? parent : null;
  }

  /** Applies exactly one of the two states, to the control and to its row. */
  function apply(element, { compact, hidden }) {
    element.classList.toggle(COMPACT_CLASS, compact && !hidden);
    element.classList.toggle(HIDDEN_CLASS, hidden);

    const host = rowHost(element);
    if (host) {
      host.classList.toggle(ROW_CLASS, compact && !hidden);
      host.classList.toggle(ROW_HIDDEN_CLASS, hidden);
    }

    if (compact && !hidden && !element.hasAttribute('data-tc-title')) {
      // Preserve a hover hint, since the visible label is about to shrink.
      const label = accessibleTexts(element)[0];
      if (label) element.setAttribute('data-tc-title', label);
      if (!element.getAttribute('title') && label) element.setAttribute('title', label);
    }
  }

  function clear(element) {
    // Also handles being called on a wrapper picked up by the teardown query.
    element.classList.remove(COMPACT_CLASS, HIDDEN_CLASS, ROW_CLASS, ROW_HIDDEN_CLASS);
    delete element.dataset[MARKER];
    const host = rowHost(element);
    if (host) host.classList.remove(ROW_CLASS, ROW_HIDDEN_CLASS);
  }

  function sweep(root = document) {
    const mode = settings.get('translate.mode');
    const selector = 'button, [role="button"], a, [tabindex="0"], span';

    let compacted = 0;
    let hidden = 0;

    for (const element of root.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement)) continue;

      const kind = classify(element);
      if (!kind) {
        // An element may stop being a translate control after a re-render.
        if (element.dataset[MARKER]) clear(element);
        continue;
      }

      if (mode === 'off') {
        clear(element);
        continue;
      }

      element.dataset[MARKER] = kind;

      if (kind === 'original') {
        apply(element, { compact: true, hidden: false });
        compacted += 1;
        continue;
      }

      let shouldHide = mode === 'hide';
      if (mode === 'known') {
        const known = settings.get('translate.knownLanguages');
        const minConfidence = settings.get('translate.minConfidence');
        const { language, confidence } = detectFor(closestPost(element));
        // Unknown or low-confidence text keeps its control: a missing
        // translate button on an unreadable post is the worse error.
        shouldHide =
          Boolean(language) && confidence >= minConfidence && known.includes(language);
      }

      apply(element, { compact: true, hidden: shouldHide });
      if (shouldHide) hidden += 1;
      else compacted += 1;
    }

    if (compacted || hidden) {
      log.debug(`translate controls: ${compacted} compacted, ${hidden} hidden`);
    }
    return { compacted, hidden };
  }

  const scheduleSweep = debounce(() => sweep(), 200);

  return {
    start() {
      sweep();
    },

    stop() {
      scheduleSweep.cancel();
      for (const element of document.querySelectorAll(`.${COMPACT_CLASS}, .${HIDDEN_CLASS}, .${ROW_CLASS}, .${ROW_HIDDEN_CLASS}`)) {
        clear(element);
      }
    },

    onDomChanged() {
      scheduleSweep();
    },

    onNavigate() {
      scheduleSweep();
    },

    onSettingsChanged() {
      // Mode or language changes invalidate every previous decision.
      for (const element of document.querySelectorAll(`.${COMPACT_CLASS}, .${HIDDEN_CLASS}, .${ROW_CLASS}, .${ROW_HIDDEN_CLASS}`)) {
        clear(element);
      }
      sweep();
    },

    setMatchers(next) {
      active = next;
      scheduleSweep();
    },

    sweep,
  };
}
