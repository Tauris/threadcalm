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
 * nowhere on the page. The `qa`/`y` classes are layout artefacts, so they are
 * only ever accepted together with a structural check (see `looksLikePost`).
 *
 * `.qaThreadReply` is the reply of the comment layout of late 2026, drawn as
 * a speech bubble beside the starter rather than nested in it. It holds its
 * own action row, body wrapper and translation control, but none of the other
 * names, so without it a reply resolved to whatever small element happened to
 * wrap its action row: its translation control then belonged to no post, and
 * automatic translation could not judge its language.
 */
export const POST_SELECTOR =
  '[role="article"], article, .qaThreadStarter, .qaThreadReply, .y-fixedGridColumn';

/** Semantic containers, which need no corroboration. */
const SEMANTIC_POST_SELECTOR = '[role="article"], article';

/**
 * The first post of a conversation. Unlike `.y-fixedGridColumn`, which also
 * marks layout columns, this class names exactly one thing, so it counts as a
 * post even without an action row inside it: on some pages the starter's row
 * is rendered outside it, and requiring one made the starter invisible to
 * "see more", the translation controls and copying.
 */
export const STARTER_SELECTOR = '.qaThreadStarter';

/** A reply of the speech-bubble layout; a post only with an action row inside. */
export const REPLY_SELECTOR = '.qaThreadReply';

/** Containers Engage names as posts, as opposed to `.y-fixedGridColumn`, which it also uses for layout. */
const NAMED_POST_SELECTOR = `${SEMANTIC_POST_SELECTOR}, ${STARTER_SELECTOR}, ${REPLY_SELECTOR}`;

/**
 * A class-matched candidate counts as a post only if it owns an action row --
 * except a thread starter, which is a post whatever it contains.
 */
