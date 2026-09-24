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
import {
  ACTION_ROW_SELECTOR,
  POST_SELECTOR,
  allPosts,
  isVisible,
  normalizeText,
  visibleText,
} from '../core/dom.js';

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
/**
 * Text that is a person's initials rather than their name: "KJ", "A".
 *
 * Engage draws an avatar with no photo as the author's initials, and makes it
 * a profile link like the name beside it. Taking the first profile link in a
 * post therefore took the initials whenever the avatar came first -- which is
 * how a thread's opening post was copied as "## KJ".
 */
const INITIALS = /^\p{Lu}{1,3}$/u;

/** A person's initials, derived from their name, for matching an avatar. */
function initialsOf(name) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .toLocaleUpperCase();
}

const PROFILE_LINK_SELECTOR =
  'a[href*="/users/"], a[href*="/people/"], a[href*="userId="], a[data-testid*="author" i]';

function extractAuthor(article) {
  // Every profile link, not just the first: an initials-only avatar is a
  // profile link too, and often comes before the name. Visible text is tried
  // before the naming attributes, and anything that is only initials is
  // passed over -- a later link, or the action label below, has the name.
  for (const link of article.querySelectorAll(PROFILE_LINK_SELECTOR)) {
    const candidates = [
      visibleText(link),
      link.getAttribute('aria-label'),
      link.getAttribute('title'),
    ];
    for (const candidate of candidates) {
      const name = normalizeText(candidate);
      if (name && name.length < 80 && !INITIALS.test(name)) return name;
    }
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

  // The first kept lines are almost always the header repeated: the avatar's
  // initials, then the author's name. Drop them only when they match exactly,
  // never on a guess -- a body that happens to open with two capitals stays.
  const author = extractAuthor(article);
  const header = new Set([author, initialsOf(author)]);
  let dropped = 0;
  while (kept.length > 0 && dropped < 2 && header.has(kept[0])) {
    kept.shift();
    dropped += 1;
  }

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

/** What Engage marks the first post of a conversation with. */
const STARTER_SELECTOR = '.qaThreadStarter';

/** Indentation difference, in pixels, below which two posts count as level. */
const INDENT_TOLERANCE = 2;

/**
 * The posts that make up the conversation `post` belongs to, in reading order.
 *
 * Engage's conversation layout does not nest a reply inside the post it
 * answers: the starter and every comment are siblings, one after another. So
 * a thread cannot be read by descending into one element -- doing that is what
 * copied a lone reply. Here a thread is its starter plus every post after it,
 * up to the next starter.
 *
 * Returns null where that layout is not what the page uses -- no starter at
 * all, or comments genuinely nested inside the starter -- and the caller falls
 * back to reading the post's own subtree, which is right for those layouts.
 *
 * @param {Element} post
 * @returns {HTMLElement[]|null}
 */
export function threadMembers(post) {
  if (!(post instanceof HTMLElement)) return null;

  const all = allPosts();
  const index = all.findIndex(
    (candidate) => candidate === post || candidate.contains(post) || post.contains(candidate),
  );
  if (index < 0) return null;

  const isStarter = (candidate) => candidate.matches(STARTER_SELECTOR);

  let start = index;
  while (start >= 0 && !isStarter(all[start])) start -= 1;
  if (start < 0) return null;

  let end = start + 1;
  while (end < all.length && !isStarter(all[end])) end += 1;

  const members = all.slice(start, end);

  // Comments inside the starter's own element are the nested layout, which
  // extractPost already reads; treating them as siblings would copy them twice.
  const starter = members[0];
  if (members.length > 1 && members.slice(1).every((member) => starter.contains(member))) {
    return null;
  }
  return members;
}

/**
 * Reads a sibling-layout conversation into one tree.
 *
 * Nesting exists only visually there, as indentation: a reply to a comment is
 * drawn further right than the comment it answers. So each post's parent is
 * the nearest earlier post that sits further left. That is one layout read per
 * post, which is acceptable because it happens only when someone asks to copy.
 *
 * @param {HTMLElement[]} members the starter first, then the rest in order
 * @returns {ExtractedPost|null}
 */
export function extractThread(members) {
  if (!members?.length) return null;

  const [starter, ...rest] = members;
  const root = extractPost(starter) ?? {
    author: extractAuthor(starter),
    body: '',
    timestamp: extractTimestamp(starter),
    permalink: extractPermalink(starter),
    replies: [],
  };

  const stack = [{ node: root, left: starter.getBoundingClientRect().left }];
  for (const member of rest) {
    const node = extractPost(member);
    if (!node) continue;
    const { left } = member.getBoundingClientRect();

    while (stack.length > 1 && stack[stack.length - 1].left >= left - INDENT_TOLERANCE) {
      stack.pop();
    }
    stack[stack.length - 1].node.replies.push(node);
    stack.push({ node, left });
  }
  return root;
}

/**
 * The element whose subtree holds the whole conversation, for expanding it.
 * The nearest ancestor containing both its first and its last post.
 */
export function threadScope(members) {
  if (!members?.length) return null;
  const last = members[members.length - 1];
  let node = members[0];
  while (node && !node.contains(last)) node = node.parentElement;
  return node;
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
