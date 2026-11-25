/**
 * The link buttons on the page, described without their content.
 *
 * Part of the layout diagnostics. Engage's "see more" and translation
 * controls are recognised by wording first and by position second
 * (core/dom.js); when one is missed on a tenant that cannot be inspected from
 * outside, the question is always the same -- what does it say, where does it
 * sit, and which of the checks said no? This answers that for every
 * link-styled button, the unrecognised ones first, with labels reduced to
 * their length and ancestors to their shape.
 *
 * What is kept of an ancestor: its tag, role, test id, and the handful of
 * layout classes the script itself relies on or might (`qa…`, `y-…`, and
 * Fluent component names such as `fui-Link`). Hashed Fluent classes, ids,
 * text, titles and addresses are dropped.
 */
import {
  ACTION_ROW_SELECTOR,
  BODY_WRAPPER_SELECTOR,
  POST_SELECTOR,
  accessibleTexts,
  closestPost,
  isBodyLinkButton,
  isTranslationLinkButton,
  nestedPosts,
  normalizeText,
  rootPosts,
  visibleText,
} from '../core/dom.js';
import { countPosts, extractPost, extractThread, threadMembers } from './thread.js';

/** Which link buttons are listed: both shapes Engage has used. */
export const LINK_BUTTON_SELECTOR = 'button.fui-Link, button > .y-fakeLink';

/** How many buttons a report describes in full; the rest are counted. */
export const MAX_DESCRIBED = 12;

/** How far up an ancestor chain goes. */
const MAX_DEPTH = 10;

/** How far up the search for the nearest named container goes. */
const MARKER_DEPTH = 40;

/** Engage's own test markers: `qaThreadStarter`, `qaThreadReply`, `qaContentMainColumn`… */
const QA_CLASS = /^qa[A-Z]/;

/** Layout classes worth keeping: Engage's own markers and Fluent component names. */
const KEPT_CLASS = /^(?:qa[A-Z]|y-|fui-[A-Z]|tc-)/;

const MAX_LABEL_LENGTH = 40;

/** A compact, content-free sketch of one element. */
export function sketch(node) {
  if (!node || node.nodeType !== 1) return '?';
  let text = node.tagName.toLowerCase();
  const classes = [...node.classList]
    .filter((name) => KEPT_CLASS.test(name))
    .map((name) => name.replace(/-\d+$/, '-N'));
  // The body wrapper's class carries a generated suffix and no marker prefix.
  if (node.matches(BODY_WRAPPER_SELECTOR)) classes.push('contentStateBodyTextWrapper-N');
  if (classes.length) text += `.${classes.join('.')}`;
  const role = node.getAttribute('role');
  if (role) text += `[role=${role}]`;
  const testId = node.getAttribute('data-testid');
  if (testId) text += `[data-testid=${testId}]`;
  for (const attribute of ['aria-expanded', 'aria-haspopup', 'aria-hidden', 'hidden', 'disabled']) {
    if (node.hasAttribute(attribute)) text += `[${attribute}]`;
  }
  return text;
}

/** The element's ancestors, nearest first, as sketches joined by " < ". */
export function ancestry(node, { depth = MAX_DEPTH, root = document } = {}) {
  const parts = [];
  let current = node.parentElement;
  for (let level = 0; current && level < depth; level += 1) {
    let part = sketch(current);
    if (current.matches('[role="article"], article, .qaThreadStarter, .y-fixedGridColumn')) {
      part += closestPost(current) === current ? '[post]' : '[post-class, not a post]';
    }
    if (current === root.body || current === root.documentElement) part += '[root]';
    parts.push(`${part}{${current.children.length}}`);
    current = current.parentElement;
  }
  return parts.join(' < ');
}

/**
 * The nearest ancestor Engage has named: a `qa…` class, a semantic article or
 * a test id. Where the ten-level chain shows only anonymous divs, this says
 * what the button ultimately sits in, and how far up.
 */
export function nearestMarker(node) {
  let current = node.parentElement;
  for (let level = 1; current && level <= MARKER_DEPTH; level += 1) {
    const named =
      [...current.classList].some((name) => QA_CLASS.test(name)) ||
      current.matches('[role="article"], article, [data-testid]');
    if (named) return `${sketch(current)} (${level} up)`;
    current = current.parentElement;
  }
  return 'none';
}

/**
 * The shape of a label without its words: letters become `a` or `A`, digits
 * `9`, and anything else stays. "Show translation" is "Aaaa aaaaaaaaaaa"; a
 * globe drawn as a character shows as itself. Word lengths and case are what
 * tells a known control under an unknown wording from a stray link.
 */
export function labelShape(label) {
  return label.replace(/[\p{L}\p{N}]/gu, (character) => {
    if (/\p{N}/u.test(character)) return '9';
    return /\p{Lu}/u.test(character) ? 'A' : 'a';
  });
}