function looksLikePost(element) {
  return element.querySelector(ACTION_ROW_SELECTOR) !== null || element.matches(STARTER_SELECTOR);
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
 * The wrapper around a post's body text. Its class carries a generated
 * suffix ("contentStateBodyTextWrapper-123"), hence the substring match.
 */
export const BODY_WRAPPER_SELECTOR = '[class*="contentStateBodyTextWrapper"]';

/**
 * Engage's inline text link: a real <button> whose only job is to look like a
 * link. "see more", "Show translation" and "Show original (…)" are all built
 * this way, in every interface language, and two shapes of it are known:
 *
 *   - the original wraps its label in a `span.y-fakeLink`; "see more" is still
 *     built so;
 *   - since November 2026 the translation control is a Fluent link,
 *     `button.fui-Link`, with the label as a bare text node and no inner span.
 *
 * `fui-Link` is the one Fluent class accepted anywhere in the script. Unlike
 * the hashed classes beside it (`f2hkw1w`, `f1k6fduh`…), which are build
 * output, it is the component's own name and changes with the library, not
 * with the build. It is still only ever accepted together with the position
 * checks below.
 *
 * A control that opens something (`aria-expanded`, `aria-haspopup`) is not one
 * of them -- the collapsed "Write a comment" box is also a link-styled button,
 * and carries `aria-expanded`. Nor is a counter: a label that starts with a
 * digit is "3 replies", however it is styled.
 */
const LEADING_DIGIT = /^\d/;

function isInlineLinkButton(element) {
  if (!(element instanceof HTMLButtonElement)) return false;
  if (element.hasAttribute('aria-expanded') || element.hasAttribute('aria-haspopup')) return false;
  if (element.closest(ACTION_ROW_SELECTOR) !== null) return false;
  const linkStyled =
    element.querySelector(':scope > .y-fakeLink') !== null || element.classList.contains('fui-Link');
  if (!linkStyled) return false;
  return !LEADING_DIGIT.test(normalizeText(visibleText(element)));
}

/** The post's own elements matching `selector`, not those of nested replies. */
function ownOf(post, selector) {
  return [...post.querySelectorAll(selector)].filter((element) => closestPost(element) === post);
}

/**
 * A post's "see more", recognised without reading it: an inline link button
 * inside the post's body wrapper.
 *
 * After it is clicked the same button reads "see less", which this cannot
 * tell apart -- so callers must click it at most once per post.
 */
export function isBodyLinkButton(element) {
  return (
    isInlineLinkButton(element) &&
    element.closest(BODY_WRAPPER_SELECTOR) !== null &&
    closestPost(element) !== null
  );
}

/**
 * A post's "Show translation" or "Show original (…)", recognised without
 * reading it: an inline link button below the post's body and above its
 * action row, outside the body itself. Observed so in English, Japanese and
 * Portuguese, on feed and conversation posts alike, and in both shapes of
 * the link button. The control may carry no label at all -- an icon --
 * and is still recognised here.
 */
export function isTranslationLinkButton(element) {
  if (!isInlineLinkButton(element) || element.closest(BODY_WRAPPER_SELECTOR)) return false;
  const post = closestPost(element);
  if (!post) return false;
  const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const bodies = ownOf(post, BODY_WRAPPER_SELECTOR);
  const rows = ownOf(post, ACTION_ROW_SELECTOR);
  // A starter may have no action row of its own; then below the body is enough.
  return (
    bodies.some((body) => follows(body, element)) &&
    (rows.length === 0 || rows.some((row) => follows(element, row)))
  );
}

/**
 * The posts nested inside a post: replies in the layout that nests them, and
 * nothing in the layout that does not.
 *
 * `.y-fixedGridColumn` is the catch: Engage uses it both for a nested reply
 * and, in the speech-bubble layout of late 2026, for plain layout columns
 * inside a post -- one around the body, one around the action row. Taking
 * every match for a nested reply there stripped the body out of every copied
 * post and left the author lines standing alone. So a column counts as a
 * nested post only when it owns an action row the post does not need for
 * itself: some of the post's rows inside it, but not all of them. Containers
 * Engage names as posts count regardless.
 */
export function nestedPosts(post) {
  if (!(post instanceof HTMLElement)) return [];
  const rows = [...post.querySelectorAll(ACTION_ROW_SELECTOR)];
  return [...post.querySelectorAll(POST_SELECTOR)].filter((candidate) => {
    if (candidate.matches(NAMED_POST_SELECTOR)) return true;
    const inside = rows.filter((row) => candidate.contains(row)).length;
    return inside > 0 && inside < rows.length;
  });
}

/** How far above its action row a post's container may sit. */
const CONTAINER_CLIMB = 12;

/**
 * The post that owns a given action row.
 *
 * Climbs to the nearest recognised container. When that is an anonymous
 * column, the climb goes on to a container Engage names, as long as it holds
 * no action rows beyond the column's own: in the speech-bubble layout the
 * reply's row sits in a column inside the `.qaThreadReply`, and the reply, not
 * the column, is the post -- the column has no body in it. In the layout that
 * nests replies, the starter above a reply's column holds its own row too, so
 * the column stays the post. Falls back to the row's parent so that an
 * unrecognised layout still yields *something* postlike rather than nothing.
 */
export function postContainerFor(actionRow) {
  if (!(actionRow instanceof HTMLElement)) return null;
  let node = actionRow.parentElement;
  let found = null;
  for (let depth = 0; node && depth < CONTAINER_CLIMB; depth += 1) {
    if (node.matches(POST_SELECTOR)) {
      if (!found) {
        if (node.matches(NAMED_POST_SELECTOR)) return node;
        found = node;
      } else if (node.matches(NAMED_POST_SELECTOR)) {
        const rowsInFound = found.querySelectorAll(ACTION_ROW_SELECTOR).length;
        return node.querySelectorAll(ACTION_ROW_SELECTOR).length === rowsInFound ? node : found;
      }
    }
    node = node.parentElement;
  }
  return found ?? actionRow.parentElement;
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

  // A starter whose action row is rendered outside it is found by no row.
  let added = false;
  for (const starter of root.querySelectorAll(STARTER_SELECTOR)) {
    if (seen.has(starter) || starter.querySelector(ACTION_ROW_SELECTOR) || !isVisible(starter)) continue;
    // Not if it wraps posts already found (then it is a layout column), nor if
    // one of them already wraps it (then it is represented).
    if (posts.some((post) => starter.contains(post) || post.contains(starter))) continue;
    seen.add(starter);
    posts.push(starter);
    added = true;
  }
  if (added) {
    posts.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
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
