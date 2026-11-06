/**
 * Holding back videos that start by themselves.
 *
 * Engage plays feed videos, muted, as they scroll into view. With
 * video.autoplay set to "manual", a video that starts without the reader having
 * asked is paused again at once. Off by default: the default is Engage's own
 * behaviour, and with the setting off no listener is even attached.
 *
 * A <video> in the page is caught by its play events and paused. Engage's own
 * player, though, sits in a cross-origin iframe, whose <video> this script cannot
 * see. What it can change is the frame's allow attribute: the "autoplay" entry is
 * removed, the others kept, and the frame reloaded once, because a browser reads
 * allow only when a frame loads. The layout diagnostics count both kinds.
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

const isAutoplayEntry = (entry) => /^\s*autoplay(\s|$)/i.test(entry);

/** An iframe's allow value with "autoplay" removed and its other entries kept. */
export function withoutAutoplay(allow) {
  return allow.split(';').filter((entry) => !isAutoplayEntry(entry)).join(';').trim();
}

/** A browser applies allow only when a frame loads, so a change needs a reload. */
function reloadFrame(frame) {
  const src = frame.getAttribute('src');
  if (src) frame.setAttribute('src', src);
}

export function createVideoGuard({ isGenuine = (event) => event.isTrusted } = {}) {
  let listening = false;
  let lastGesture = null;
  let frameObserver = null;
  // Each changed frame's original allow value, to put back when the setting goes off.
  const changedFrames = new WeakMap();
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
    holdFramesIn(document);
  }

  /** Reloads only the first time, so Engage restoring the value cannot cause a reload loop. */
  function holdFrame(frame) {
    const allow = frame.getAttribute('allow');
    if (!allow || !allow.split(';').some(isAutoplayEntry)) return;
    if (frame.closest('[role="dialog"]')) return;

    const first = !changedFrames.has(frame);
    if (first) changedFrames.set(frame, allow);
    frame.setAttribute('allow', withoutAutoplay(allow));
    if (!first) return;
    reloadFrame(frame);
    counters.autoplayFramesHeld += 1;
    log.debug('removed autoplay from an embedded frame');
  }

  function holdFramesIn(root) {
    if (root.tagName === 'IFRAME') holdFrame(root);
    root.querySelectorAll?.('iframe[allow]').forEach(holdFrame);
  }

  function restoreFrames() {
    for (const frame of document.querySelectorAll('iframe')) {
      const original = changedFrames.get(frame);
      if (original === undefined) continue;
      changedFrames.delete(frame);
      frame.setAttribute('allow', original);
      reloadFrame(frame);
    }
  }

  function listen() {
    if (listening) return;
    listening = true;
    // Its own observer rather than onDomChanged, which is debounced: the sooner
    // a new frame is changed, the less of it has loaded with autoplay allowed.
    frameObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) holdFramesIn(node);
        }
      }
    });
    frameObserver.observe(document.documentElement, { childList: true, subtree: true });
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
    frameObserver?.disconnect();
    frameObserver = null;
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
      restoreFrames();
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
