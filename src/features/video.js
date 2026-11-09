/**
 * Keeping videos from loading and playing until the reader asks.
 *
 * Engage plays feed videos, muted, as they scroll into view, which costs data
 * on a slow or metered connection. With video.autoplay set to "manual", the
 * guard acts on whatever it finds. Off by default: the default is Engage's own
 * behaviour, and with the setting off no listener, observer or hook is attached.
 *
 * What it finds is not known in advance, because Engage's player cannot be
 * inspected from outside a tenant, so several situations are handled:
 *
 *   - Engage's own player, as a real page showed it: a cross-origin iframe with
 *     autoplay permission and *no src attribute*. Its SDK reaches into the blank
 *     frame -- the sandbox grants allow-same-origin and allow-forms for exactly
 *     this -- and loads the player from inside, so no attribute ever changes and
 *     nothing watching the frame from outside can act. A stand-in window was
 *     tried and failed the SDK's own identity checks. So the real window is
 *     handed back, instrumented the moment the SDK first asks for it: a form
 *     submitted inside it is caught and kept instead of sent, and everything
 *     else the SDK does in there is noted for the report. The player is never
 *     loaded, which is what saves data. A tile takes the frame's place; clicking
 *     it posts the kept form into the frame, as the SDK would have.
 *   - A frame that arrives with an address, or gets one: held by sending it to
 *     about:blank, the address kept for the click. The frame itself stays in the
 *     document, because the page owns it.
 *   - A plain <video> in the page, in a shadow root, or inside a frame that is
 *     readable. It is disarmed before it starts -- autoplay off, preload none --
 *     and paused if it starts anyway.
 *   - A page that fights back. A frame whose address is put back more than
 *     MAX_HOLDS times, or a post that keeps creating new frames, is released,
 *     because each round loads part of the player and the hold would then cost
 *     more than it saves. Intercepted navigations cost nothing, so they are
 *     never given up on.
 *
 * The failure to avoid is holding a video the reader just asked for, so "asked"
 * is read generously. A genuine click or key press in the last moments counts
 * if it landed on the video, or anywhere in its post other than the action row
 * -- a play button may be drawn beside the video, or the <video> may only be
 * created by the click. A video opened in a dialog of its own was asked for.
 *
 * Every decision is noted with the recorder, so the video report can say what
 * was found and what was done about it.
 */
import { ACTION_ROW_SELECTOR, closestPost, el } from '../core/dom.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { counters } from '../core/stats.js';
import { icon } from '../ui/icons.js';
import { redactUrl } from './videoreport.js';

/** How long after a click or key press a video may start because of it. */
export const GESTURE_WINDOW_MS = 2000;

/** How often a frame is held before accepting that the page insists on loading it. */
export const MAX_HOLDS = 3;

/** New frames in one post within the window that mean the page is recreating them. */
export const RECREATION_LIMIT = 6;
export const RECREATION_WINDOW_MS = 10000;

/** How often, while the setting is on, the page is checked for videos no event reported. */
export const CHECK_INTERVAL_MS = 1000;

/** Keys that activate a focused control. */
const ACTIVATING_KEYS = new Set(['Enter', ' ']);

const PLACEHOLDER_CLASS = 'tc-video-hold';
const HELD_FRAME_CLASS = 'tc-video-frame-held';
const BLANK = 'about:blank';

/** Frame attributes worth carrying over to a frame rebuilt in the player's place. */
const CARRIED_ATTRIBUTES = ['allow', 'sandbox', 'allowfullscreen', 'referrerpolicy', 'title', 'loading'];

const ALLOWS_AUTOPLAY = /(^|;)\s*autoplay(\s|$)/i;
const PLAYER_PATH = /embed\.aspx|stream\.aspx|videoplayer|\/video(?:\/|$)|\/player(?:\/|$)|\/embed(?:\/|$)/i;
const PLAYER_HOST = /\.(sharepoint(-df)?\.com|svc\.ms|sharepointonline\.com)$/i;
const VIDEO_HINT = /video|player|media|stream/i;

