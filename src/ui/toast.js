/**
 * Transient messages.
 *
 * Replaces the original script's single status div for anything that is an
 * event rather than a state ("copied 12 posts", "clipboard blocked"). The
 * persistent counter lives in the panel; this stack is for things that should
 * disappear on their own.
 */
import { bus, EVENTS } from '../core/bus.js';
import { el } from '../core/dom.js';

const CONTAINER_ID = 'tc-toasts';
const VISIBLE_MS = 2600;

/** More than a few at once is noise, not information. */
const MAX_VISIBLE = 3;

export function createToaster() {
  let container = null;
  let unsubscribe = null;

  function ensureContainer() {
    if (container?.isConnected) return container;
    container = el('div', { id: CONTAINER_ID, role: 'status', 'aria-live': 'polite' });
    document.body.append(container);
    return container;
  }

  function show({ message, tone = 'info', duration = VISIBLE_MS }) {
    if (!message) return;
    const host = ensureContainer();

    while (host.children.length >= MAX_VISIBLE) host.firstElementChild?.remove();

    const toast = el('div', {
      className: `tc-toast${tone === 'warn' ? ' tc-warn' : ''}`,
      text: message,
    });
    host.append(toast);

    // Two frames: one to attach, one so the transition has a start value.
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('tc-in')));

    setTimeout(() => {
      toast.classList.remove('tc-in');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  return {
    start() {
      unsubscribe = bus.on(EVENTS.TOAST, show);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      container?.remove();
      container = null;
    },
    show,
  };
}
