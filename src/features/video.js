/**
 * Keeping videos from loading and playing until the reader asks.
 *
 * Engage plays feed videos, muted, as they scroll into view, which costs data
 * on a slow or metered connection. With video.autoplay set to "manual", two
 * things happen. Off by default: the default is Engage's own behaviour, and with
 * the setting off no listener or observer is even attached.
 *
 * Engage's player is a cross-origin iframe from SharePoint. Nothing inside it
 * can be reached from here, and removing "autoplay" from its allow attribute was
 * tried on a real page and does not stop it. So the frame is sent to about:blank
 * as soon as it appears, a button takes its place, and clicking that restores the
 * frame's address. This is what saves data: the player is not loaded at all. The
 * frame itself stays in the document, because the page owns it.
 *
 * A plain <video> in the page is caught by its play events and paused. The
 * failure to avoid there is pausing a video the reader just asked for, so "asked"
 * is read generously. A genuine click or key press in the last moments counts if
 * it landed on the video, or anywhere in its post other than the action row -- a
 * play button may be drawn beside the video, or the <video> may only be created
 * by the click. Anything in a dialog was opened on purpose and is left alone.
 */
import { ACTION_ROW_SELECTOR, closestPost, el } from '../core/dom.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { counters } from '../core/stats.js';
import { icon } from '../ui/icons.js';

/** How long after a click or key press a video may start because of it. */
export const GESTURE_WINDOW_MS = 2000;

/** How often a frame is held before accepting that the page insists on loading it. */
export const MAX_HOLDS = 3;

/** Keys that activate a focused control. */
const ACTIVATING_KEYS = new Set(['Enter', ' ']);

const PLACEHOLDER_CLASS = 'tc-video-hold';
const HELD_FRAME_CLASS = 'tc-video-frame-held';
const HOST_CLASS = 'tc-video-host';

/**
 * Whether an iframe is Engage's video player: served from SharePoint, and
 * allowed to autoplay. Both, so that other embeds are left alone.
 */
export function isVideoPlayerFrame(frame) {
  const allowsAutoplay = (frame.getAttribute('allow') ?? '')
    .split(';')
    .some((entry) => /^\s*autoplay(\s|$)/i.test(entry));
  if (!allowsAutoplay) return false;
  try {
    const { hostname } = new URL(frame.getAttribute('src') ?? '', document.baseURI);
    return /\.sharepoint\.com$/i.test(hostname);
  } catch {
    return false;
  }
}

export function createVideoGuard({ isGenuine = (event) => event.isTrusted } = {}) {
  let listening = false;
  let lastGesture = null;
  let frameObserver = null;
  // Videos the reader has started. They are left alone from then on, including
  // when Engage resumes one as it scrolls back into view.
  const started = new WeakSet();
  // Each held frame's address, placeholder and number of holds.
  const heldFrames = new WeakMap();
  // Frames not to hold again: clicked by the reader, or insisted on by the page.
  const releasedFrames = new WeakSet();
  const frameOfPlaceholder = new WeakMap();

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

  /** Takes the placeholder away. The caller decides what happens to the address. */
  function clearHold(frame) {
    const state = heldFrames.get(frame);
    if (!state) return;
    state.button.parentElement?.classList.remove(HOST_CLASS);
    state.button.remove();
    frame.classList.remove(HELD_FRAME_CLASS);
    heldFrames.delete(frame);
  }

  function loadFrame(frame) {
    const { src } = heldFrames.get(frame);
    releasedFrames.add(frame);
    clearHold(frame);
    frame.setAttribute('src', src);
  }

  function buildPlaceholder(frame) {
    const button = el(
      'button',
      {
        type: 'button',
        className: PLACEHOLDER_CLASS,
        'aria-label': 'Play video. Not loaded, to save data.',
        title: 'Threadcalm kept this video from loading. Click to load and play it.',
        on: {
          click: (event) => {
            // The post around it may treat a click as opening the thread.
            event.preventDefault();
            event.stopPropagation();
            loadFrame(frame);
          },
        },
      },
      icon('play'),
      el('span', { className: 'tc-video-hold-label', text: 'Play video' }),
      el('span', { className: 'tc-video-hold-note', text: 'Not loaded, to save data' }),
    );
    frameOfPlaceholder.set(button, frame);
    return button;
  }

  function holdFrame(frame) {
    if (releasedFrames.has(frame) || !isVideoPlayerFrame(frame)) return;
    if (frame.closest('[role="dialog"]')) return;

    const state = heldFrames.get(frame);
    if (state && state.holds >= MAX_HOLDS) {
      // The page keeps putting the address back. Each round loads part of the
      // player, so holding on would cost more data than it saves.
      log.warn('the page keeps reloading an embedded player; leaving it alone');
      releasedFrames.add(frame);
      clearHold(frame);
      return;
    }

    const src = frame.getAttribute('src');
    if (state) {
      state.src = src;
      state.holds += 1;
    } else {
      const button = buildPlaceholder(frame);
      heldFrames.set(frame, { src, button, holds: 1 });
      const host = frame.parentElement;
      if (host && getComputedStyle(host).position === 'static') host.classList.add(HOST_CLASS);
      frame.after(button);
      frame.classList.add(HELD_FRAME_CLASS);
      counters.playersNotLoaded += 1;
      log.debug('kept an embedded player from loading');
    }
    frame.setAttribute('src', 'about:blank');
  }

  function holdFramesIn(root) {
    if (root.tagName === 'IFRAME') holdFrame(root);
    root.querySelectorAll?.('iframe[allow][src]').forEach(holdFrame);
  }

  function placeholders() {
    return [...document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)];
  }

  /** Removes the placeholder of a frame the page has since taken away. */
  function clearOrphans() {
    for (const button of placeholders()) {
      if (!frameOfPlaceholder.get(button)?.isConnected) button.remove();
    }
  }

  /** Puts every held frame back, for when the setting goes off. */
  function restoreFrames() {
    for (const button of placeholders()) {
      const frame = frameOfPlaceholder.get(button);
      const src = frame && heldFrames.get(frame)?.src;
      if (!src) continue;
      clearHold(frame);
      frame.setAttribute('src', src);
    }
  }

  /**
   * Catches what no event reported: a video already running when the setting
   * came on, or one that started before it reached the document. Only muted ones
   * -- a video with sound was not started by Engage's autoplay.
   */
  function sweep() {
    for (const video of document.querySelectorAll('video')) {
      if (!video.paused && video.muted && !started.has(video) && !askedFor(video)) hold(video);
    }
    holdFramesIn(document);
    clearOrphans();
  }

  function listen() {
    if (listening) return;
    listening = true;
    // Its own observer rather than onDomChanged, which is debounced: every
    // moment a new frame keeps its address is more of the player downloaded.
    frameObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target.tagName === 'IFRAME') holdFrame(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) holdFramesIn(node);
        }
      }
    });
    frameObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'allow'],
    });
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
