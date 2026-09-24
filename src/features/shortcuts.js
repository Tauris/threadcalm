/**
 * Keyboard shortcuts.
 *
 * Single letters, vi-style, because Engage itself binds almost nothing and
 * the keys people already know from mail and feed readers cost nothing to
 * learn. Every binding is inert while a text field, a rich-text composer or
 * any contenteditable has focus, and while a modifier is held, so typing a
 * reply can never trigger one.
 *
 * Focus is tracked as an index into the visible root posts rather than as a
 * DOM reference, because Engage recycles nodes as the feed virtualises.
 */
import { bus, EVENTS } from '../core/bus.js';
import { el, isEditingContext, rootPosts } from '../core/dom.js';
import { getValue, setValue } from '../core/gm.js';
import { LINKS, PUBLIC_REPO, brandLink } from '../meta.js';
import { brandMark, icon } from '../ui/icons.js';
import * as settings from '../core/settings.js';

export const FOCUS_CLASS = 'tc-focus';
const OVERLAY_ID = 'tc-help';

/** What a key is called on the keycap, where that differs from its event name. */
const KEY_CAPS = { Escape: 'Esc' };

/** Remembers that the shortcut list has been shown once. */
const SEEN_KEY = 'help-seen';

/**
 * The binding table. Also rendered as the help overlay and copied into the
 * README, so it is the one place a key is described.
 */
export const BINDINGS = [
  { keys: ['j'], label: 'Next post' },
  { keys: ['k'], label: 'Previous post' },
  { keys: ['o'], label: 'Expand the focused post' },
  { keys: ['c'], label: 'Copy the focused thread' },
  { keys: ['y'], label: 'Copy a link to the focused thread' },
  { keys: ['e'], label: 'Pause or resume automatic expansion' },
  { keys: ['a'], label: 'Hide the action bars outright, or show them again' },
  { keys: ['r'], label: 'Toggle reading mode' },
  { keys: ['t'], label: 'Cycle the translation-control mode' },
  { keys: ['s'], label: 'Open settings' },
  { keys: ['p'], label: 'Show or hide the status panel' },
  { keys: ['?'], label: 'Show this help' },
  { keys: ['Escape'], label: 'Close help or settings' },
];

const TRANSLATE_MODES = ['compact', 'known', 'hide', 'off'];

