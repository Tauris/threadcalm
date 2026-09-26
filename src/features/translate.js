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
 * "Show original" is never compacted or hidden. It is the way back out of a
 * translation, and its label ("Show original (Japanese)") is the only sign
 * that the text in front of the reader is not what the author wrote.
 *
 * Automatic translation (translate.autoWhenVisible) is separate from the
 * modes: it clicks Engage's own control once per post, when that post has
 * been on screen for a moment and is confidently in a language the reader
 * does not read. Posts scrolled past, or never reached, are left alone.
 * Switching it off stops it at once, and so does pausing expansion: that is
 * the off switch people reach for first when the script does too much.
 *
 * Copying a thread is the one exception to "only what is on screen": the
 * reader has asked for the whole conversation, so translateForCopy works
 * through every post in it, under the same rules otherwise.
 */
import { EVENTS, bus } from '../core/bus.js';
import {
  POST_SELECTOR,
  accessibleTexts,
  closestPost,
  debounce,
  isTranslationLinkButton,
  visibleText,
} from '../core/dom.js';
import { detectLanguage } from '../core/language.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { extractBody } from './thread.js';

export const COMPACT_CLASS = 'tc-translate-compact';
export const HIDDEN_CLASS = 'tc-translate-hidden';
/** Applied to a wrapper that holds nothing but the control. */
export const ROW_CLASS = 'tc-translate-row';
export const ROW_HIDDEN_CLASS = 'tc-translate-row-hidden';
const MARKER = 'tcTranslate';

/** Labels are short; anything longer is prose that merely contains the word. */
const MAX_LABEL_LENGTH = 40;

/**
 * How long a post must stay on screen before it is translated. Scrolling
 * through a feed passes over posts nobody reads; they are left alone.
 */
export const TRANSLATE_DWELL_MS = 500;

/**
 * Minimum gap between automatic translations. A feed can bring several
 * foreign posts into view at once; each click is a request to Engage's
 * translation service, so they go one at a time rather than in a burst.
 */
export const TRANSLATE_SPACING_MS = 400;

/** How long to wait for Engage to show a translation before copying without it. */
export const TRANSLATE_TIMEOUT_MS = 8000;

/** A copy translates at most this many posts; the rest are copied as written. */
export const MAX_COPY_TRANSLATIONS = 40;

const POLL_MS = 100;

/** Elements that can be a translate control; the same net the sweep casts. */
const CONTROL_SELECTOR = 'button, [role="button"], a, [tabindex="0"], span';

