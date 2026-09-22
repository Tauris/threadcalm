/**
 * Reading a rendered conversation back out of the DOM.
 *
 * There is no supported DOM contract here, so extraction is explicitly
 * best-effort and structured so that each piece degrades on its own: a post
 * with an unrecognised timestamp still yields its author and body, and a post
 * with an unrecognised author still yields its text.
 *
 * Posts are located the way `dom.js` locates them: semantic containers where a
 * layout provides them, and action rows otherwise, on the rule that every post
 * owns exactly one. Where replies are nested inside their parent, a post's own
 * text means its body with the nested posts removed first.
 *
 * An API-based alternative exists (the Yammer thread endpoints), but it needs
 * an app registration, tenant consent and a token flow. Reading the page the
 * user is already looking at needs none of that, which is the whole reason
 * this is a userscript.
 */
import { ACTION_ROW_SELECTOR, POST_SELECTOR, normalizeText, isVisible, visibleText } from '../core/dom.js';

/**
 * Control labels that sit inside a post but are chrome, not content.
 * Dropped line-wise from extracted bodies.
 */
const ACTION_LABELS = [
  'like', 'liked', 'reply', 'replies', 'share', 'shared', 'more', 'follow',
  'following', 'bookmark', 'save', 'saved', 'seen by', 'all replies',
  'gefällt mir', 'antworten', 'teilen', 'folgen', 'mehr', 'gesehen von',
  'j’aime', 'répondre', 'partager', 'suivre',
  'me gusta', 'responder', 'compartir', 'seguir',
];

const ACTION_SET = new Set(ACTION_LABELS);

/** Matches a bare reaction/seen counter line such as "12" or "3 likes". */
const COUNTER_LINE = /^\d+(?:[.,]\d+)?\s*(?:k|m)?\s*(?:likes?|reactions?|views?|seen)?$/i;

/** Relative-time strings Engage shows instead of a date on recent posts. */
const RELATIVE_TIME =
  /^(?:just now|\d+\s*(?:s|m|h|d|w|mo|y)\b.*|vor\s+.*|il y a\s+.*|hace\s+.*)$/i;

/**
 * Finds the author of a post.
 * Preference order: an explicit link to a user profile, then a heading, then
 * the first non-empty line of the header region.
 */
function extractAuthor(article) {
  const profileLink = article.querySelector(
    'a[href*="/users/"], a[href*="/people/"], a[href*="userId="], a[data-testid*="author" i]',
  );
  if (profileLink) {
    const name = normalizeText(visibleText(profileLink));
    if (name && name.length < 80) return name;
  }

  // The action buttons name their post's author: "Like - <name>'s post".
  // That is an accessible name rather than layout, so it survives redesigns
  // better than anything in the header does.
  const action = article.querySelector(
    'button[aria-label^="Like -"], button[aria-label^="Comment -"],'
      + ' button[aria-label^="Reply -"], button[aria-label^="Share -"]',
  );
  if (action) {
    // "Like - <name>'s post - Use Alt and down-arrow to open" and friends.
    const match = /^\w+\s+-\s*(.+?)(?:’|')s\s+(?:post|comment)/i.exec(
      action.getAttribute('aria-label') ?? '',
    );
    if (match && match[1].length < 80) return normalizeText(match[1]);
  }

  const heading = article.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
  if (heading) {
    const name = normalizeText(visibleText(heading).split('\n')[0]);
    if (name && name.length < 80) return name;
  }

  const firstLine = normalizeText(visibleText(article)).split(' • ')[0];
  return firstLine.slice(0, 80) || 'Unknown author';
}

/**
 * Finds a timestamp.
 * A real `<time datetime>` is preferred because it is unambiguous; a `title`
 * attribute holding a parseable date is second; the displayed relative string
 * ("2h", "vor 3 Tagen") is the last resort and is returned verbatim.
 */
function extractTimestamp(article) {
  const time = article.querySelector('time[datetime]');
  if (time) {
    const iso = time.getAttribute('datetime');
    return { iso, display: normalizeText(visibleText(time)) || iso };
  }

  const titled = article.querySelector('[title]');
  if (titled) {
    const title = titled.getAttribute('title');
    const parsed = Date.parse(title);
    if (!Number.isNaN(parsed)) {
      return { iso: new Date(parsed).toISOString(), display: normalizeText(title) };
    }
  }

  for (const node of article.querySelectorAll('a, span')) {
    const text = normalizeText(visibleText(node));
    if (text && text.length <= 24 && RELATIVE_TIME.test(text)) {
      return { iso: null, display: text };
    }
  }
  return { iso: null, display: '' };
}

/** Absolute URL of the post, if the page exposes one. */
function extractPermalink(article) {
  const link = article.querySelector(
    'a[href*="/threads/"], a[href*="threadId="], a[href*="/messages/"], a[href*="messageId="]',
  );
  if (!link) return null;
  try {
    return new URL(link.getAttribute('href'), location.origin).toString();
  } catch {
    return null;
  }
}

/**
 * The post's own text, with nested replies and UI chrome removed.
 *
 * Works on a clone so the live page is never touched, then filters line-wise:
 * whole lines that are action labels or bare counters are dropped, which is
 * resilient to Engage reordering its action bar.
 */
