/**
 * Minimal synchronous event bus.
 *
 * Features publish facts ("a thread was expanded", "settings changed") and the
 * UI subscribes to them, so no feature needs a reference to the panel and the
 * panel needs no reference to any feature.
 */
export function createBus() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  return {
    /**
     * @param {string} event
     * @param {Function} handler
     * @returns {() => void} unsubscribe
     */
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    },

    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      for (const handler of [...handlers]) {
        try {
          handler(payload);
        } catch (error) {
          // A broken listener must never stop the emitter or its siblings.
          console.error('[Threadcalm] listener failed for', event, error);
        }
      }
    },

    clear() {
      listeners.clear();
    },
  };
}

export const bus = createBus();

/** Event names, centralised so typos surface as a missing constant. */
export const EVENTS = {
  NAVIGATE: 'navigate',
  DOM_CHANGED: 'dom-changed',
  SETTINGS_CHANGED: 'settings-changed',
  EXPAND_PROGRESS: 'expand-progress',
  EXPAND_STATE: 'expand-state',
  TOAST: 'toast',
  SHOW_HELP: 'show-help',
  COPY_DIAGNOSTICS: 'copy-diagnostics',
};