/** Attribute names a button carries, without values; class and style say nothing here. */
function attributeNames(element) {
  return [...element.attributes]
    .map((attribute) => attribute.name)
    .filter((name) => name !== 'class' && name !== 'style')
    .join(',');
}

/** The button's direct children, sketched, with their own child counts. */
function childSketches(element) {
  const children = [...element.children].slice(0, 4).map((child) => `${sketch(child)}{${child.children.length}}`);
  if (element.children.length > 4) children.push(`+${element.children.length - 4}`);
  return children.length ? children.join(', ') : '(text only)';
}

/** The button a `.y-fakeLink` sits in, or the button itself. */
function buttonOf(element) {
  return element.tagName === 'BUTTON' ? element : element.parentElement;
}

/**
 * What the label packs make of a label: the first family that matches.
 * @returns {'translate'|'original'|'see more'|'counter'|'pagination'|'menu'|'none'}
 */
export function wordingOf(texts, matchers) {
  if (!matchers || texts.length === 0) return 'none';
  const families = [
    ['original', matchers.showOriginal],
    ['translate', matchers.translate],
    ['see more', matchers.expandText],
    ['counter', matchers.replyCount],
    ['pagination', matchers.expandReplies],
    ['menu', matchers.menu],
  ];
  for (const [name, pattern] of families) {
    if (pattern && texts.some((text) => pattern.test(text))) return name;
  }
  return 'none';
}

function markerOf(button) {
  const parts = [];
  if (button.dataset.tcTranslate) parts.push(button.dataset.tcTranslate);
  if (button.classList.contains('tc-translate-compact')) parts.push('[compacted]');
  if (button.classList.contains('tc-translate-hidden')) parts.push('[hidden]');
  return parts.length ? parts.join(' ') : 'none';
}

/** One button, fully described. */
export function describeLinkButton(button, { matchers, root = document } = {}) {
  const shape = [
    button.classList.contains('fui-Link') ? 'fui-Link' : '',
    button.querySelector(':scope > .y-fakeLink') ? 'y-fakeLink' : '',
  ].filter(Boolean).join('+') || 'plain';

  const label = normalizeText(visibleText(button));
  const texts = accessibleTexts(button, { maxLength: MAX_LABEL_LENGTH });
  const named = [...button.attributes]
    .map((attribute) => attribute.name)
    .filter((name) => name === 'aria-label' || name === 'title');
  const wording = wordingOf(texts, matchers);

  const post = closestPost(button);
  const inBody = button.closest(BODY_WRAPPER_SELECTOR) !== null;
  const inRow = button.closest(ACTION_ROW_SELECTOR) !== null;
  const byPosition = isBodyLinkButton(button)
    ? 'see more'
    : isTranslationLinkButton(button) ? 'translation control' : 'none';

  const verdict = wording !== 'none' || byPosition !== 'none' ? 'recognised' : 'NOT RECOGNISED';

  const facts = [
    `label=${label.length} chars${/\(\s*[^()]*\)\s*$/.test(label) ? ' (brackets)' : ''}`
      + `${button.querySelector('svg') ? ' +svg' : ''}${named.length ? ` named-by=${named.join(',')}` : ''}`,
    `wording=${wording}`,
    `position=${byPosition}`,
    `marker=${markerOf(button)}`,
    `post=${post ? sketch(post) : 'none'}`,
    `in-body=${inBody ? 'yes' : 'no'}`,
    `in-action-row=${inRow ? 'yes' : 'no'}`,
    `shadow=${button.getRootNode() !== root ? 'yes' : 'no'}`,
    `nearest-marker=${nearestMarker(button)}`,
  ];
  if (post) {
    const own = (selector) => [...post.querySelectorAll(selector)].filter((node) => closestPost(node) === post);
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const bodies = own(BODY_WRAPPER_SELECTOR);
    const rows = own(ACTION_ROW_SELECTOR);
    facts.push(
      `post-bodies=${bodies.length}${bodies.some((body) => follows(body, button)) ? ' (one before this)' : ''}`,
      `post-rows=${rows.length}${rows.some((row) => follows(button, row)) ? ' (one after this)' : ''}`,
    );
  }

  return {
    verdict,
    lines: [
      `${sketch(button)}  shape=${shape}  ${verdict}`,
      `    ${facts.join('  ')}`,
      `    label-shape="${labelShape(label)}"  attrs=${attributeNames(button) || '(none)'}  children: ${childSketches(button)}`,
      `    ancestors: ${ancestry(button, { root })}`,
    ],
  };
}

/**
 * Lines for the layout diagnostics: counts, then the buttons, unrecognised
 * first.
 *
 * @param {object} options
 * @param {object} options.matchers the compiled label matchers
 * @param {(selector: string) => Element[]} [options.deepQueryAll] a query that
 *   also searches shadow roots; without it only the document is read
 * @param {Document} [options.root]
 */
