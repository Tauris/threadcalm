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
  const observer = new MutationObserver(() => {
    announceDomChange();
    // A route change can land before History is updated; re-check cheaply.
    announceNavigation();
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
