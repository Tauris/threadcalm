/**
 * Single-page-app navigation and DOM-change plumbing.
 *
 * Viva Engage never reloads the document, so `document-idle` fires exactly
 * once for a session that may visit dozens of threads. Features that need to
 * re-run therefore listen for NAVIGATE instead of relying on script start-up.
 */
import { bus, EVENTS } from './bus.js';
import { debounce } from './dom.js';
import { log } from './logger.js';

let started = false;
let lastUrl = '';

/**
 * Everything this script puts on the page.
 *
 * Its own writes must not count as page activity. The status panel rewrites
 * its text as expansion progresses, and that is a childList change like any
 * other: left unfiltered it reports a DOM change, which runs every feature's
 * sweep, which reports progress, which rewrites the panel. The page never
 * settles, and the cost of that loop grows with the length of the feed.
 */
const OWN_UI_SELECTOR = '#tc-panel, #tc-toasts, #tc-settings, #tc-help';
const OWN_NODE_SELECTOR = `${OWN_UI_SELECTOR}, .tc-chip`;

/** The element a mutation record concerns, whatever kind of node it names. */
function elementOf(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

function isOwnNode(node) {
  const element = elementOf(node);
  return Boolean(element?.closest?.(OWN_NODE_SELECTOR));
}

/**
 * True when a record describes only this script's own work.
 *
 * Two shapes count: something changing inside our own windows, and our chip
 * being added to or removed from a post -- which happens whenever React
 * re-renders that post, and would otherwise make the two of us take turns
 * forever.
 */
function isOwnMutation(record) {
  if (elementOf(record.target)?.closest?.(OWN_UI_SELECTOR)) return true;
  if (record.type !== 'childList') return false;

  const touched = [...record.addedNodes, ...record.removedNodes];
  return touched.length > 0 && touched.every(isOwnNode);
}

/**
 * Wraps a History method so programmatic navigation is observable.
 * `popstate` alone is not enough: it does not fire for pushState.
 */
function patchHistoryMethod(name, onCall) {
  const original = history[name];
  if (typeof original !== 'function' || original.__threadcalmPatched) return;

  const patched = function patchedHistoryMethod(...args) {
    const result = original.apply(this, args);
    try {
      onCall();
    } catch (error) {
      log.error('history patch failed', error);
    }
    return result;
  };
  patched.__threadcalmPatched = true;
  history[name] = patched;
}

/**
 * Starts navigation and mutation reporting.
 *
 * @param {object} [options]
 * @param {number} [options.domDebounceMs] quiet period before DOM_CHANGED fires
 * @param {number} [options.urlPollMs] safety net for navigation we did not observe
 * @returns {() => void} stop function
 */
export function startSpaWatcher({ domDebounceMs = 250, urlPollMs = 1000 } = {}) {
  if (started) return () => {};
  started = true;
  lastUrl = location.href;

  const announceNavigation = () => {
    const url = location.href;
    if (url === lastUrl) return;
    const previous = lastUrl;
    lastUrl = url;
    log.debug('navigated', previous, '->', url);
    bus.emit(EVENTS.NAVIGATE, { url, previousUrl: previous });
  };

  patchHistoryMethod('pushState', announceNavigation);
  patchHistoryMethod('replaceState', announceNavigation);
  window.addEventListener('popstate', announceNavigation);
  window.addEventListener('hashchange', announceNavigation);

  // Engage also swaps routes without touching History in some flows, so a slow
  // poll backs up the event-based detection.
  const poll = setInterval(announceNavigation, urlPollMs);

  const announceDomChange = debounce(() => bus.emit(EVENTS.DOM_CHANGED), domDebounceMs);
  const observer = new MutationObserver((records) => {
    // A route change can land before History is updated; re-check cheaply.
    // This is a string compare, so it runs for our own mutations too.
    announceNavigation();

    if (records.some((record) => !isOwnMutation(record))) announceDomChange();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    started = false;
    clearInterval(poll);
    observer.disconnect();
    announceDomChange.cancel();
    window.removeEventListener('popstate', announceNavigation);
    window.removeEventListener('hashchange', announceNavigation);
  };
}

/** True when the current URL looks like a single conversation rather than a feed. */
export function isThreadView(url = location.href) {
  return /\/(?:threads?|conversations?)\/|[?&]threadId=/i.test(url);
}