function extractBody(article) {
  const clone = article.cloneNode(true);

  const strip = [
    POST_SELECTOR,          // nested replies, handled separately
    ACTION_ROW_SELECTOR,    // the whole Like/Comment/Share row in one go
    'button', '[role="button"]', '[role="toolbar"]', '[role="menu"]',
    '[role="menubar"]', 'nav', 'time', '[aria-hidden="true"]',
  ];
  for (const selector of strip) {
    for (const node of clone.querySelectorAll(selector)) node.remove();
  }

  // Split first, normalise second. Doing it the other way round would
  // collapse the newlines that separate the body from the chrome, and the
  // line-wise filter below would then have a single line to work with.
  const lines = visibleText(clone)
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const kept = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (ACTION_SET.has(lower)) return false;
    if (COUNTER_LINE.test(line)) return false;
    if (RELATIVE_TIME.test(line) && line.length <= 24) return false;
    return true;
  });

  // The first kept line is almost always the author name repeated from the
  // header; drop it only when it matches exactly, never on a guess.
  const author = extractAuthor(article);
  if (kept[0] && kept[0] === author) kept.shift();

  return kept.join('\n');
}

/** Direct reply articles of a post — not the replies of its replies. */
function directReplies(article) {
  const nested = [...article.querySelectorAll(POST_SELECTOR)].filter(isVisible);
  return nested.filter(
    (candidate) => !nested.some((other) => other !== candidate && other.contains(candidate)),
  );
}

/**
 * @typedef {object} ExtractedPost
 * @property {string} author
 * @property {string} body
 * @property {{iso: string|null, display: string}} timestamp
 * @property {string|null} permalink
 * @property {ExtractedPost[]} replies
 */

/**
 * Extracts one post and everything nested inside it.
 *
 * @param {Element} article
 * @param {number} [depth] recursion guard against pathological nesting
 * @returns {ExtractedPost|null}
 */
export function extractPost(article, depth = 0) {
  if (!(article instanceof HTMLElement) || depth > 6) return null;

  const replies = directReplies(article)
    .map((reply) => extractPost(reply, depth + 1))
    .filter(Boolean);

  const post = {
    author: extractAuthor(article),
    body: extractBody(article),
    timestamp: extractTimestamp(article),
    permalink: extractPermalink(article),
    replies,
  };

  // A container with neither text nor replies carries no information.
  if (!post.body && replies.length === 0) return null;
  return post;
}

/** Total posts in a tree, including the root. */
export function countPosts(post) {
  if (!post) return 0;
  return 1 + post.replies.reduce((sum, reply) => sum + countPosts(reply), 0);
}

/**
 * Renders an extracted thread.
 *
 * Replies become nested blockquotes in Markdown and indented blocks in plain
 * text, so the shape of the conversation survives a paste into a ticket,
 * an email or a notes app.
 *
 * @param {ExtractedPost} post
 * @param {object} options
 * @param {'markdown'|'text'} [options.format]
 * @param {boolean} [options.includeTimestamps]
 * @param {boolean} [options.includePermalink]
 * @param {string} [options.sourceUrl]
 */
export function renderThread(post, options = {}) {
  const {
    format = 'markdown',
    includeTimestamps = true,
    includePermalink = true,
    sourceUrl = location.href,
  } = options;

  const lines = [];

  const stamp = (entry) => {
    if (!includeTimestamps) return '';
    const { iso, display } = entry.timestamp;
    const shown = iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) : display;
    return shown ? ` — ${shown}` : '';
  };

  if (format === 'markdown') {
    lines.push(`## ${post.author}${stamp(post)}`, '');
    if (post.body) lines.push(post.body, '');

    const walk = (entry, depth) => {
      const prefix = '> '.repeat(depth);
      lines.push(`${prefix}**${entry.author}**${stamp(entry)}`);
      lines.push(prefix.trimEnd());
      for (const line of entry.body.split('\n')) {
        lines.push(`${prefix}${line}`);
      }
      lines.push(prefix.trimEnd());
      for (const child of entry.replies) walk(child, depth + 1);
    };
    for (const reply of post.replies) walk(reply, 1);

    if (includePermalink) {
      const url = post.permalink ?? sourceUrl;
      lines.push('', `[Open in Viva Engage](${url})`);
    }
  } else {
    lines.push(`${post.author}${stamp(post)}`, '');
    if (post.body) lines.push(post.body, '');

    const walk = (entry, depth) => {
      const indent = '    '.repeat(depth);
      lines.push(`${indent}${entry.author}${stamp(entry)}`);
      for (const line of entry.body.split('\n')) {
        lines.push(`${indent}  ${line}`);
      }
      lines.push('');
      for (const child of entry.replies) walk(child, depth + 1);
    };
    for (const reply of post.replies) walk(reply, 1);

    if (includePermalink) {
      lines.push(post.permalink ?? sourceUrl);
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A stable-enough identity for a post, used by the "new since last visit"
 * highlighter. The permalink is used when present; otherwise a short hash of
 * author, timestamp and the opening of the body.
 */
export function postIdentity(article) {
  const permalink = extractPermalink(article);
  if (permalink) {
    const match = permalink.match(/(?:threads?|messages)\/([\w-]+)/i);
    if (match) return `id:${match[1]}`;
    return `url:${permalink}`;
  }

  const author = extractAuthor(article);
  const { iso, display } = extractTimestamp(article);
  const body = normalizeText(visibleText(article)).slice(0, 120);
  return `h:${hash(`${author}|${iso ?? display}|${body}`)}`;
}

/** FNV-1a, 32 bit: short, fast and good enough to tell posts apart. */
function hash(input) {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}
