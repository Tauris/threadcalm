/**
 * Thread expansion.
 *
 * The original script's job, rebuilt around configurable limits, SPA-aware
 * resets and a click target chosen by structure rather than by class name.
 *
 * Matching rules, in order of how much we trust them:
 *
 *  1. A reply counter recognised by *structure*: a native button whose own
 *     label starts with a digit and which carries Engage's reply glyph. The
 *     glyph is the same in every interface language, so this layer finds reply
 *     counters in locales no label pack covers. The digit alone would not do —
 *     share and reaction counters are numeric too, and the icon is what tells
 *     them apart.
 *  2. A bare reply counter read as text ("3 replies", "1 Antwort"). The
 *     fallback for markup the glyph check does not cover. Anchored at both
 *     ends, so it cannot collide with prose.
 *  3. An explicit pagination label ("Show more replies"). Reply/comment
 *     wording is required — a bare "Show more" is deliberately NOT accepted
 *     here, because it also names unrelated controls.
 *  4. A truncation control inside a post body ("See more"). Accepted only
 *     within a recognised post container, which is what makes the bare label
 *     safe. Unlike the others it is not clicked as soon as it is found: a
 *     post is opened once it has been on screen for a moment, the way
 *     automatic translation works, so a long feed is not unfolded in the
 *     background. An explicit request -- the o key, copying a thread, "expand
 *     everything" -- still opens every post it covers at once.
 *
 * Anything that looks like a menu is rejected outright: opening the post
 * overflow menu on every post in a feed was the worst early failure mode.
 */
import { bus, EVENTS } from '../core/bus.js';
import {
  accessibleTexts,
  BODY_WRAPPER_SELECTOR,
  closestPost,
  hasIconSignature,
  isBodyLinkButton,
  isVisible,
  nearestClickable,
  normalizeText,
  visibleText,
} from '../core/dom.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { noteScan } from '../core/stats.js';
import { isThreadView } from '../core/spa.js';

/** Elements that could plausibly carry a label and receive a click. */
const CANDIDATE_SELECTOR =
  'button, [role="button"], a, [tabindex="0"], span, div[role="link"]';

/** Labels longer than this are prose, not controls. */
const MAX_LABEL_LENGTH = 120;

/**
 * Any decimal digit, in any numbering system.
 *
 * `\d` would be ASCII-only, and the point of this layer is to work in
 * locales the label packs know nothing about.
 */
const LEADING_DIGIT = /^\p{Nd}/u;

/**
 * How long a truncated post must be on screen before it is opened. Shorter
 * than translation's wait, because opening a post costs no request; long
 * enough that scrolling past does not unfold everything on the way.
 */
export const OPEN_DWELL_MS = 300;

