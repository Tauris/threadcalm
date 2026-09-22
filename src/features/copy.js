/**
 * Copying a conversation out of Engage.
 *
 * Two actions, both available from the keyboard, the Tampermonkey menu and a
 * small per-post chip:
 *
 *   copy thread  the post and every reply, as Markdown or plain text
 *   copy link    the post's permalink, or the page URL when it has none
 *
 * The chip is appended to the post element itself rather than injected into
 * Engage's action bar. React owns the action bar and will discard anything
 * placed inside it on the next render; an extra last child of the article is
 * left alone, and the sweep re-attaches it if a render does remove it.
 */
import { bus, EVENTS } from '../core/bus.js';
import { debounce, el, rootPosts } from '../core/dom.js';
import { copyToClipboard } from '../core/gm.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';
import { countPosts, extractPost, renderThread } from './thread.js';

export const CHIP_CLASS = 'tc-chip';
export const HOST_CLASS = 'tc-post';

export function createCopyTools({ expander }) {
  /** Posts we have already decorated, so the sweep stays cheap. */
  const decorated = new WeakMap();

  function toast(message, tone = 'info') {
    bus.emit(EVENTS.TOAST, { message, tone });
  }

  function renderOptions() {
    return {
      format: settings.get('copy.format'),
      includeTimestamps: settings.get('copy.includeTimestamps'),
      includePermalink: settings.get('copy.includePermalink'),
    };
  }

  /**
   * Copies a whole thread.
   *
   * Expansion runs first: copying a thread that is still collapsed would
   * silently produce a partial transcript, which is worse than a slow copy.
   *
   * @param {Element} article
   * @param {object} [options]
   * @param {boolean} [options.expandFirst]
   */
  async function copyThread(article, { expandFirst = true } = {}) {
    if (!article) {
      toast('No post found to copy', 'warn');
      return false;
    }

    if (expandFirst && expander) {
      const clicks = expander.expandWithin(article);
      if (clicks > 0) {
        toast(`Expanding ${clicks} more section${clicks === 1 ? '' : 's'}…`);
        // One settle period is enough for the replies already requested; a
        // deeply paginated thread may need the shortcut pressing twice.
        await new Promise((resolve) =>
          setTimeout(resolve, settings.get('expand.settleDelayMs')),
        );
      }
    }

    const post = extractPost(article);
    if (!post) {
      toast('Could not read this post', 'warn');
      return false;
    }

    const text = renderThread(post, renderOptions());
    const copied = await copyToClipboard(text);
    const total = countPosts(post);

    if (copied) {
      toast(`Copied ${total} post${total === 1 ? '' : 's'} as ${settings.get('copy.format')}`);
    } else {
      toast('Clipboard was blocked by the browser', 'warn');
      log.warn('clipboard write failed; transcript follows', text);
    }
    return copied;
  }

  /** Copies the post's permalink, falling back to the current page URL. */
  async function copyLink(article) {
    const post = article ? extractPost(article) : null;
    const url = post?.permalink ?? location.href;
    const copied = await copyToClipboard(url);
    toast(copied ? 'Link copied' : 'Clipboard was blocked by the browser', copied ? 'info' : 'warn');
    return copied;
  }

  function buildChip(article) {
    return el(
      'div',
      { className: CHIP_CLASS, role: 'group', 'aria-label': 'Threadcalm post actions' },
      el('button', {
        type: 'button',
        title: 'Copy this thread (c)',
        'aria-label': 'Copy this thread',
        text: 'copy',
        on: {
          click: (event) => {
            event.preventDefault();
            event.stopPropagation();
            copyThread(article);
          },
        },
      }),
      el('button', {
        type: 'button',
        title: 'Copy a link to this thread (y)',
        'aria-label': 'Copy a link to this thread',
        text: 'link',
        on: {
          click: (event) => {
            event.preventDefault();
            event.stopPropagation();
            copyLink(article);
          },
        },
      }),
    );
  }

  function sweep() {
    if (!settings.get('copy.showButtons')) return;

    for (const article of rootPosts()) {
      const existing = decorated.get(article);
      // `isConnected` catches the case where a React render dropped our chip.
      if (existing && existing.isConnected && article.contains(existing)) continue;

      const chip = buildChip(article);
      article.classList.add(HOST_CLASS);
      article.append(chip);
      decorated.set(article, chip);
    }
  }

  function removeChips() {
    for (const chip of document.querySelectorAll(`.${CHIP_CLASS}`)) chip.remove();
    for (const host of document.querySelectorAll(`.${HOST_CLASS}`)) {
      host.classList.remove(HOST_CLASS);
    }
  }

  const scheduleSweep = debounce(() => sweep(), 300);

  return {
    start: sweep,
    stop: removeChips,
    onDomChanged: scheduleSweep,
    onNavigate: scheduleSweep,
    onSettingsChanged() {
      if (settings.get('copy.showButtons')) sweep();
      else removeChips();
    },
    copyThread,
    copyLink,
  };
}