/** "Show original (Japanese)", in any language: a label ending in brackets. */
const ORIGINAL_STATE = /\([^()]*\)\s*$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createTranslateTamer({ matchers, IntersectionObserverImpl = globalThis.IntersectionObserver }) {
  let active = matchers;
  let observer = null;
  // What is observed is the post, not its control: the control sits at the
  // bottom, and a long post is on screen well before its control is.
  // Post (or a lone control) -> its current "Show translation" control. A Map,
  // not a WeakMap: an IntersectionObserver holds its targets strongly, so
  // posts Engage throws away must be found and unobserved (see prune).
  const watched = new Map();
  // Target -> when it last came on screen. Absent means off screen.
  const onScreenSince = new Map();
  // Keyed by post rather than control: after "Show original", Engage may
  // render a fresh "Show translation", and translating again would override
  // the reader's choice.
  const attempted = new WeakSet();
  const queue = [];
  let queueTimer = null;
  let lastClick = -Infinity;
  let expansionPaused = false;
  let unsubscribeExpand = null;
  // Post -> its text as the author wrote it, taken just before a translation.
  // Engage replaces the body in place, so this is the only record of it.
  const originals = new WeakMap();

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
    clone.querySelectorAll('button, [role="button"], a, time, svg, [aria-hidden="true"]').forEach((node) => node.remove());
    const result = detectLanguage(visibleText(clone));

    languageCache.set(article, result);
    return result;
  }

  /** @returns {'translate'|'original'|null} */
  function classify(element) {
    const texts = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH });
    if (texts.length === 0) return null;
    if (active.showOriginal && texts.some((text) => active.showOriginal.test(text))) {
      return 'original';
    }
    if (active.translate && texts.some((text) => active.translate.test(text))) {
      return 'translate';
    }
    // Wording unknown: recognise the control by where it is, and its state by
    // the source language Engage puts in brackets once a post is translated.
    if (isTranslationLinkButton(element)) {
      return ORIGINAL_STATE.test(texts[0]) ? 'original' : 'translate';
    }
    return null;
  }

  /**
   * Whether Threadcalm should translate this post on the reader's behalf.
   *
   * Only when the language is confidently one the reader does not read. Text
   * too short or too mixed to judge is left alone: translating "Thanks!" costs
   * a request and gains nothing, and the native control is still there.
   * Han-only text may be Chinese or Japanese, so it is translated only for a
   * reader of neither.
   */
  function eligibleForAutoTranslate(element) {
    if (!settings.get('translate.autoWhenVisible')) return false;
    const post = closestPost(element);
    if (post && attempted.has(post)) return false;
    const known = settings.get('translate.knownLanguages');
    const { language, confidence, ambiguous } = detectFor(post);
    if (!language) return false;
    if (ambiguous) return !known.includes('ja') && !known.includes('zh');
    return confidence >= settings.get('translate.minConfidence') && !known.includes(language);
  }

  function unqueue(target) {
    const index = queue.indexOf(target);
    if (index !== -1) queue.splice(index, 1);
  }

  function forget(target) {
    observer?.unobserve(target);
    watched.delete(target);
    onScreenSince.delete(target);
    unqueue(target);
  }

  /** Releases posts Engage has removed since they were observed. */
  function prune() {
    for (const target of [...watched.keys()]) if (!target.isConnected) forget(target);
  }

  function onIntersect(entries) {
    const now = Date.now();
    for (const { target, isIntersecting, intersectionRatio } of entries) {
      if (!watched.has(target)) continue;
      if (isIntersecting && intersectionRatio > 0) {
        if (!onScreenSince.has(target)) onScreenSince.set(target, now);
        if (!queue.includes(target)) queue.push(target);
      } else {
        // Scrolled away before its turn: dropped, and queued again if it
        // comes back.
        onScreenSince.delete(target);
        unqueue(target);
      }
    }
    drain();
  }

  /**
   * Translates queued posts that are still on screen, each once it has been
   * there for TRANSLATE_DWELL_MS, and no two within TRANSLATE_SPACING_MS.
   */
  function drain() {
    if (queueTimer !== null) return;
    // A background tab is not being read; the queue waits for it to return.
    if (document.visibilityState === 'hidden') return;
    while (queue.length > 0) {
      const target = queue[0];
      const since = onScreenSince.get(target);
      if (since === undefined) {
        queue.shift();
        continue;
      }
      const wait = Math.max(lastClick + TRANSLATE_SPACING_MS, since + TRANSLATE_DWELL_MS) - Date.now();
      if (wait > 0) {
        queueTimer = setTimeout(() => {
          queueTimer = null;
          drain();
        }, wait);
        return;
      }
      queue.shift();
      const control = watched.get(target);
      // Checked at click time, not when queued: the control may have been
      // re-rendered, or the reader may have translated the post themselves.
      if (
        !control?.isConnected || control.disabled
        || classify(control) !== 'translate' || !eligibleForAutoTranslate(control)
      ) continue;

      rememberOriginal(closestPost(control));
      attempted.add(target);
      forget(target);
      lastClick = Date.now();
      control.click();
    }
  }

  function clearQueue() {
    clearTimeout(queueTimer);
    queueTimer = null;
    queue.length = 0;
  }

  /**
   * Pausing expansion also switches automatic translation off -- the setting
   * itself, so resuming expansion does not quietly bring translation back.
   */
  function onExpandState({ paused }) {
    const nowPaused = Boolean(paused);
    if (nowPaused && !expansionPaused && settings.get('translate.autoWhenVisible')) {
      settings.update({ 'translate.autoWhenVisible': false });
      bus.emit(EVENTS.TOAST, { message: 'Automatic translation off as well' });
    }
    expansionPaused = nowPaused;
  }

  /** This post's own controls, not those of replies nested inside it. */
  function controlsOf(post, kind) {
    return [...post.querySelectorAll(CONTROL_SELECTOR)].filter(
      (element) => element instanceof HTMLElement && closestPost(element) === post && classify(element) === kind,
    );
  }

  /** Records a post's text before it is translated, by us or by the reader. */
  function rememberOriginal(post) {
    if (post && controlsOf(post, 'original').length === 0) originals.set(post, extractBody(post));
  }

  /**
   * Whether a post is showing Engage's translation, and from what.
   *
   * @returns {{from: string|null, original: string|null}|null}
   */
  function translationOf(post) {
    if (!(post instanceof HTMLElement)) return null;
    const [control] = controlsOf(post, 'original');
    if (!control) return null;
    // "Show original (Japanese)": Engage's own name for the source language.
    const texts = accessibleTexts(control, { maxLength: MAX_LABEL_LENGTH });
    const label = texts.find((text) => active.showOriginal?.test(text)) ?? texts.find((text) => ORIGINAL_STATE.test(text));
    const from = /\(([^()]*)\)\s*$/.exec(label ?? '')?.[1]?.trim() || null;
    return { from, original: originals.get(post) ?? null };
  }

  /** Still allowed to translate: switched on, and expansion not paused. */
  function running() {
    return settings.get('translate.autoWhenVisible') && !expansionPaused;
  }

  async function translated(post) {
    const end = Date.now() + TRANSLATE_TIMEOUT_MS;
    while (Date.now() < end) {
      if (translationOf(post)) return true;
      if (!running()) return false;
      await sleep(POLL_MS);
    }
    return false;
  }

  /**
   * Translates every eligible post of a thread that is about to be copied,
   * on screen or not, and resolves once Engage has shown the translations.
   *
   * Nothing happens unless automatic translation is on. Same rules as
   * scrolling otherwise: confident languages only, never a post the reader
   * has turned back to its original, one at a time -- and switching it off
   * or pausing expansion stops it between posts.
   *
   * @param {HTMLElement[]} posts
   * @param {{onProgress?: (done: number, total: number) => void}} [options]
   */
  async function translateForCopy(posts, { onProgress } = {}) {
    const result = { translated: 0, eligible: 0, skipped: 0, stopped: false };
    if (!running()) return result;

    const queued = [];
    for (const post of posts) {
      const [control] = controlsOf(post, 'translate');
      if (control && eligibleForAutoTranslate(control)) queued.push(post);
    }
    result.eligible = queued.length;
    const batch = queued.slice(0, MAX_COPY_TRANSLATIONS);
    result.skipped = queued.length - batch.length;

    for (const [index, post] of batch.entries()) {
      const wait = lastClick + TRANSLATE_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      if (!running()) {
        result.stopped = true;
        break;
      }
      // Looked up again: the control may have been re-rendered meanwhile.
      const [control] = controlsOf(post, 'translate');
      if (!control || !eligibleForAutoTranslate(control)) continue;

      onProgress?.(index + 1, batch.length);
      rememberOriginal(post);
      attempted.add(post);
      forget(post);
      lastClick = Date.now();
      control.click();
      if (await translated(post)) result.translated += 1;
      else if (!running()) {
        result.stopped = true;
        break;
      }
    }
    return result;
  }

  /** Catches the reader's own clicks on "Show translation", before Engage acts. */
  function onClickCapture(event) {
    const target = event.target instanceof Element ? event.target.closest(CONTROL_SELECTOR) : null;
    if (target instanceof HTMLElement && classify(target) === 'translate') {
      rememberOriginal(closestPost(target));
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      clearTimeout(queueTimer);
      queueTimer = null;
    } else {
      drain();
    }
  }

  function configureObserver() {
    if (!settings.get('translate.autoWhenVisible') || typeof IntersectionObserverImpl !== 'function') {
      observer?.disconnect();
      observer = null;
      watched.clear();
      onScreenSince.clear();
      clearQueue();
      return;
    }
    if (!observer) observer = new IntersectionObserverImpl(onIntersect, { threshold: 0 });
    prune();
  }

  /** Starts watching the post that owns a control; true while it is watched. */
  function watchForTranslation(control) {
    if (!observer) return false;
    const target = closestPost(control) ?? control;
    if (!eligibleForAutoTranslate(control)) {
      if (watched.has(target)) forget(target);
      return false;
    }
    if (!watched.has(target)) observer.observe(target);
    // Always the latest control: Engage may have re-rendered it.
    watched.set(target, control);
    return true;
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
      const label = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH })[0];
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
    configureObserver();
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

      // Automatic translation is independent of how the control looks, so it
      // is decided before "Leave unchanged" returns.
      const autoTranslate = kind === 'translate' && watchForTranslation(element);

      if (mode === 'off') {
        clear(element);
        continue;
      }

      element.dataset[MARKER] = kind;

      if (kind === 'original') {
        // Keep the source-language cue visible: it is the clearest indication
        // that this body is translated and the accessible way back to it.
        apply(element, { compact: false, hidden: false });
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

      // Auto-translation needs a visible native control for IntersectionObserver.
      if (autoTranslate) shouldHide = false;

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
      document.addEventListener('visibilitychange', onVisibilityChange);
      // Capture phase on the document runs before React's own listeners, so
      // the text is read while it is still the original.
      document.addEventListener('click', onClickCapture, true);
      unsubscribeExpand = bus.on(EVENTS.EXPAND_STATE, onExpandState);
      sweep();
    },

    stop() {
      scheduleSweep.cancel();
      observer?.disconnect();
      observer = null;
      watched.clear();
      onScreenSince.clear();
      clearQueue();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('click', onClickCapture, true);
      unsubscribeExpand?.();
      unsubscribeExpand = null;
      for (const element of document.querySelectorAll(`.${COMPACT_CLASS}, .${HIDDEN_CLASS}, .${ROW_CLASS}, .${ROW_HIDDEN_CLASS}`)) {
        clear(element);
      }
    },

    onDomChanged() {
      scheduleSweep();
    },

    translationOf,
    translateForCopy,

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
