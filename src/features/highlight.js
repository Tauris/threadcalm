/**
 * Marking posts that deserve attention.
 *
 * Two independent marks, both rendered as a coloured left rail so they read
 * at a glance without adding anything to the layout:
 *
 *   unanswered  the post has no replies at all
 *   new         this identity has not been seen in a previous session
 *
 * "Seen" is stored locally, capped, and keyed by permalink where Engage
 * exposes one. It is a reading aid, not a sync feature: it never leaves the
 * browser and is wiped by "reset settings".
 */
import { POST_SELECTOR, accessibleTexts, debounce, rootPosts } from '../core/dom.js';
import { getValue, setValue } from '../core/gm.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { postIdentity } from './thread.js';

export const UNANSWERED_CLASS = 'tc-unanswered';
export const NEW_CLASS = 'tc-new';

const STORAGE_KEY = 'seen-posts';

/** Enough history for weeks of normal reading without unbounded growth. */
const MAX_SEEN = 3000;

/** A reply counter is "12 replies"; anything longer is not one. */
const MAX_LABEL_LENGTH = 40;

export function createHighlighter({ matchers }) {
  let active = matchers;

  /** Insertion-ordered, which makes trimming the oldest entries trivial. */
  let seen = new Set(loadSeen());

  function loadSeen() {
    const stored = getValue(STORAGE_KEY, []);
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  }

  function persistSeen() {
    const ids = [...seen];
    const trimmed = ids.length > MAX_SEEN ? ids.slice(ids.length - MAX_SEEN) : ids;
    if (trimmed.length !== ids.length) seen = new Set(trimmed);
    setValue(STORAGE_KEY, trimmed);
  }

  /**
   * Whether a post has replies.
   * A nested article is proof. Absent one, a reply counter naming a non-zero
   * number is accepted, which covers collapsed threads that have not been
   * expanded yet.
   */
  function hasReplies(article) {
    if (article.querySelector(POST_SELECTOR)) return true;
    if (!active.replyCount) return false;

    for (const element of article.querySelectorAll('span, button, a, [role="button"]')) {
      for (const text of accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH })) {
        const match = active.replyCount.exec(text);
        if (match && Number(match[1]) > 0) return true;
      }
    }
    return false;
  }

  function sweep() {
    const markUnanswered = settings.get('highlight.unanswered');
    const markNew = settings.get('highlight.unread');
    if (!markUnanswered && !markNew) return { unanswered: 0, fresh: 0 };

    let unanswered = 0;
    let fresh = 0;
    let added = 0;

    for (const post of rootPosts()) {
      if (markUnanswered) {
        const answered = hasReplies(post);
        post.classList.toggle(UNANSWERED_CLASS, !answered);
        if (!answered) unanswered += 1;
      }

      if (markNew) {
        const id = postIdentity(post);
        if (seen.has(id)) {
          post.classList.remove(NEW_CLASS);
        } else {
          // Marked now, remembered now: a post counts as seen once it has been
          // rendered to the reader, not once they scroll past it.
          post.classList.add(NEW_CLASS);
          seen.add(id);
          added += 1;
          fresh += 1;
        }
      }
    }

    if (added > 0) persistSeen();
    if (unanswered || fresh) log.debug(`highlight: ${unanswered} unanswered, ${fresh} new`);
    return { unanswered, fresh };
  }

  function restore() {
    for (const element of document.querySelectorAll(`.${UNANSWERED_CLASS}, .${NEW_CLASS}`)) {
      element.classList.remove(UNANSWERED_CLASS, NEW_CLASS);
    }
  }

  const scheduleSweep = debounce(() => sweep(), 350);

  return {
    start() {
      sweep();
    },
    stop: restore,
    onDomChanged: scheduleSweep,
    onNavigate: scheduleSweep,
    onSettingsChanged() {
      restore();
      sweep();
    },
    setMatchers(next) {
      active = next;
      scheduleSweep();
    },
    /** Clears the "seen" history so everything reads as new again. */
    forgetSeen() {
      seen = new Set();
      persistSeen();
      restore();
      sweep();
    },
    sweep,
  };
}
