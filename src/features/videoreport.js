/**
 * Watching how video appears on the page, and describing it without its content.
 *
 * Engage's player cannot be inspected from outside a tenant, and the people who
 * can see it are not the people who can read the code. This module is the bridge:
 * it keeps a light record of every frame and video the page shows, what happened
 * to each, and builds a report that says how the player is built -- tags, roles,
 * attributes, sizes, timings -- and nothing about what it shows. Addresses are
 * reduced to their shape, text is never read, and ids and names are replaced by
 * their lengths, so the report can be pasted into an issue as it is.
 *
 * The recorder is always on and deliberately cheap: a capture-phase listener for
 * media events, an attribute observer per frame, and an inventory on each
 * reported DOM change. Shadow roots are tracked by wrapping attachShadow, so
 * a player hidden in one is found even when it is closed.
 */
import { closestPost } from '../core/dom.js';

const MAX_EVENTS = 150;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path segments that name a product's structure rather than a tenant's content. */
const STRUCTURAL_SEGMENT =
  /^(_layouts|_api|_vti_bin|\d{1,3}|embed(\.aspx)?|stream(\.aspx)?|video(player)?|player|sites|teams|personal|portals|hub|media|viewer|preview|files?|api|v\d+|embed-player|onedrive|index\.html?)$/i;

/** Hosts that are the product's own, so they carry no tenant. */
const PUBLIC_HOST =
  /(^|\.)(cloud\.microsoft|yammer\.com|microsoft\.com|office\.com|office\.net|live\.com|azureedge\.net|akamaihd\.net)$/i;

/** Reduces a host to its product: `tenant-my.sharepoint.com` -> `*.sharepoint.com`. */
export function redactHost(host) {
  if (!host) return '(none)';
  const labels = host.toLowerCase().split('.');
  if (labels.length <= 2 || PUBLIC_HOST.test(host)) return host.toLowerCase();
  return `*.${labels.slice(-2).join('.')} (${labels.length} labels)`;
}

function valueShape(value) {
  if (value === '') return '<empty>';
  if (UUID.test(value)) return '<uuid>';
  if (/^\d+$/.test(value)) return '<number>';
  if (/^(true|false|1|0|yes|no)$/i.test(value)) return value.toLowerCase();
  return `<${value.length} chars>`;
}

/** The shape of an address: scheme, product host, structural path, parameter names. */
export function redactUrl(raw) {
  if (raw == null || raw === '') return '(none)';
  if (raw === 'about:blank') return 'about:blank';
  if (raw.startsWith('blob:')) return 'blob:<redacted>';
  if (raw.startsWith('data:')) return `data:${raw.slice(5, 40).split(/[;,]/)[0] || '<unknown>'}`;
  if (raw.startsWith('javascript:')) return 'javascript:<redacted>';
  let url;
  try {
    url = new URL(raw, document.baseURI);
  } catch {
    return `<unparseable, ${raw.length} chars>`;
  }
  const path = url.pathname
    .split('/')
    .map((segment) => (segment === '' || STRUCTURAL_SEGMENT.test(segment) ? segment : '~'))
    .join('/');
  const params = [...url.searchParams.entries()].map(([key, value]) => `${key}=${valueShape(value)}`);
  const hash = url.hash ? ` #<${url.hash.length - 1} chars>` : '';
  const query = params.length ? `?${params.join('&')}` : '';
  return `${url.protocol}//${redactHost(url.hostname)}${path}${query}${hash}`;
}

/** Class tokens, long generated ones shortened. */
function classSummary(element) {
  const tokens = [...(element.classList ?? [])];
  if (tokens.length === 0) return '';
  const shown = tokens.slice(0, 6).map((token) => (token.length > 28 ? `${token.slice(0, 12)}…` : token));
  return `.${shown.join('.')}${tokens.length > 6 ? ` (+${tokens.length - 6})` : ''}`;
}

/** Attribute names, with values only where they cannot carry content. */
const SAFE_ATTRIBUTES = new Set([
  'allow', 'sandbox', 'loading', 'referrerpolicy', 'allowfullscreen', 'frameborder', 'scrolling',
  'width', 'height', 'role', 'tabindex', 'hidden', 'muted', 'autoplay', 'loop', 'controls',
  'playsinline', 'preload', 'crossorigin', 'type', 'aria-hidden', 'aria-modal', 'data-testid',
  'data-automationid',
]);

