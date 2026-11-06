/**
 * Holding back videos that start by themselves.
 *
 * Engage plays feed videos, muted, as they scroll into view. With
 * video.autoplay set to "manual", a video that starts without the reader having
 * asked is paused again at once. Off by default: the default is Engage's own
 * behaviour, and with the setting off no listener is even attached.
 *
 * Nothing about Engage's player is assumed beyond its being a <video>: play
 * events are caught on the way down the document, and the only action is
 * pause(). Whatever Engage draws on top keeps working. A video in a cross-origin
 * iframe cannot be reached from here at all; the layout diagnostics count both
 * kinds, so a report can tell which case it is.
 *
 * The failure to avoid is pausing a video the reader just asked for, so "asked"
 * is read generously. A genuine click or key press in the last moments counts if
 * it landed on the video, or anywhere in its post other than the action row --
 * a play button may be drawn beside the video, or the <video> may only be
 * created by the click. A video in a dialog was opened on purpose and is left
 * alone. The cost of being generous is an occasional video that gets to play;
 * the cost of the opposite would be one that cannot be played.
 */
import { ACTION_ROW_SELECTOR, closestPost } from '../core/dom.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { counters } from '../core/stats.js';

/** How long after a click or key press a video may start because of it. */
export const GESTURE_WINDOW_MS = 2000;

/** Keys that activate a focused control. */
const ACTIVATING_KEYS = new Set(['Enter', ' ']);

export function createVideoGuard({ isGenuine = (event) => event.isTrusted } = {}) {
  let listening = false;
  let lastGesture = null;
  // Videos the reader has started. They are left alone from then on, including
  // when Engage resumes one as it scrolls back into view.
  const started = new WeakSet();

  function covers(video, x, y) {
    const rect = video.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function askedFor(video) {
    if (video.closest('[role="dialog"]')) return true;
    if (!lastGesture || Date.now() - lastGesture.at > GESTURE_WINDOW_MS) return false;

    const { x, y, target } = lastGesture;
    if (covers(video, x, y)) return true;
    if (target.closest(ACTION_ROW_SELECTOR)) return false;
    return Boolean(closestPost(video)?.contains(target));
  }

  function hold(video) {
    video.pause();
    counters.autoplaysHeld += 1;
    log.debug('held a video that started by itself');
  }

  function onPlay(event) {
    const video = event.target;
    if (video?.tagName !== 'VIDEO' || started.has(video)) return;
    if (askedFor(video)) {
      started.add(video);
      return;
    }
    hold(video);
  }

  function onPointerDown(event) {
    if (!isGenuine(event) || !(event.target instanceof Element)) return;
    lastGesture = { at: Date.now(), x: event.clientX, y: event.clientY, target: event.target };
  }

  function onKeyDown(event) {
    if (!isGenuine(event) || !ACTIVATING_KEYS.has(event.key)) return;
    if (!(event.target instanceof Element)) return;
    const rect = event.target.getBoundingClientRect();
    lastGesture = {
      at: Date.now(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      target: event.target,
    };
  }

  /**
   * Catches what no play event reported: a video already running when the
   * setting came on, or one that started before it reached the document. Only
   * muted ones -- a video with sound was not started by Engage's autoplay.
   */
  function sweep() {
    for (const video of document.querySelectorAll('video')) {
      if (!video.paused && video.muted && !started.has(video) && !askedFor(video)) hold(video);
    }
  }

  function listen() {
    if (listening) return;
    listening = true;
    // Capture, because media events do not bubble and the player may stop the
    // propagation of its own clicks.
    document.addEventListener('play', onPlay, true);
    document.addEventListener('playing', onPlay, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
  }

  function unlisten() {
    if (!listening) return;
    listening = false;
    document.removeEventListener('play', onPlay, true);
    document.removeEventListener('playing', onPlay, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    lastGesture = null;
  }

  function apply() {
    if (settings.get('video.autoplay') === 'manual') {
      listen();
      sweep();
    } else {
      // Nothing is resumed: Engage starts the next video as it normally would.
      unlisten();
    }
  }

  return {
    start: apply,
    stop: unlisten,
    onSettingsChanged(changed) {
      if ('video.autoplay' in changed) apply();
    },
    onDomChanged() {
      if (listening) sweep();
    },
  };
}
