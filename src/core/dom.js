/**
 * DOM helpers shared by every feature.
 *
 * Viva Engage is a React app whose class names (`fui-Text`, `fui-Button`…) are
 * build artefacts and change without notice. Nothing in here may depend on
 * them: matching is done on text, ARIA attributes, roles and structure.
 */

/** Attributes that can carry an element's accessible or automation name. */
const TEXT_ATTRIBUTES = [
  'aria-label',
  'title',
  'data-testid',
  'data-automation-id',
  'data-track-name',
];

import { counters } from './stats.js';

const WHITESPACE = /\s+/g;

/** Collapses whitespace and trims, the form every matcher expects. */
export function normalizeText(value) {
  return String(value ?? '').replace(WHITESPACE, ' ').trim();
}

/**
 * The rendered text of an element.
 *
 * `innerText` is preferred over `textContent` because it respects
 * `display:none` and so does not pick up hidden sibling labels. It is absent
 * in jsdom, which has no layout engine, so the tests fall back to
 * `textContent` — that difference only ever makes matching more eager, never
 * less, so a passing test still means the browser path matches too.
 */
export function visibleText(element) {
  if (!element) return '';
  return element.innerText ?? element.textContent ?? '';
}

/**
 * How much raw text an element may hold before its rendered text is worth
 * computing, as a multiple of the caller's label limit.
 *
 * `textContent` is free; `innerText` flushes layout. The two differ only by
 * what is hidden, so an element carrying ten times more raw text than a label
 * could possibly be is prose, and asking the browser to lay it out to discover
 * that costs a reflow for nothing.
 */
const RAW_TEXT_BUDGET = 10;

/**
 * All strings that could reasonably name an element, cheapest first.
 *
 * `maxLength` is the longest label the caller will accept. Passing it lets the
 * cheap check run first and skip the expensive one entirely, which on a long
 * feed is the difference between a handful of reflows per scan and one per
 * element -- every span in the document, several times a second.
 *
 * @param {Element} element
 * @param {object} [options]
 * @param {number} [options.maxLength] longest label worth reading
 */
export function accessibleTexts(element, { maxLength = Infinity } = {}) {
  if (!(element instanceof HTMLElement)) return [];

  const texts = [];
  const budget = maxLength * RAW_TEXT_BUDGET;
  if (!Number.isFinite(budget) || (element.textContent?.length ?? 0) <= budget) {
    counters.layoutReads += 1;
    texts.push(visibleText(element));
  } else {
    counters.layoutSkips += 1;
  }

  for (const attribute of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) texts.push(value);
  }

  const named = texts.filter(Boolean).map(normalizeText).filter((text) => text.length > 0);
  return Number.isFinite(maxLength)
    ? named.filter((text) => text.length <= maxLength)
    : named;
}

/** True when the element occupies space and is not hidden from assistive tech. */
export function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/**
 * True when an element contains an inline icon whose path data starts with one
 * of the given signatures.
 *
 * This is the one place the script looks at how Engage is built rather than at
 * what it says, and the exception is deliberate: the reply glyph is identical
 * in every interface language, so it finds a reply counter in a locale no
 * label pack covers. Path data is still build output, which is why the
 * signatures are a setting rather than a constant — and why a stale one
 * degrades to "no match", never to a wrong click.
 */
export function hasIconSignature(element, signatures) {
  if (!(element instanceof HTMLElement) || !signatures?.length) return false;
  for (const path of element.querySelectorAll('svg path')) {
    const data = path.getAttribute('d');
    if (!data) continue;
    if (signatures.some((signature) => signature && data.startsWith(signature))) return true;
  }
  return false;
}

const INTERACTIVE_SELECTOR =
  'button, [role="button"], a[href], [role="link"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';

/**
 * Finds the element that actually receives the click.
 *
 * Engage often renders the visible label as a `<span>` inside the real button.
 * Clicking the span happens to work today because React listens at the root,
 * but that is not guaranteed, so prefer a genuine interactive ancestor and
 * fall back to the element itself.
 *
 * @param {Element} element
 * @param {Element|Document} [boundary] stop climbing at this node
 */