/** Whether something within a few levels of the frame is named after video. */
function nearVideoHint(frame) {
  let node = frame.parentElement;
  for (let depth = 0; node && depth < 8; depth += 1) {
    const marks = `${node.getAttribute('data-testid') ?? ''} ${node.getAttribute('data-automationid') ?? ''} ${node.className ?? ''} ${node.id ?? ''}`;
    if (VIDEO_HINT.test(marks)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Whether an iframe is a video player, and why. The address alone is not
 * trusted: a held frame reads about:blank, Engage's player has no address at
 * all, and the player's real host is only known for one tenant.
 *
 * @returns {{ player: boolean, reasons: string[] }}
 */
export function classifyFrame(frame, src = frame.getAttribute('src')) {
  const reasons = [];
  if (ALLOWS_AUTOPLAY.test(frame.getAttribute('allow') ?? '')) reasons.push('allow:autoplay');
  let host = '';
  let path = '';
  try {
    if (src && src !== BLANK) ({ hostname: host, pathname: path } = new URL(src, document.baseURI));
  } catch {
    /* an unparseable address says nothing */
  }
  if (PLAYER_PATH.test(path)) reasons.push('path:player');
  if (PLAYER_HOST.test(host)) reasons.push('host:sharepoint');
  if (nearVideoHint(frame)) reasons.push('near:video-hint');
  if (closestPost(frame)) reasons.push('in-post');

  const player =
    reasons.includes('allow:autoplay')
    || reasons.includes('path:player')
    || (reasons.includes('host:sharepoint') && (reasons.includes('near:video-hint') || reasons.includes('in-post')));
  return { player, reasons };
}

/** A recorder that does nothing, for running without one. */
const SILENT = {
  note() {},
  idOf: () => 0,
  track() {},
  deepQueryAll: (selector) => [...document.querySelectorAll(selector)],
};

const FRAME_PROTO = globalThis.HTMLIFrameElement?.prototype;
const ORIGINAL = {
  contentWindow: FRAME_PROTO && Object.getOwnPropertyDescriptor(FRAME_PROTO, 'contentWindow'),
  contentDocument: FRAME_PROTO && Object.getOwnPropertyDescriptor(FRAME_PROTO, 'contentDocument'),
};

/** The frame's real window, bypassing any hook. */
export function realContentWindow(frame) {
  return ORIGINAL.contentWindow?.get.call(frame) ?? null;
}

export function createVideoGuard({ isGenuine = (event) => event.isTrusted, recorder = SILENT } = {}) {
  let listening = false;
  let lastGesture = null;
  let frameObserver = null;
  let ticker = null;
  let hooked = false;
  // Videos the reader has started. They are left alone from then on, including
  // when Engage resumes one as it scrolls back into view.
  const started = new WeakSet();
  const disarmed = new WeakSet();
  // Each held frame: address, placeholder, how it was held, what was swallowed.
  const heldFrames = new WeakMap();
  // Frames not to hold again: clicked by the reader, or insisted on by the page.
  const releasedFrames = new WeakSet();
  const releasedPosts = new WeakSet();
  const postHolds = new WeakMap();
  const frameOfPlaceholder = new WeakMap();
  // Every frame decided on, for the report. Pruned of disconnected ones when read.
  const decided = new Set();
  const decisions = new WeakMap();
  // Per frame: the realm's own submit, from before it was wrapped.
  const originalSubmits = new WeakMap();

  /** How long a frame may stay blank after a click before the tile comes back. */
  const LOAD_GRACE_MS = 4000;

  const { note, idOf } = recorder;

  function decide(frame, decision, reasons = []) {
    decided.add(frame);
    decisions.set(frame, { decision, reasons, at: Date.now() });
  }

  // ---------------------------------------------------------- plain videos --

  function covers(video, x, y) {
    const rect = video.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  /** A dialog holding the element and nothing that is a post was opened for it. */
  function inOwnDialog(element) {
    return Boolean(element.closest('[role="dialog"]')) && !closestPost(element);
  }

  function askedFor(video) {
    if (inOwnDialog(video)) return true;
    if (!lastGesture || Date.now() - lastGesture.at > GESTURE_WINDOW_MS) return false;

    const { x, y, target } = lastGesture;
    if (covers(video, x, y)) return true;
    if (target.closest(ACTION_ROW_SELECTOR)) return false;
    return Boolean(closestPost(video)?.contains(target));
  }

  function hold(video) {
    video.pause();
    counters.autoplaysHeld += 1;
    note('video-held', `#${idOf(video)} paused`);
    log.debug('held a video that started by itself');
  }

  /** Before a video starts: no autoplay, and nothing fetched ahead. */
  function disarm(video) {
    if (disarmed.has(video) || started.has(video)) return;
    disarmed.add(video);
    const had = [];
    if (video.hasAttribute('autoplay') || video.autoplay) {
      video.removeAttribute('autoplay');
      video.autoplay = false;
      had.push('autoplay');
    }
    if (video.readyState === 0 && video.preload !== 'none') {
      video.preload = 'none';
      had.push('preload');
    }
    if (had.length) note('video-disarmed', `#${idOf(video)} ${had.join(', ')} removed`);
  }

  function onPlay(event) {
    const video = event.target;
    if (video?.tagName !== 'VIDEO' || started.has(video)) return;
    if (askedFor(video)) {
      started.add(video);
      note('video-allowed', `#${idOf(video)} asked for`);
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

  /** Every video reachable: the page, its shadow roots, and readable frames. */
  function allVideos() {
    const videos = recorder.deepQueryAll('video');
    for (const frame of recorder.deepQueryAll('iframe')) {
      try {
        const inner = realContentWindow(frame)?.document?.querySelectorAll('video');
        if (inner?.length) videos.push(...inner);
      } catch {
        /* cross-origin, as expected */
      }
    }
    return videos;
  }

  function checkVideo(video) {
    if (started.has(video)) return;
    if (askedFor(video)) {
      if (!video.paused) started.add(video);
      return;
    }
    disarm(video);
    // Only muted ones: a video with sound was not started by Engage's autoplay.
    if (!video.paused && video.muted) hold(video);
  }

  // ------------------------------------------------------- embedded frames --

  /** Takes the placeholder away. The caller decides what happens to the address. */
  function clearHold(frame) {
    const state = heldFrames.get(frame);
    if (!state) return;
    state.tile.remove();
    frame.classList.remove(HELD_FRAME_CLASS);
    heldFrames.delete(frame);
  }

  /**
   * Posts the kept form into a frame, the way the SDK did: a form written into
   * the frame's own blank document and submitted from there, which navigates
   * that frame and nothing else. Posting from the page with `target=name` was
   * tried on a real page and opened a new tab instead.
   */
  function postInto(frame, state) {
    let win = null;
    let doc = null;
    try {
      win = realContentWindow(frame);
      doc = win?.document ?? null;
    } catch {
      doc = null;
    }
    if (!doc?.body) {
      note('frame-form-posted', `#${idOf(frame)} no blank document to post from`);
      return false;
    }
    const form = doc.createElement('form');
    form.method = state.form.method;
    form.action = state.form.action;
    form.style.display = 'none';
    for (const [name, value] of state.form.fields) {
      const input = doc.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }
    doc.body.append(form);
    // The realm's own submit from before it was wrapped, or the untouched one
    // of a frame that never was.
    const submit = originalSubmits.get(frame) ?? win.HTMLFormElement.prototype.submit;
    submit.call(form);
    note('frame-form-posted', `#${idOf(frame)} ${state.form.method} ${redactUrl(state.form.action)} from inside`);
    return true;
  }

  /** The frame is still the blank one: whatever was posted never landed. */
  function stillBlank(frame) {
    try {
      return Boolean(realContentWindow(frame)?.document);
    } catch {
      return false;
    }
  }

  /**
   * A click that leaves white space is worse than the hold: if the frame is
   * still blank once the grace period is over, the tile comes back.
   */
  function watchLoad(frame, state) {
    setTimeout(() => {
      if (!frame.isConnected || !stillBlank(frame) || heldFrames.has(frame)) return;
      note('frame-load-failed', `#${idOf(frame)} still blank after ${LOAD_GRACE_MS} ms; held again`);
      log.warn('a video did not load after the click; offering it again');
      releasedFrames.delete(frame);
      placeHold(frame, { ...state, reasons: state.reasons ?? [], how: 'held again after a failed load' });
    }, LOAD_GRACE_MS);
  }

  /** Loads a frame the way it was going to be loaded before it was held. */
  function loadInto(frame, state) {
    if (state.form) {
      if (postInto(frame, state)) watchLoad(frame, state);
      return;
    }
    if (state.srcdoc != null) frame.setAttribute('srcdoc', state.srcdoc);
    if (state.src) frame.setAttribute('src', state.src);
  }

  /**
   * The player, put back where the tile is, when Engage has taken its own frame
   * away in the meantime. Built from what the original frame was, loaded the way
   * it was going to be. Marked released first, so the guard does not hold its
   * own frame.
   */
  function rebuildFrame(frame, state) {
    const replacement = document.createElement('iframe');
    for (const [name, value] of Object.entries(state.attributes)) replacement.setAttribute(name, value);
    replacement.className = 'tc-video-rebuilt';
    releasedFrames.add(replacement);
    decide(replacement, 'rebuilt in the tile\'s place, loaded as the page would have');
    state.tile.replaceWith(replacement);
    loadInto(replacement, state);
    heldFrames.delete(frame);
    note('frame-rebuilt', `#${idOf(frame)} -> #${idOf(replacement)}`);
    return replacement;
  }

  /** Lets a frame load after all, and leaves it alone from then on. */
  function release(frame, why, { rebuild = true } = {}) {
    const state = heldFrames.get(frame);
    releasedFrames.add(frame);
    if (state && !frame.isConnected && state.tile.isConnected && (state.src || state.form) && rebuild) {
      rebuildFrame(frame, state);
      decide(frame, `released: ${why}, frame rebuilt`);
      note('frame-released', `#${idOf(frame)} ${why}, rebuilt`);
      return;
    }
    clearHold(frame);
    if (state) loadInto(frame, state);
    decide(frame, `released: ${why}`);
    note('frame-released', `#${idOf(frame)} ${why}`);
  }

  /**
   * What stands where the player was: a tile the size and shape of a video,
   * saying that this *is* an embedded video rather than a link, that it has not
   * been loaded, and how to load it here. A secondary link opens the player on
   * its own page, for anyone who prefers that.
   */
  function buildPlaceholder(frame, src) {
    const load = (event) => {
      // The post around it may treat a click as opening the thread.
      event.preventDefault();
      event.stopPropagation();
      release(frame, 'clicked');
    };
    const link = el('a', {
      className: 'tc-video-hold-open',
      href: src ?? '#',
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'Open in a new tab',
      on: { click: (event) => event.stopPropagation() },
    });
    const tile = el(
      'div',
      {
        className: PLACEHOLDER_CLASS,
        role: 'group',
        'aria-label': 'Embedded video, not loaded to save data',
        on: { click: load },
      },
      el('span', { className: 'tc-video-hold-badge', text: 'Embedded video' }),
      el(
        'button',
        {
          type: 'button',
          className: 'tc-video-hold-load',
          title: 'Threadcalm kept this video from loading. Load it here, where it belongs.',
          on: { click: load },
        },
        el('span', { className: 'tc-video-hold-ring', 'aria-hidden': 'true' }, icon('play')),
        el('span', { className: 'tc-video-hold-label', text: 'Load video here' }),
      ),
      el('span', { className: 'tc-video-hold-note', text: 'Not loaded, to save data' }),
      link,
      el('span', { className: 'tc-video-hold-by', text: 'held by Threadcalm' }),
    );
    frameOfPlaceholder.set(tile, frame);
    return { tile, link };
  }

  /** Where the tile belongs if its frame goes: the frame's ancestors, nearest first. */
  function anchorsOf(frame) {
    const anchors = [];
    let node = frame.parentElement;
    const post = closestPost(frame);
    for (let depth = 0; node && depth < 8; depth += 1) {
      anchors.push(node);
      if (node === post) break;
      node = node.parentElement;
    }
    return anchors;
  }

  /** Whether a post keeps producing new player frames, which no hold can win. */
  function postRecreates(post) {
    if (!post) return false;
    const now = Date.now();
    const times = (postHolds.get(post) ?? []).filter((at) => now - at < RECREATION_WINDOW_MS);
    times.push(now);
    postHolds.set(post, times);
    return times.length >= RECREATION_LIMIT;
  }

  /** Puts the tile in place and remembers the frame as held. */
  function placeHold(frame, { src, srcdoc = null, form = null, how, reasons }) {
    const { tile, link } = buildPlaceholder(frame, src);
    const attributes = {};
    for (const name of CARRIED_ATTRIBUTES) {
      if (frame.hasAttribute(name)) attributes[name] = frame.getAttribute(name);
    }
    heldFrames.set(frame, {
      src, srcdoc, form, tile, link, attributes, reasons, anchors: anchorsOf(frame), holds: 1, how,
    });
    frame.after(tile);
    frame.classList.add(HELD_FRAME_CLASS);
    counters.playersNotLoaded += 1;
    decide(frame, `held (${how})`, reasons);
    note('frame-held', `#${idOf(frame)} ${how} ${reasons.join(' ')}`);
    log.debug('kept an embedded player from loading');
  }

  /** Whether a frame without an address is one whose loading should be caught from inside. */
  function shouldIntercept(frame) {
    if (!listening || releasedFrames.has(frame) || !frame.isConnected) return false;
    if (frame.getAttribute('src') != null || frame.hasAttribute('srcdoc')) return false;
    const { player } = classifyFrame(frame, null);
    if (!player || inOwnDialog(frame)) return false;
    const post = closestPost(frame);
    return !(post && releasedPosts.has(post));
  }

  /**
   * The moment the page first reaches into a blank player frame, its real
   * window is handed back unchanged -- a stand-in failed the SDK's own identity
   * checks on a real page -- but instrumented first. A form submitted inside it,
   * by method or by event, is caught and kept instead of sent; what is written
   * into its document, sent to it, and the moment its document is replaced are
   * noted, so the report shows the SDK's route even when it is not a form.
   */
  const instrumented = new WeakSet();

  function describeForm(form) {
    const names = [...form.elements].map((element) => element.name).filter(Boolean);
    return `${(form.method || 'get').toLowerCase()} ${redactUrl(form.action)} fields=[${names.join(',')}]`;
  }

  /** Keeps what the page was about to post, so the click can post it instead. */
  function captureForm(frame, form, via) {
    if (!heldFrames.has(frame) && !shouldIntercept(frame)) {
      note('frame-form-seen', `#${idOf(frame)} via ${via} ${describeForm(form)} (not held)`);
      return false;
    }
    const capture = {
      action: form.action,
      method: (form.method || 'get').toLowerCase(),
      // Values stay in memory only; they are the SDK's tokens.
      fields: [...form.elements].filter((element) => element.name).map((element) => [element.name, element.value]),
    };
    const state = heldFrames.get(frame);
    if (state) {
      state.form = capture;
      state.src = capture.action;
      state.link.href = capture.action;
    } else {
      const { reasons } = classifyFrame(frame, capture.action);
      placeHold(frame, { src: capture.action, form: capture, how: 'form submission intercepted', reasons });
    }
    note('frame-form-held', `#${idOf(frame)} via ${via} ${describeForm(form)}`);
    return true;
  }

  function instrument(frame, real) {
    if (!real || instrumented.has(frame)) return;
    instrumented.add(frame);
    note('frame-window', `#${idOf(frame)} first reached by the page`);
    let doc = null;
    try {
      doc = real.document;
    } catch {
      note('frame-window', `#${idOf(frame)} document not readable`);
      return;
    }
    if (!doc) return;

    try {
      const send = real.postMessage;
      real.postMessage = function patchedPostMessage(...args) {
        note('frame-message', `#${idOf(frame)} page -> frame`);
        return send.apply(this, args);
      };
    } catch {
      /* a window that refuses is still observed otherwise */
    }

    for (const method of ['open', 'write', 'writeln']) {
      const original = doc[method];
      if (typeof original !== 'function') continue;
      doc[method] = function patchedDocumentMethod(...args) {
        const size = method === 'open' ? '' : ` <${args.join('').length} chars>`;
        note(`frame-doc-${method}`, `#${idOf(frame)}${size}`);
        return original.apply(this, args);
      };
    }

    // submit() fires no event; the event covers requestSubmit() and a real button.
    const formProto = real.HTMLFormElement?.prototype;
    if (formProto?.submit) {
      const submit = formProto.submit;
      originalSubmits.set(frame, submit);
      formProto.submit = function patchedSubmit() {
        if (captureForm(frame, this, 'submit()')) return undefined;
        return submit.call(this);
      };
    }
    doc.addEventListener('submit', (event) => {
      if (event.target?.tagName === 'FORM' && captureForm(frame, event.target, 'submit event')) event.preventDefault();
    }, true);

    try {
      new real.MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue;
            const tag = node.tagName.toLowerCase();
            let detail = '';
            if (tag === 'form') detail = ` ${describeForm(node)}`;
            else if (tag === 'script') detail = node.src ? ` src=${redactUrl(node.src)}` : ` inline <${node.textContent.length} chars>`;
            else if (tag === 'iframe') detail = ` src=${redactUrl(node.getAttribute('src'))}`;
            note('frame-doc-added', `#${idOf(frame)} <${tag}>${detail}`);
          }
        }
      }).observe(doc, { childList: true, subtree: true });
    } catch {
      /* observation is a nicety */
    }

    real.addEventListener('pagehide', () => {
      note('frame-unload', `#${idOf(frame)} document replaced${heldFrames.has(frame) ? ' while held' : ''}`);
    }, { once: true });
  }

  /**
   * Hooks contentWindow and contentDocument on the iframe prototype, so the
   * frame is instrumented however early the page asks. Every frame gets its
   * real window; only a frame that should be held is instrumented first.
   */
  function hook() {
    if (hooked || !FRAME_PROTO || !ORIGINAL.contentWindow) return;
    hooked = true;
    Object.defineProperty(FRAME_PROTO, 'contentWindow', {
      configurable: true,
      enumerable: ORIGINAL.contentWindow.enumerable,
      get() {
        const real = ORIGINAL.contentWindow.get.call(this);
        if (real && shouldIntercept(this)) instrument(this, real);
        return real;
      },
    });
    if (ORIGINAL.contentDocument) {
      Object.defineProperty(FRAME_PROTO, 'contentDocument', {
        configurable: true,
        enumerable: ORIGINAL.contentDocument.enumerable,
        get() {
          if (shouldIntercept(this)) instrument(this, ORIGINAL.contentWindow.get.call(this));
          return ORIGINAL.contentDocument.get.call(this);
        },
      });
    }
  }

  function unhook() {
    if (!hooked) return;
    hooked = false;
    Object.defineProperty(FRAME_PROTO, 'contentWindow', ORIGINAL.contentWindow);
    if (ORIGINAL.contentDocument) Object.defineProperty(FRAME_PROTO, 'contentDocument', ORIGINAL.contentDocument);
  }

  function holdFrame(frame) {
    if (releasedFrames.has(frame)) return;
    const src = frame.getAttribute('src');
    const srcdoc = frame.getAttribute('srcdoc');
    const state = heldFrames.get(frame);

    const { player, reasons } = classifyFrame(frame, src);
    if (!player) {
      if (!decisions.has(frame)) {
        decide(frame, 'left alone: not a player', reasons);
        note('frame-ignored', `#${idOf(frame)} ${reasons.join(' ') || 'no signal'}`);
      }
      return;
    }
    if (inOwnDialog(frame)) {
      if (!decisions.has(frame)) decide(frame, 'left alone: own dialog', reasons);
      return;
    }
    const post = closestPost(frame);
    if (post && releasedPosts.has(post)) {
      if (!decisions.has(frame)) decide(frame, 'left alone: post recreates frames', reasons);
      return;
    }

    // No address to take away. Either the navigation hook will catch it, or it
    // was navigated before the guard saw it, which the report should say.
    if ((src == null || src === BLANK) && srcdoc == null) {
      if (!decisions.has(frame) && src == null) {
        const waiting = stillBlank(frame);
        decide(frame, waiting ? 'waiting: no address yet, navigation will be intercepted' : 'too late: navigated before it was seen', reasons);
        note(waiting ? 'frame-waiting' : 'frame-late', `#${idOf(frame)} ${reasons.join(' ')}`);
      }
      return;
    }

    if (state) {
      state.holds += 1;
      if (state.holds > MAX_HOLDS) {
        // The page keeps putting the address back. Each round loads part of the
        // player, so holding on would cost more data than it saves.
        log.warn('the page keeps reloading an embedded player; leaving it alone');
        release(frame, `address put back ${state.holds} times`);
        return;
      }
      if (src && src !== BLANK) {
        state.src = src;
        state.link.href = src;
      }
      if (srcdoc != null) state.srcdoc = srcdoc;
      note('frame-held', `#${idOf(frame)} again (${state.holds})`);
    } else {
      if (postRecreates(post)) {
        releasedPosts.add(post);
        log.warn('a post keeps creating new player frames; leaving them alone');
        note('post-released', `#${idOf(frame)} post recreates frames`);
        for (const held of decided) {
          if (heldFrames.has(held) && closestPost(held) === post) release(held, 'post recreates frames');
        }
        decide(frame, 'left alone: post recreates frames', reasons);
        return;
      }
      placeHold(frame, { src, srcdoc, how: 'address blanked', reasons });
    }
    if (srcdoc != null) frame.removeAttribute('srcdoc');
    frame.setAttribute('src', BLANK);
  }

  function holdFramesIn(root) {
    if (root.tagName === 'IFRAME') holdFrame(root);
    root.querySelectorAll?.('iframe').forEach(holdFrame);
  }

  function placeholders() {
    return [...document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)];
  }

  /**
   * Keeps every tile where it belongs. Engage may take the held frame away --
   * its player SDK, told nothing by a frame that never loaded, falls back to a
   * plain link -- and may re-render around the tile. The tile stays: the frame's
   * address is still known, and the click can rebuild the player from it.
   */
  function keepPlaceholders() {
    for (const tile of placeholders()) {
      const frame = frameOfPlaceholder.get(tile);
      if (!frame || !heldFrames.has(frame)) tile.remove();
    }
    for (const frame of decided) {
      const state = heldFrames.get(frame);
      if (!state || state.tile.isConnected) continue;
      if (frame.isConnected) {
        frame.after(state.tile);
      } else {
        const anchor = state.anchors.find((node) => node.isConnected);
        if (!anchor) {
          // The post itself was re-rendered; its new frame gets its own hold.
          heldFrames.delete(frame);
          decide(frame, 'dropped: frame, tile and post all gone');
          note('frame-dropped', `#${idOf(frame)} nothing left to anchor to`);
          continue;
        }
        anchor.append(state.tile);
      }
      note('tile-reanchored', `#${idOf(frame)}`);
    }
  }

  /** Puts every held frame back, for when the setting goes off. */
  function restoreFrames() {
    for (const tile of placeholders()) {
      const frame = frameOfPlaceholder.get(tile);
      if (frame && heldFrames.has(frame)) release(frame, 'setting off', { rebuild: false });
    }
    // Held again if the setting comes back on.
    for (const frame of decided) releasedFrames.delete(frame);
  }

  /**
   * Catches what no event reported: a video already running when the setting
   * came on, one in a shadow root, or a frame that arrived with its address.
   */
  function sweep() {
    for (const video of allVideos()) checkVideo(video);
    for (const frame of recorder.deepQueryAll('iframe')) holdFrame(frame);
    keepPlaceholders();
  }

  function listen() {
    if (listening) return;
    listening = true;
    hook();
    // Its own observer rather than onDomChanged, which is debounced: every
    // moment a new frame keeps its address is more of the player downloaded.
    frameObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target.tagName === 'IFRAME') holdFrame(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          holdFramesIn(node);
          if (node.tagName === 'VIDEO') checkVideo(node);
          else node.querySelectorAll?.('video').forEach(checkVideo);
        }
      }
    });
    frameObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcdoc'],
    });
    // Capture, because media events do not bubble and the player may stop the
    // propagation of its own clicks.
    document.addEventListener('play', onPlay, true);
    document.addEventListener('playing', onPlay, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    // Shadow roots and readable frames send no events here; a slow check does.
    ticker = setInterval(sweep, CHECK_INTERVAL_MS);
  }

  function unlisten() {
    if (!listening) return;
    listening = false;
    unhook();
    frameObserver?.disconnect();
    frameObserver = null;
    clearInterval(ticker);
    ticker = null;
    document.removeEventListener('play', onPlay, true);
    document.removeEventListener('playing', onPlay, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    lastGesture = null;
  }

  function apply() {
    if (settings.get('video.autoplay') === 'manual') {
      note('guard', 'on');
      listen();
      sweep();
    } else {
      // Nothing is resumed: Engage starts the next video as it normally would.
      note('guard', 'off');
      unlisten();
      restoreFrames();
    }
  }

  /** The kept form's shape: method, address shape, field names, and the keys of its embed JSON. */
  function describeKeptForm(form) {
    const names = form.fields.map(([name]) => name);
    let embedKeys = '';
    try {
      const embed = new URL(form.action).searchParams.get('embed');
      if (embed) embedKeys = `  embed-keys=[${Object.keys(JSON.parse(embed)).join(',')}]`;
    } catch {
      /* not JSON, or not there */
    }
    return `${form.method} ${redactUrl(form.action)}  fields=[${names.join(',')}]${embedKeys}`;
  }

  /** What the guard decided about each frame it saw, for the report. */
  function inspect() {
    const lines = [`mode: ${settings.get('video.autoplay')}   listening: ${listening}   navigation hook: ${hooked}`];
    lines.push(`videos held: ${counters.autoplaysHeld}   players kept from loading: ${counters.playersNotLoaded}`);
    for (const frame of decided) {
      if (!frame.isConnected && !heldFrames.has(frame)) {
        decided.delete(frame);
        continue;
      }
      const { decision, reasons } = decisions.get(frame);
      const state = heldFrames.get(frame);
      lines.push(
        `frame #${idOf(frame)}: ${decision}${reasons.length ? ` [${reasons.join(' ')}]` : ''}`
          + `${state ? `  holds=${state.holds} loads-by=${state.form ? 'form' : 'address'} tile-connected=${state.tile.isConnected} frame-connected=${frame.isConnected}` : ''}`
      );
      if (state?.form) lines.push(`    form: ${describeKeptForm(state.form)}`);
    }
    if (decided.size === 0) lines.push('no frame decided on yet');
    return lines;
  }

  return {
    start: apply,
    stop: unlisten,
    inspect,
    onSettingsChanged(changed) {
      if ('video.autoplay' in changed) apply();
    },
    onDomChanged() {
      if (listening) sweep();
    },
  };
}
