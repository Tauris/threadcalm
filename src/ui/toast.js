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
  /** Toasts shown with a key, so a progress message updates in place. */
  const keyed = new Map();

  function ensureContainer() {
    if (container?.isConnected) return container;
    container = el('div', { id: CONTAINER_ID, role: 'status', 'aria-live': 'polite' });
    document.body.append(container);
    return container;
  }

  function dismiss(toast, key) {
    toast.classList.remove('tc-in');
    setTimeout(() => toast.remove(), 250);
    if (key && keyed.get(key)?.toast === toast) keyed.delete(key);
  }

  function show({ message, tone = 'info', duration = VISIBLE_MS, key = null }) {
    if (!message) return;
    const host = ensureContainer();

    const current = key ? keyed.get(key) : null;
    if (current?.toast.isConnected) {
      current.toast.textContent = message;
      current.toast.classList.toggle('tc-warn', tone === 'warn');
      clearTimeout(current.timer);
      current.timer = setTimeout(() => dismiss(current.toast, key), duration);
      return;
    }

    while (host.children.length >= MAX_VISIBLE) host.firstElementChild?.remove();

    const toast = el('div', {
      className: `tc-toast${tone === 'warn' ? ' tc-warn' : ''}`,
      text: message,
    });
    host.append(toast);

    // Two frames: one to attach, one so the transition has a start value.
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('tc-in')));

    const timer = setTimeout(() => dismiss(toast, key), duration);
    if (key) keyed.set(key, { toast, timer });
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