export function nearestClickable(element, boundary) {
  if (!(element instanceof HTMLElement)) return null;
  if (element.matches(INTERACTIVE_SELECTOR)) return element;

  let node = element.parentElement;
  let depth = 0;
  while (node && depth < 6) {
    if (boundary && node === boundary) break;
    if (node.matches(INTERACTIVE_SELECTOR)) return node;
    node = node.parentElement;
    depth += 1;
  }
  return element;
}

/**
 * The action row under a post: Like, Comment/Reply, Share, More actions.
 *
 * A real test id, and the most stable handle on the page after the ARIA
 * landmarks — worth far more than any class name here.
 */
export const ACTION_ROW_SELECTOR = '[data-testid="overflow-set"]';

/**
 * Post/comment containers, best signal first.
 *
 * `[role="article"]` is listed first because it is semantic and would survive
 * a redesign, but it must not be relied on alone: layouts exist that use it
 * nowhere on the page. The two `qa`/`y` classes are layout artefacts, so they
 * are only ever accepted together with a structural check (see
 * `looksLikePost`).
 */
export const POST_SELECTOR =
  '[role="article"], article, .qaThreadStarter, .y-fixedGridColumn';

/** Semantic containers, which need no corroboration. */
const SEMANTIC_POST_SELECTOR = '[role="article"], article';

/** A class-matched candidate counts as a post only if it owns an action row. */
function looksLikePost(element) {
  return element.querySelector(ACTION_ROW_SELECTOR) !== null;
}

/** The post/comment container an element belongs to. */
export function closestPost(element) {
  if (!(element instanceof HTMLElement)) return null;

  const semantic = element.closest(SEMANTIC_POST_SELECTOR);
  if (semantic) return semantic;

  let candidate = element.closest(POST_SELECTOR);
  while (candidate) {
    if (looksLikePost(candidate)) return candidate;
    candidate = candidate.parentElement?.closest(POST_SELECTOR) ?? null;
  }
  return null;
}

/**
 * The post that owns a given action row.
 *
 * Climbs to the nearest recognised container, and falls back to the row's
 * parent so that an unrecognised layout still yields *something* postlike
 * rather than nothing at all.
 */
export function postContainerFor(actionRow) {
  if (!(actionRow instanceof HTMLElement)) return null;
  let node = actionRow.parentElement;
  let depth = 0;
  while (node && depth < 8) {
    if (node.matches(POST_SELECTOR)) return node;
    node = node.parentElement;
    depth += 1;
  }
  return actionRow.parentElement;
}

/**
 * Every post container currently in the DOM, in document order.
 *
 * Two strategies, because the markup varies. If the page exposes semantic
 * articles, they are authoritative. Otherwise posts are derived from action
 * rows: every visible post and comment has exactly one, which makes "one post
 * per action row" a more dependable rule than any class name.
 */
export function allPosts(root = document) {
  const semantic = [...root.querySelectorAll(SEMANTIC_POST_SELECTOR)].filter(isVisible);
  if (semantic.length > 0) return semantic;

  const seen = new Set();
  const posts = [];
  for (const row of root.querySelectorAll(ACTION_ROW_SELECTOR)) {
    const post = postContainerFor(row);
    if (!post || seen.has(post) || !isVisible(post)) continue;
    seen.add(post);
    posts.push(post);
  }
  return posts;
}

/**
 * Outermost posts only.
 *
 * Where replies are nested inside their parent, this yields the conversation
 * rather than each comment; where they are siblings, it yields all of them.
 * Either way the features that navigate, copy and highlight get whole units.
 */
export function rootPosts(root = document) {
  const posts = allPosts(root);
  return posts.filter((post) => !posts.some((other) => other !== post && other.contains(post)));
}

/** Trailing-edge debounce that keeps the newest arguments. */
export function debounce(fn, waitMs) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

/** Promise-based sleep, used to let Engage re-render between click batches. */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Creates an element with attributes, dataset entries and children in one call. */
export function el(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  const { className, text, html, dataset, style, on, ...attributes } = options;

  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  if (html != null) node.innerHTML = html;
  if (dataset) Object.assign(node.dataset, dataset);
  if (style) Object.assign(node.style, style);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value == null) continue;
    node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const [event, handler] of Object.entries(on ?? {})) {
    node.addEventListener(event, handler);
  }
  node.append(...children.filter((child) => child != null));
  return node;
}

/** True while the user is typing, so shortcuts must not fire. */
export function isEditingContext(target = document.activeElement) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}