function attributeSummary(element) {
  return [...element.attributes]
    .map(({ name, value }) => {
      if (name === 'src' || name === 'poster' || name === 'href') return `${name}=${redactUrl(value)}`;
      if (name === 'srcdoc') return `srcdoc=<${value.length} chars>`;
      if (name === 'class') return `class=${element.classList.length} tokens`;
      if (name === 'style') return `style=<${value.length} chars>`;
      if (SAFE_ATTRIBUTES.has(name) && /^[\w\s;*'"().:/-]{0,160}$/.test(value)) return `${name}="${value}"`;
      return `${name}=<${value.length} chars>`;
    })
    .join('  ');
}

function rectOf(element) {
  try {
    const rect = element.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.left)},${Math.round(rect.top)}`;
  } catch {
    return '?';
  }
}

function inViewport(element) {
  try {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  } catch {
    return false;
  }
}

/** One line for an element: structure only. */
function describeElement(element, { post, shadowHost = false } = {}) {
  const parts = [element.tagName.toLowerCase()];
  const role = element.getAttribute('role');
  if (role) parts.push(`role=${role}`);
  for (const name of ['data-testid', 'data-automationid']) {
    const value = element.getAttribute(name);
    if (value) parts.push(`${name}=${/^[\w.-]{1,48}$/.test(value) ? value : `<${value.length} chars>`}`);
  }
  const classes = classSummary(element);
  if (classes) parts.push(classes);
  if (element.id) parts.push(`id=<${element.id.length} chars>`);
  if (shadowHost || element.shadowRoot) parts.push('[shadow host]');
  if (element === post) parts.push('[post]');
  if (element.matches?.('[role="dialog"]')) parts.push('[dialog]');
  try {
    parts.push(`display:${getComputedStyle(element).display}`);
  } catch {
    /* detached */
  }
  parts.push(rectOf(element));
  return parts.join('  ');
}

/** The element and its ancestors, crossing shadow boundaries through the host. */
function ancestorLines(element, { limit = 14 } = {}) {
  const post = closestPost(element);
  const lines = [];
  let node = element;
  let shadowHost = false;
  for (let depth = 0; node && depth < limit; depth += 1) {
    const indent = '  '.repeat(Math.min(depth, 8));
    lines.push(`${indent}${describeElement(node, { post, shadowHost })}`);
    if (node === document.body) break;
    const parent = node.parentNode;
    // A closed root's host does not say so itself; crossing it does.
    shadowHost = Boolean(parent && !(parent instanceof Element) && parent.host);
    if (shadowHost) {
      lines.push(`${indent}  -- shadow root boundary --`);
      node = parent.host;
    } else {
      node = node.parentElement;
    }
  }
  return lines;
}

function sameOriginState(frame) {
  try {
    const doc = frame.contentDocument;
    if (!doc) return 'no (blocked)';
    return `yes (${doc.querySelectorAll('video').length} videos inside)`;
  } catch {
    return 'no (blocked)';
  }
}

const ALLOWS_AUTOPLAY = /(^|;)\s*autoplay(\s|$)/i;

export function createVideoRecorder() {
  const startedAt = Date.now();
  const events = [];
  const ids = new WeakMap();
  let nextId = 1;
  const seen = new Set();
  const frameObservers = new WeakMap();
  const shadowRoots = new WeakMap();
  const shadowHosts = new Set();
  let listening = false;
  let unpatchShadow = null;

  function idOf(node) {
    if (!ids.has(node)) ids.set(node, nextId++);
    return ids.get(node);
  }

  function elapsed() {
    return ((Date.now() - startedAt) / 1000).toFixed(1).padStart(7);
  }

  /**
   * Records one fact. Callers pass only structure, never content. The same
   * fact repeated -- a page polling a frame ten times a second -- becomes one
   * line with a count, so it cannot push everything else out of the timeline.
   */
  function note(kind, detail = '') {
    const last = events[events.length - 1];
    if (last && last.kind === kind && last.detail === detail) {
      last.count += 1;
      last.until = elapsed();
      return;
    }
    events.push({ at: elapsed(), kind, detail, count: 1, until: null });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  }

  function formatEvent({ at, kind, detail, count, until }) {
    const repeat = count > 1 ? `   x${count}, until ${until.trim()}s` : '';
    return `${at}s  ${kind.padEnd(14)} ${detail}${repeat}`;
  }

  // ---------------------------------------------------------- shadow roots --

  function patchAttachShadow() {
    const proto = globalThis.Element?.prototype;
    if (!proto?.attachShadow || proto.attachShadow.__threadcalmPatched) return;
    const original = proto.attachShadow;
    const wrapped = function patchedAttachShadow(init) {
      const root = original.call(this, init);
      try {
        shadowRoots.set(this, root);
        shadowHosts.add(this);
        note('shadow', `attached (${init?.mode ?? '?'}) on ${this.tagName.toLowerCase()}`);
      } catch {
        /* never let bookkeeping break the page */
      }
      return root;
    };
    wrapped.__threadcalmPatched = true;
    proto.attachShadow = wrapped;
    unpatchShadow = () => {
      if (proto.attachShadow === wrapped) proto.attachShadow = original;
    };
  }

  /** Open roots already on the page when the script started. One pass, once. */
  function scanExistingShadowRoots() {
    let found = 0;
    for (const element of document.getElementsByTagName('*')) {
      if (element.shadowRoot) {
        shadowRoots.set(element, element.shadowRoot);
        shadowHosts.add(element);
        found += 1;
      }
    }
    if (found) note('shadow', `${found} open root(s) already present`);
  }

  function mediaRoots() {
    const roots = [document];
    for (const host of shadowHosts) {
      if (!host.isConnected) {
        shadowHosts.delete(host);
        continue;
      }
      const root = shadowRoots.get(host);
      if (root) roots.push(root);
    }
    return roots;
  }

  function deepQueryAll(selector) {
    const result = [];
    for (const root of mediaRoots()) result.push(...root.querySelectorAll(selector));
    return result;
  }

  // ------------------------------------------------------------- tracking --

  function frameSummary(frame) {
    return `src=${redactUrl(frame.getAttribute('src'))} allow="${frame.getAttribute('allow') ?? ''}"`
      + `${frame.hasAttribute('srcdoc') ? ' srcdoc' : ''}${closestPost(frame) ? ' in-post' : ''}`
      + `${frame.closest('[role="dialog"]') ? ' in-dialog' : ''} ${rectOf(frame)}`;
  }

  function videoSummary(video) {
    return `muted=${video.muted} autoplay-attr=${video.hasAttribute('autoplay')} paused=${video.paused}`
      + ` ready=${video.readyState} preload=${video.preload || '(default)'}`
      + ` src=${redactUrl(video.currentSrc || video.getAttribute('src'))}`
      + `${video.getRootNode() !== document ? ' in-shadow' : ''}${closestPost(video) ? ' in-post' : ''} ${rectOf(video)}`;
  }

  function track(frame) {
    if (frameObservers.has(frame)) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const name = record.attributeName;
        const value = frame.getAttribute(name);
        let shown = `"${value ?? ''}"`;
        if (name === 'src') shown = redactUrl(value);
        if (name === 'srcdoc') shown = `<${value?.length ?? 0} chars>`;
        note('frame-attr', `#${idOf(frame)} ${name} -> ${shown}`);
      }
    });
    observer.observe(frame, { attributes: true, attributeFilter: ['src', 'srcdoc', 'allow', 'sandbox'] });
    frameObservers.set(frame, observer);
  }

  function inventory() {
    for (const node of seen) {
      if (!node.isConnected) {
        note(node.tagName === 'IFRAME' ? 'frame-removed' : 'video-removed', `#${idOf(node)}`);
        seen.delete(node);
        frameObservers.get(node)?.disconnect();
        frameObservers.delete(node);
      }
    }
    for (const frame of deepQueryAll('iframe')) {
      if (seen.has(frame)) continue;
      seen.add(frame);
      note('frame-added', `#${idOf(frame)} ${frameSummary(frame)}`);
      track(frame);
    }
    for (const video of deepQueryAll('video')) {
      if (seen.has(video)) continue;
      seen.add(video);
      note('video-added', `#${idOf(video)} ${videoSummary(video)}`);
    }
  }

  function onMediaEvent(event) {
    const video = event.target;
    if (video?.tagName !== 'VIDEO') return;
    note(`video-${event.type}`, `#${idOf(video)} muted=${video.muted} ready=${video.readyState} t=${(video.currentTime ?? 0).toFixed(1)}`);
  }

  const MEDIA_EVENTS = ['loadstart', 'play', 'playing', 'pause'];

  function start() {
    if (listening) return;
    listening = true;
    patchAttachShadow();
    scanExistingShadowRoots();
    for (const type of MEDIA_EVENTS) document.addEventListener(type, onMediaEvent, true);
    note('page', `top-window=${window.top === window.self} visibility=${document.visibilityState}`);
    inventory();
  }

  function stop() {
    if (!listening) return;
    listening = false;
    for (const type of MEDIA_EVENTS) document.removeEventListener(type, onMediaEvent, true);
    for (const node of seen) frameObservers.get(node)?.disconnect();
    seen.clear();
    unpatchShadow?.();
  }

  // --------------------------------------------------------------- report --

  /**
   * The whole picture, for pasting into an issue: page facts, every frame and
   * video with its ancestry, what the guard decided, and the timeline.
   */
  function report({ header = [], setting = '?', guard = [] } = {}) {
    inventory();
    const frames = deepQueryAll('iframe');
    const videos = deepQueryAll('video');
    const connection = navigator.connection;
    let reducedMotion = '?';
    try {
      reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* not every environment has matchMedia */
    }
    const lines = [
      ...header,
      '',
      'video report -- structure only, no content',
      `  setting video.autoplay: ${setting}`,
      `  top window: ${window.top === window.self}   visibility: ${document.visibilityState}`,
      `  viewport: ${innerWidth}x${innerHeight}   reduced motion: ${reducedMotion}`,
      `  connection: ${connection ? `${connection.effectiveType ?? '?'} saveData=${connection.saveData}` : 'not reported'}`,
      `  shadow roots tracked: ${mediaRoots().length - 1}`,
      `  frames: ${frames.length}   videos: ${videos.length}`
        + `   autoplay-allowed frames: ${frames.filter((f) => ALLOWS_AUTOPLAY.test(f.getAttribute('allow') ?? '')).length}`,
    ];

    if (guard.length) lines.push('', 'guard:', ...guard.map((line) => `  ${line}`));

    lines.push('', `frames (${frames.length}):`);
    for (const frame of frames) {
      lines.push(
        `  #${idOf(frame)}  ${frame.getAttribute('src') == null ? 'no src' : redactUrl(frame.getAttribute('src'))}`,
        `      attrs: ${attributeSummary(frame) || '(none)'}`,
        `      same-origin readable: ${sameOriginState(frame)}   in viewport: ${inViewport(frame)}`
          + `   in post: ${Boolean(closestPost(frame))}   in dialog: ${Boolean(frame.closest('[role="dialog"]'))}`,
        '      ancestry:',
        ...ancestorLines(frame).map((line) => `        ${line}`),
      );
    }

    lines.push('', `videos (${videos.length}):`);
    for (const video of videos) {
      lines.push(
        `  #${idOf(video)}  ${videoSummary(video)}`,
        `      attrs: ${attributeSummary(video) || '(none)'}`,
        `      sources: ${video.querySelectorAll('source').length}   poster: ${video.hasAttribute('poster')}`
          + `   network: ${video.networkState}   in viewport: ${inViewport(video)}`,
        '      ancestry:',
        ...ancestorLines(video).map((line) => `        ${line}`),
      );
    }

    lines.push('', `timeline (${events.length} entries, seconds since the script started):`);
    lines.push(...events.map((event) => `  ${formatEvent(event)}`));
    lines.push('', '(end of video report)');
    return lines.join('\n');
  }

  return {
    start,
    stop,
    onDomChanged: inventory,
    note,
    idOf,
    track,
    mediaRoots,
    deepQueryAll,
    report,
  };
}