export function linkButtonLines({ matchers, deepQueryAll, root = document } = {}) {
  const query = deepQueryAll ?? ((selector) => [...root.querySelectorAll(selector)]);
  const buttons = [...new Set(query(LINK_BUTTON_SELECTOR).map(buttonOf).filter(Boolean))];
  const inShadow = buttons.filter((button) => button.getRootNode() !== root).length;

  const described = buttons.map((button) => describeLinkButton(button, { matchers, root }));
  const missed = described.filter((entry) => entry.verdict !== 'recognised');
  const found = described.filter((entry) => entry.verdict === 'recognised');

  const lines = [
    `link buttons (fui-Link or y-fakeLink): ${buttons.length} found, ${missed.length} not recognised`
      + `${inShadow ? `, ${inShadow} inside shadow roots` : ''}`,
  ];
  if (buttons.length === 0) return lines;

  const shown = [...missed, ...found].slice(0, MAX_DESCRIBED);
  shown.forEach((entry, index) => {
    lines.push(`  #${index + 1} ${entry.lines[0]}`);
    lines.push(...entry.lines.slice(1).map((line) => `  ${line}`));
  });
  if (described.length > shown.length) {
    lines.push(`  … and ${described.length - shown.length} more, all recognised`);
  }
  return lines;
}

/**
 * Engage's named containers, surveyed: every `qa…` class on the page, how many
 * elements carry it, and what those elements hold. When a new layout arrives
 * -- comments drawn as speech bubbles, say -- this is what shows whether its
 * container is one the script resolves as a post, and whether the action row
 * and body wrapper the position checks rely on are inside it.
 */
export function containerSurveyLines({ deepQueryAll, root = document } = {}) {
  const query = deepQueryAll ?? ((selector) => [...root.querySelectorAll(selector)]);
  const byClass = new Map();
  for (const element of query('[class*="qa"]')) {
    for (const name of element.classList) {
      if (!QA_CLASS.test(name)) continue;
      if (!byClass.has(name)) byClass.set(name, []);
      byClass.get(name).push(element);
    }
  }
  const lines = [`named containers (qa… classes): ${byClass.size}`];
  const names = [...byClass.keys()].sort();
  for (const name of names) {
    const elements = byClass.get(name);
    const count = (predicate) => elements.filter(predicate).length;
    const has = (selector) => (element) => element.querySelector(selector) !== null;
    const facts = [
      `post=${count((element) => closestPost(element) === element)}`,
      `inside-post=${count((element) => {
        const post = closestPost(element);
        return post !== null && post !== element;
      })}`,
      `with-action-row=${count(has(ACTION_ROW_SELECTOR))}`,
      `with-body-wrapper=${count(has(BODY_WRAPPER_SELECTOR))}`,
      `with-link-buttons=${count(has(LINK_BUTTON_SELECTOR))}`,
      `with-nested-${name}=${count(has(`.${name}`))}`,
    ];
    lines.push(`  ${name}: ${elements.length}  ${facts.join('  ')}`);
  }
  return lines;
}

/** The members of a copy, each reduced to sizes; nothing of what they say. */
function memberLine(index, member) {
  const extracted = extractPost(member);
  const nested = nestedPosts(member);
  const columns = member.querySelectorAll(POST_SELECTOR).length - nested.length;
  const body = extracted?.body ?? '';
  const lines = body ? body.split('\n').length : 0;
  return `  #${index} ${sketch(member)}  author=${extracted?.author.length ?? 0} chars`
    + `  body=${body.length} chars/${lines} lines  replies=${extracted?.replies.length ?? 0}`
    + `  nested-posts=${nested.length}  layout-columns=${columns}`
    + `  rows=${member.querySelectorAll(ACTION_ROW_SELECTOR).length}`
    + `${extracted ? '' : '  (yields nothing)'}`;
}

/**
 * What copying the first thread on the page would produce, in sizes only:
 * how many members the thread has, and for each the length of its author and
 * body, its nested posts and the layout columns that were not taken for
 * posts. A body of 0 chars beside a post with layout columns is the symptom
 * that a column was stripped as a reply.
 */
export function copyDryRunLines({ root = document } = {}) {
  const first = rootPosts(root)[0];
  if (!first) return ['copy dry run: no post on the page'];
  const members = threadMembers(first);
  const lines = [
    `copy dry run (first thread on the page): ${
      members ? `${members.length} sibling members` : 'nested layout, one container'
    }`,
  ];
  const list = members ?? [first];
  list.slice(0, 12).forEach((member, index) => lines.push(memberLine(index + 1, member)));
  if (list.length > 12) lines.push(`  … and ${list.length - 12} more`);
  const tree = members ? extractThread(members) : extractPost(first);
  const total = (post) =>
    post ? post.body.length + post.replies.reduce((sum, reply) => sum + total(reply), 0) : 0;
  lines.push(`  rendered: ${countPosts(tree)} posts, ${total(tree)} body chars in all`);
  return lines;
}
