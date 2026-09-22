/**
 * Minimal stand-ins for Viva Engage markup.
 *
 * These reproduce the *structure* the script relies on — nested post
 * containers, a reply counter rendered as a bare span, a translate control —
 * and deliberately nothing else. They are synthetic by design: markup copied
 * out of a running tenant would bake in class names the script must never
 * depend on, and would put other people's names and post text into a public
 * repository.
 */

/**
 * Block-level elements, for the `innerText` approximation below.
 * The list only needs to cover what Engage and these fixtures actually use.
 */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TR', 'UL',
]);

/**
 * jsdom implements neither layout nor `innerText`.
 *
 * Both are stubbed rather than worked around in the source, so the tests
 * exercise the same code path a browser does. The `innerText` approximation
 * only has to get one thing right for this script: block elements introduce a
 * line break, which is what separates a post's body from its chrome.
 */
export function stubLayout(window) {
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.hasAttribute('data-zero-size')) {
      return { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 };
    }
    return { width: 200, height: 40, top: 10, bottom: 50, left: 0, right: 200 };
  };

  if (!Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'innerText')) {
    Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return renderText(this).replace(/\n{2,}/g, '\n').trim();
      },
    });
  }
}

function renderText(node) {
  if (node.nodeType === node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== node.ELEMENT_NODE) return '';
  if (node.tagName === 'BR') return '\n';
  if (node.hidden || node.getAttribute('aria-hidden') === 'true') return '';

  let text = '';
  for (const child of node.childNodes) text += renderText(child);
  return BLOCK_TAGS.has(node.tagName) ? `\n${text}\n` : text;
}

/**
 * @param {object} options
 * @param {string} options.author
 * @param {string} options.body
 * @param {string} [options.time] ISO timestamp
 * @param {string} [options.permalink]
 * @param {number} [options.replyCount] renders a bare "N replies" span
 * @param {string} [options.translateLabel]
 * @param {Array} [options.replies] nested post options
 */
export function createPost(options) {
  const {
    author,
    body,
    time = '2026-09-01T09:30:00.000Z',
    permalink = null,
    replyCount = null,
    translateLabel = null,
    replies = [],
  } = options;

  const article = document.createElement('div');
  article.setAttribute('role', 'article');

  const header = document.createElement('div');
  const authorLink = document.createElement('a');
  authorLink.setAttribute('href', `/main/users/${author.replace(/\s+/g, '').toLowerCase()}`);
  authorLink.textContent = author;
  header.append(authorLink);

  const timeEl = document.createElement('time');
  timeEl.setAttribute('datetime', time);
  timeEl.textContent = '2h';
  header.append(timeEl);

  if (permalink) {
    const link = document.createElement('a');
    link.setAttribute('href', permalink);
    link.textContent = 'Permalink';
    header.append(link);
  }

  article.append(header);

  const bodyEl = document.createElement('div');
  bodyEl.textContent = body;
  article.append(bodyEl);

  const actions = document.createElement('div');
  for (const label of ['Like', 'Reply', 'Share']) {
    const button = document.createElement('button');
    button.textContent = label;
    actions.append(button);
  }

  const menu = document.createElement('button');
  menu.setAttribute('aria-haspopup', 'menu');
  menu.setAttribute('aria-label', 'More options');
  actions.append(menu);

  if (translateLabel) {
    const translate = document.createElement('button');
    translate.textContent = translateLabel;
    translate.className = 'translate-control';
    actions.append(translate);
  }

  article.append(actions);

  if (replyCount != null) {
    // The shape that made the original script work: a button whose only text
    // is a bare counter, rendered as a nested span.
    const opener = document.createElement('button');
    const span = document.createElement('span');
    span.textContent = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
    opener.append(span);
    opener.className = 'reply-opener';
    article.append(opener);
  }

  for (const reply of replies) article.append(createPost(reply));

  return article;
}

/** Renders posts into `document.body` and returns them. */
export function mountFeed(posts) {
  const main = document.createElement('div');
  main.setAttribute('role', 'main');
  const elements = posts.map((options) => createPost(options));
  main.append(...elements);
  document.body.append(main);
  return elements;
}

/** The opening of Engage's reply-arrow path, which the detector keys on. */
export const REPLY_ICON_PATH = 'M7.35 3.65c.2.2.2.51 0 .71L5.21 6.5h4.29a4.5 4.5 0 1 1 0 9H8a.5.5 0 0 1 0-1h1.5a3.5 3.5 0 1 0 0-7H5.21l2.14 2.15a.5.5 0 0 1-.7.7l-3-3a.5.5 0 0 1 0-.7l3-3c.2-.2.5-.2.7 0Z';

/**
 * A counter button as Engage renders one: an inline glyph beside a numeric
 * label, with the number in its own span.
 */
export function counterControl(label, { iconPath = REPLY_ICON_PATH } = {}) {
  const button = document.createElement('button');
  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);

  if (iconPath) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', iconPath);
    svg.append(path);
    button.append(svg);
  }

  document.body.append(button);
  return button;
}

/** A control with the given label, of the given tag. */
export function control(label, { tag = 'button', attributes = {} } = {}) {
  const element = document.createElement(tag);
  element.textContent = label;
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  document.body.append(element);
  return element;
}