export function createShortcuts({ expander, copyTools, readingMode, panel, quietChrome }) {
  let focusIndex = -1;
  let overlay = null;
  let unsubscribeHelp = null;

  function toast(message) {
    bus.emit(EVENTS.TOAST, { message });
  }

  function posts() {
    return rootPosts();
  }

  function clearFocusMarks() {
    for (const element of document.querySelectorAll(`.${FOCUS_CLASS}`)) {
      element.classList.remove(FOCUS_CLASS);
    }
  }

  /** The post the shortcuts act on: the focused one, else the topmost visible. */
  function currentPost() {
    const list = posts();
    if (list.length === 0) return null;
    if (focusIndex >= 0 && focusIndex < list.length) return list[focusIndex];

    const firstVisible = list.findIndex((post) => post.getBoundingClientRect().bottom > 80);
    focusIndex = firstVisible >= 0 ? firstVisible : 0;
    return list[focusIndex];
  }

  function moveFocus(delta) {
    const list = posts();
    if (list.length === 0) {
      toast('No posts on this page');
      return;
    }

    if (focusIndex < 0) {
      // First press starts from what the reader is already looking at.
      const firstVisible = list.findIndex((post) => post.getBoundingClientRect().top > -40);
      focusIndex = firstVisible >= 0 ? firstVisible : 0;
    } else {
      focusIndex = Math.min(list.length - 1, Math.max(0, focusIndex + delta));
    }

    clearFocusMarks();
    const post = list[focusIndex];
    post.classList.add(FOCUS_CLASS);
    post.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function toggleHelp(force) {
    const open = force ?? !overlay;
    if (!open) {
      overlay?.remove();
      overlay = null;
      return false;
    }
    if (overlay) return true;

    overlay = el(
      'div',
      {
        id: OVERLAY_ID,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Threadcalm keyboard shortcuts',
        on: {
          click: (event) => {
            if (event.target === overlay) toggleHelp(false);
          },
        },
      },
      el(
        'div',
        { className: 'tc-help-card' },
        el(
          'header',
          { className: 'tc-help-head' },
          el(
            'div',
            {},
            el('p', { className: 'tc-eyebrow' }, brandMark(), brandLink(el)),
            el('h2', { text: 'Keyboard shortcuts' }),
          ),
          // Esc and a click outside both close this, but neither is visible;
          // a dialog should show its own way out.
          el(
            'button',
            {
              type: 'button',
              className: 'tc-icon-btn',
              title: 'Close (Esc)',
              'aria-label': 'Close keyboard shortcuts',
              on: { click: () => toggleHelp(false) },
            },
            icon('close'),
          ),
        ),
        el(
          'dl',
          { className: 'tc-keys' },
          ...BINDINGS.flatMap((binding) => [
            el('dt', {}, ...binding.keys.map((key) => el('kbd', { text: KEY_CAPS[key] ?? key }))),
            el('dd', { text: binding.label }),
          ]),
        ),
        el(
          'p',
          { className: 'tc-help-note' },
          el('span', {
            text:
              'Shortcuts are ignored while you are typing. '
              + 'Press ? or use the panel’s ? button to see this again. '
              // Nothing is hidden by default, which means nobody finds these
              // unless they are told. This is the one screen everybody sees.
              + 'Settings also holds display options — the Like / Comment / Share bar '
              + 'and the inline reply boxes can each be quieted, and every choice is '
              + 'listed there with what it costs. ',
          }),
          // This overlay lists keys only; everything else lives in the guide.
          PUBLIC_REPO
            ? el('a', {
                href: LINKS.docs,
                target: '_blank',
                rel: 'noopener noreferrer',
                text: 'Full documentation',
              })
            : null,
        ),
      ),
    );
    document.body.append(overlay);
    return true;
  }

  function cycleTranslateMode() {
    const current = settings.get('translate.mode');
    const next = TRANSLATE_MODES[(TRANSLATE_MODES.indexOf(current) + 1) % TRANSLATE_MODES.length];
    settings.update({ 'translate.mode': next });
    toast(`Translation controls: ${next}`);
  }

  function handleKey(event) {
    if (!settings.get('shortcuts.enabled')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditingContext(event.target)) return;

    // Escape has to work even when the overlay has focus.
    if (event.key === 'Escape') {
      if (overlay) {
        toggleHelp(false);
        event.preventDefault();
      } else if (panel?.closeSettings?.()) {
        event.preventDefault();
      }
      return;
    }

    switch (event.key) {
      case 'j':
        moveFocus(1);
        break;
      case 'k':
        moveFocus(-1);
        break;
      case 'o': {
        const post = currentPost();
        if (!post) return;
        const clicks = expander.expandWithin(post);
        toast(clicks > 0 ? `Expanding ${clicks} section${clicks === 1 ? '' : 's'}` : 'Nothing left to expand');
        break;
      }
      case 'c':
        copyTools.copyThread(currentPost());
        break;
      case 'y':
        copyTools.copyLink(currentPost());
        break;
      case 'e': {
        const paused = expander.togglePause();
        toast(paused ? 'Expansion paused' : 'Expansion resumed');
        break;
      }
      case 'a': {
        const state = quietChrome?.toggleActions?.();
        if (state) toast(state === 'hidden' ? 'Action bars hidden' : 'Action bars shown');
        break;
      }
      case 'r':
        toast(readingMode.toggle() ? 'Reading mode on' : 'Reading mode off');
        break;
      case 't':
        cycleTranslateMode();
        break;
      case 's':
        panel?.openSettings?.();
        break;
      case 'p':
        panel?.toggle?.();
        break;
      case '?':
        toggleHelp();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return {
    start() {
      window.addEventListener('keydown', handleKey, true);
      unsubscribeHelp = bus.on(EVENTS.SHOW_HELP, () => toggleHelp(true));

      // A keyboard feature nobody is told about is a keyboard feature nobody
      // uses. The list is shown once, on the first run, and then only on
      // demand - via ?, the panel's ? button, or the manager's menu.
      if (!getValue(SEEN_KEY, false)) {
        setValue(SEEN_KEY, true);
        setTimeout(() => toggleHelp(true), 1200);
      }
    },
    stop() {
      window.removeEventListener('keydown', handleKey, true);
      unsubscribeHelp?.();
      unsubscribeHelp = null;
      clearFocusMarks();
      toggleHelp(false);
    },
    onNavigate() {
      focusIndex = -1;
      clearFocusMarks();
    },
    showHelp: () => toggleHelp(true),
    toggleHelp,
  };
}