export function createExpander({ matchers, IntersectionObserverImpl = globalThis.IntersectionObserver }) {
  let active = matchers;

  let running = true;
  let paused = false;
  let scanTimer = null;
  let settleTimer = null;
  let heartbeat = null;

  let totalClicks = 0;
  let quietPasses = 0;
  let limitReached = false;

  /**
   * Whether anything has changed since the last scan.
   *
   * A scan reads every candidate control in the document, so repeating one
   * against a page that has not moved is pure waste -- and on a long feed it
   * is expensive waste, several times a second, for as long as the tab is
   * open. The heartbeat still runs, because lazily rendered replies can arrive
   * without a mutation worth reporting, but once the thread has settled it
   * checks occasionally rather than constantly.
   */
  let dirty = true;
  let idleBeats = 0;

  /** Scans performed, so a test can show the idle loop actually goes quiet. */
  let scans = 0;

  // Element identity, not a selector, is what dedupes: Engage reuses labels
  // freely but a given DOM node only ever needs to be opened once. A WeakSet
  // also lets detached nodes be collected after a re-render.
  let clicked = new WeakSet();
  // Body wrappers whose "see more" has been clicked. The control may be
  // replaced during a render, but another body in the same container is independent.
  let expandedBodies = new WeakSet();

  // Truncated posts waiting to come on screen. Keyed by the body wrapper (or
  // the post, or the control), which is what the observer watches. A Map, not
  // a WeakMap: the observer holds its targets strongly, so removed ones must
  // be found and released (see pruneWaiting).
  let viewer = null;
  const waiting = new Map();
  const onScreenSince = new Map();
  let openTimer = null;

  function publishState() {
    bus.emit(EVENTS.EXPAND_STATE, {
      enabled: settings.get('expand.enabled'),
      paused,
      totalClicks,
      limitReached,
    });
  }

  /** True when the script should be expanding on the current route. */
  function inScope() {
    if (!settings.get('expand.enabled') || paused) return false;
    return settings.get('expand.scope') !== 'thread' || isThreadView();
  }

  function isMenuLike(element, texts) {
    const popup = element.getAttribute('aria-haspopup');
    if (popup === 'menu' || popup === 'true' || popup === 'dialog') return true;
    if (element.getAttribute('aria-expanded') === 'true') return true;
    return Boolean(active.menu && texts.some((text) => active.menu.test(text)));
  }

  /**
   * A reply counter recognised without reading a word of it.
   *
   * A native button, not a menu, whose *own* label starts with a digit and
   * which contains Engage's reply glyph. Restricting this to the button's own
   * text matters: a post ancestor's text starts with all sorts of things.
   */
  function isStructuralReplyCount(element) {
    if (element.tagName !== 'BUTTON') return false;

    const label = normalizeText(visibleText(element));
    if (!label || label.length > MAX_LABEL_LENGTH) return false;
    if (!LEADING_DIGIT.test(label)) return false;

    return hasIconSignature(element, settings.get('advanced.replyIconSignatures'));
  }

  /**
   * Classifies a candidate element.
   * @returns {'reply-count'|'pagination'|'truncation'|null}
   */
  function classify(element) {
    if (!(element instanceof HTMLElement)) return null;
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') return null;

    const texts = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH });
    if (isMenuLike(element, texts)) return null;

    // Layer 1: structure, which holds in every interface language.
    if (isStructuralReplyCount(element)) {
      return isVisible(element) ? 'reply-count' : null;
    }

    // "see more" by structure: an inline link button inside the post body.
    // Holds in every interface language; wording below is the fallback.
    if (settings.get('expand.truncatedText') && isBodyLinkButton(element)) {
      if (expandedBodies.has(element.closest(BODY_WRAPPER_SELECTOR))) return null;
      return isVisible(element) ? 'truncation' : null;
    }

    if (texts.length === 0) return null;

    // Layer 2 onwards: the label packs, for markup the glyph does not cover.
    if (active.replyCount && texts.some((text) => active.replyCount.test(text))) {
      return isVisible(element) ? 'reply-count' : null;
    }
    if (active.expandReplies && texts.some((text) => active.expandReplies.test(text))) {
      return isVisible(element) ? 'pagination' : null;
    }
    if (
      settings.get('expand.truncatedText') &&
      active.expandText &&
      texts.some((text) => active.expandText.test(text))
    ) {
      // A bare "See more" is only trustworthy inside a post.
      if (!closestPost(element)) return null;
      const body = element.closest(BODY_WRAPPER_SELECTOR);
      if (body && expandedBodies.has(body)) return null;
      return isVisible(element) ? 'truncation' : null;
    }
    return null;
  }

  /**
   * Finds everything worth clicking right now.
   * Exposed for tests and for the "expand this thread" command.
   */
  function findControls(root = document) {
    const found = [];
    const seenTargets = new Set();
    let examined = 0;

    for (const element of root.querySelectorAll(CANDIDATE_SELECTOR)) {
      examined += 1;
      const kind = classify(element);
      if (!kind) continue;

      const target = nearestClickable(element, closestPost(element));
      if (!target || clicked.has(target) || seenTargets.has(target)) continue;

      // A label span and its button both match; keep one entry per real target.
      seenTargets.add(target);
      found.push({ kind, element, target });
    }

    noteScan(examined);
    return found;
  }

  /** What the observer watches for a truncation control. */
  function viewTarget(control) {
    return control.closest(BODY_WRAPPER_SELECTOR) ?? closestPost(control) ?? control;
  }

  function stopWaiting(target) {
    viewer?.unobserve(target);
    waiting.delete(target);
    onScreenSince.delete(target);
  }

  function pruneWaiting() {
    for (const target of [...waiting.keys()]) if (!target.isConnected) stopWaiting(target);
  }

  function clearWaiting() {
    viewer?.disconnect();
    viewer = null;
    waiting.clear();
    onScreenSince.clear();
    clearTimeout(openTimer);
    openTimer = null;
  }

  /** Defers a truncation control until its post is on screen. */
  function openWhenSeen(control) {
    const target = viewTarget(control);
    if (!viewer) viewer = new IntersectionObserverImpl(onViewed, { threshold: 0 });
    if (!waiting.has(target)) viewer.observe(target);
    // Always the latest control: Engage may have re-rendered it.
    waiting.set(target, control);
  }

  function onViewed(entries) {
    const now = Date.now();
    for (const { target, isIntersecting, intersectionRatio } of entries) {
      if (!waiting.has(target)) continue;
      if (isIntersecting && intersectionRatio > 0) {
        if (!onScreenSince.has(target)) onScreenSince.set(target, now);
      } else {
        onScreenSince.delete(target);
      }
    }
    scheduleOpen();
  }

  function scheduleOpen() {
    clearTimeout(openTimer);
    openTimer = null;
    if (!running || !inScope() || onScreenSince.size === 0) return;
    const due = Math.min(...onScreenSince.values()) + OPEN_DWELL_MS;
    openTimer = setTimeout(openSeen, Math.max(0, due - Date.now()));
  }

  /** Opens every waiting post that has now been on screen long enough. */
  function openSeen() {
    openTimer = null;
    if (!running || !inScope() || !settings.get('expand.truncatedText')) return;
    const maxTotal = settings.get('expand.maxTotalClicks');
    const now = Date.now();
    let clicks = 0;
    for (const [target, since] of [...onScreenSince]) {
      if (since + OPEN_DWELL_MS > now) continue;
      const control = waiting.get(target);
      stopWaiting(target);
      if (totalClicks >= maxTotal) break;
      // Checked now, not when found: it may have been opened meanwhile.
      if (!control?.isConnected || clicked.has(control) || classify(control) !== 'truncation') continue;
      if (clickControl('truncation', control)) clicks += 1;
    }
    if (clicks > 0) bus.emit(EVENTS.EXPAND_PROGRESS, { totalClicks, clicks, settled: false });
    scheduleOpen();
  }

  function clickControl(kind, target) {
    clicked.add(target);
    if (kind === 'truncation') {
      const body = target.closest(BODY_WRAPPER_SELECTOR);
      if (body) expandedBodies.add(body);
    }
    try {
      target.click();
    } catch (error) {
      log.debug('click failed', error, target);
      return false;
    }
    totalClicks += 1;
    log.debug(`clicked ${kind}`, target);
    return true;
  }

  /**
   * Clicks what there is to click under `root`.
   *
   * With `deferTruncation`, "see more" controls are not clicked but handed to
   * openWhenSeen -- the automatic scans do that. Explicit requests do not.
   */
  function clickBatch(root = document, { deferTruncation = false } = {}) {
    const maxPerScan = settings.get('expand.maxClicksPerScan');
    const maxTotal = settings.get('expand.maxTotalClicks');

    if (totalClicks >= maxTotal) {
      if (!limitReached) {
        limitReached = true;
        log.warn(`click limit reached (${maxTotal}); pausing expansion for this page`);
        publishState();
      }
      return 0;
    }

    const defer = deferTruncation && typeof IntersectionObserverImpl === 'function';
    let clicks = 0;
    for (const { kind, target } of findControls(root)) {
      if (defer && kind === 'truncation') {
        openWhenSeen(target);
        continue;
      }
      if (clicks >= maxPerScan || totalClicks >= maxTotal) break;
      if (clickControl(kind, target)) clicks += 1;
    }
    return clicks;
  }

  function scan({ deferTruncation = true } = {}) {
    scanTimer = null;
    if (!running || !inScope()) return;

    dirty = false;
    scans += 1;
    pruneWaiting();
    const clicks = clickBatch(document, { deferTruncation });
    if (clicks > 0) {
      quietPasses = 0;
      bus.emit(EVENTS.EXPAND_PROGRESS, { totalClicks, clicks, settled: false });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, settings.get('expand.settleDelayMs'));
    } else {
      quietPasses += 1;
      // Three consecutive empty passes is the signal that Engage has stopped
      // rendering new controls, i.e. the visible thread is fully open.
      if (quietPasses === 3) {
        bus.emit(EVENTS.EXPAND_PROGRESS, { totalClicks, clicks: 0, settled: true });
      }
    }
  }

  function schedule() {
    if (!running || scanTimer || !inScope()) return;
    scanTimer = setTimeout(() => scan(), settings.get('expand.scanDelayMs'));
  }

  /** Beats to wait between checks once the thread has settled and gone quiet. */
  const IDLE_BEAT_INTERVAL = 10;

  function beat() {
    // Something changed, or we have not yet settled: scan as before.
    if (dirty || quietPasses < 3) {
      idleBeats = 0;
      schedule();
      return;
    }

    // Settled and unchanged. Keep the safety net, at a tenth of the cost.
    idleBeats += 1;
    if (idleBeats >= IDLE_BEAT_INTERVAL) {
      idleBeats = 0;
      schedule();
    }
  }

  function restartHeartbeat() {
    clearInterval(heartbeat);
    heartbeat = null;
    idleBeats = 0;
    const interval = settings.get('expand.heartbeatMs');
    if (interval > 0) heartbeat = setInterval(beat, interval);
  }

  /** Clears per-page counters. Called on navigation and on manual rescan. */
  function reset() {
    totalClicks = 0;
    quietPasses = 0;
    limitReached = false;
    dirty = true;
    idleBeats = 0;
    clicked = new WeakSet();
    expandedBodies = new WeakSet();
    clearWaiting();
    publishState();
  }

  return {
    start() {
      running = true;
      restartHeartbeat();
      schedule();
      publishState();
    },

    stop() {
      running = false;
      clearTimeout(scanTimer);
      clearTimeout(settleTimer);
      clearInterval(heartbeat);
      scanTimer = settleTimer = heartbeat = null;
      clearWaiting();
    },

    /** Called by the SPA watcher; a new route means new counters. */
    onNavigate() {
      reset();
      schedule();
    },

    onDomChanged() {
      // The page moved, so the next scan has something to look at.
      dirty = true;
      idleBeats = 0;
      schedule();
    },

    onSettingsChanged(changed) {
      if ('expand.heartbeatMs' in changed) restartHeartbeat();
      if ('expand.maxTotalClicks' in changed) limitReached = false;
      dirty = true;
      publishState();
      schedule();
    },

    /** Re-reads label packs after the user edits languages or patterns. */
    setMatchers(next) {
      dirty = true;
      active = next;
      schedule();
    },

    /** Forgets the click history and runs a fresh pass immediately. */
    /** "Expand everything on this page": opens every post, seen or not. */
    rescan() {
      reset();
      scan({ deferTruncation: false });
    },

    pause() {
      paused = true;
      clearTimeout(scanTimer);
      clearTimeout(settleTimer);
      clearTimeout(openTimer);
      scanTimer = settleTimer = openTimer = null;
      publishState();
    },

    resume() {
      paused = false;
      publishState();
      schedule();
      scheduleOpen();
    },

    togglePause() {
      if (paused) this.resume();
      else this.pause();
      return paused;
    },

    isPaused: () => paused,

    /**
     * Expands one subtree only, "see more" included whether on screen or not
     * -- used by the o key and before copying.
     */
    expandWithin(root) {
      return clickBatch(root);
    },

    get stats() {
      return { totalClicks, paused, limitReached };
    },

    // Exposed for the test suite.
    _internals: { classify, findControls, beat, scanCount: () => scans },
  };
}
