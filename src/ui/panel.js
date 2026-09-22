/**
 * The status panel and the settings sheet.
 *
 * The panel is the successor to the original script's status div: it still
 * reports how much has been expanded, but it is now also the pause control
 * and the way into settings, so the Tampermonkey menu is a convenience rather
 * than the only handle on the script.
 *
 * The settings sheet renders itself from `SCHEMA`. Adding a setting means
 * adding one schema entry — there is no second list of form fields to keep in
 * step, which is the failure mode this arrangement exists to prevent.
 */
import { bus, EVENTS } from '../core/bus.js';
import { el } from '../core/dom.js';
import { LINKS, PUBLIC_REPO } from '../meta.js';
import * as settings from '../core/settings.js';
import { GROUPS } from '../core/settings.js';

const PANEL_ID = 'tc-panel';
const SETTINGS_ID = 'tc-settings';

export function createPanel({ expander, highlighter, version }) {
  let panel = null;
  let statusText = null;
  let pauseButton = null;
  let sheet = null;
  let unsubscribes = [];

  // ------------------------------------------------------------- panel --

  function build() {
    statusText = el('span', { className: 'tc-status', text: 'Watching for threads…' });

    pauseButton = el('button', {
      type: 'button',
      text: 'Pause',
      title: 'Pause automatic expansion (e)',
      on: { click: () => expander.togglePause() },
    });

    panel = el(
      'div',
      { id: PANEL_ID, role: 'status', 'aria-live': 'polite' },
      el(
        'div',
        { className: 'tc-row' },
        el('span', { className: 'tc-dot', 'aria-hidden': 'true' }),
        statusText,
        pauseButton,
        el('button', {
          type: 'button',
          text: 'Settings',
          title: 'Open settings (s)',
          on: { click: openSettings },
        }),
        // The only visible affordance for the shortcuts. Without it nobody
        // discovers that pressing ? does anything.
        el('button', {
          type: 'button',
          text: '?',
          title: 'Keyboard shortcuts (?)',
          'aria-label': 'Show keyboard shortcuts',
          on: { click: () => bus.emit(EVENTS.SHOW_HELP) },
        }),
        el('button', {
          type: 'button',
          text: '×',
          title: 'Hide this panel (p)',
          'aria-label': 'Hide the Threadcalm panel',
          on: { click: hide },
        }),
      ),
    );

    document.body.append(panel);
    applyVisibility();
  }

  function applyVisibility() {
    if (!panel) return;
    panel.hidden = !settings.get('general.showPanel');
  }

  /**
   * Hides the panel, and says how to get it back.
   *
   * Without the hint the close button is a one-way door: the panel is the
   * obvious way into settings, so hiding it also hides the control that would
   * un-hide it.
   */
  function hide() {
    settings.update({ 'general.showPanel': false });
    bus.emit(EVENTS.TOAST, {
      message: 'Panel hidden — press p to bring it back, or s for settings',
      duration: 5000,
    });
  }

  function setStatus(message) {
    if (statusText) statusText.textContent = message;
  }

  function onProgress({ totalClicks, settled }) {
    const noun = `${totalClicks} item${totalClicks === 1 ? '' : 's'}`;
    setStatus(settled ? `Thread expanded — ${noun}` : `Expanding… ${noun}`);
  }

  function onState({ enabled, paused, totalClicks, limitReached }) {
    if (!panel) return;
    panel.classList.toggle('tc-paused', paused || !enabled);
    panel.classList.toggle('tc-limit', limitReached);
    if (pauseButton) {
      pauseButton.textContent = paused ? 'Resume' : 'Pause';
      pauseButton.title = paused
        ? 'Resume automatic expansion (e)'
        : 'Pause automatic expansion (e)';
    }
    if (limitReached) {
      setStatus(`Click limit reached at ${totalClicks}`);
    } else if (paused) {
      setStatus('Expansion paused');
    } else if (!enabled) {
      setStatus('Expansion off');
    }
  }

  // ---------------------------------------------------------- settings --

  /** One form control per schema entry, bound straight to `settings.update`. */
  function renderField(definition) {
    const value = settings.get(definition.key);
    const help = definition.help
      ? el('p', { className: 'tc-help', text: definition.help })
      : null;

    const commit = (next) => settings.update({ [definition.key]: next });

    switch (definition.type) {
      case 'boolean':
        return el(
          'div',
          { className: 'tc-field' },
          el(
            'label',
            {},
            el('input', {
              type: 'checkbox',
              checked: value ? 'checked' : null,
              on: { change: (event) => commit(event.target.checked) },
            }),
            el('span', { text: definition.label }),
          ),
          help,
        );

      case 'number':
        return el(
          'div',
          { className: 'tc-field' },
          el(
            'label',
            {},
            el('span', { text: definition.label }),
            el('input', {
              type: 'number',
              value: String(value),
              min: definition.min ?? null,
              max: definition.max ?? null,
              step: definition.step ?? 1,
              on: { change: (event) => commit(event.target.value) },
            }),
          ),
          help,
        );

      case 'select': {
        const select = el('select', {
          on: { change: (event) => commit(event.target.value) },
        });
        for (const option of definition.options ?? []) {
          select.append(
            el('option', {
              value: option.value,
              selected: option.value === value ? 'selected' : null,
              text: option.label,
            }),
          );
        }
        return el(
          'div',
          { className: 'tc-field' },
          el('label', {}, el('span', { text: definition.label }), select),
          help,
        );
      }

      case 'multiselect': {
        const chosen = new Set(value);
        const choices = el('div', { className: 'tc-choices' });
        for (const option of definition.options ?? []) {
          choices.append(
            el(
              'label',
              {},
              el('input', {
                type: 'checkbox',
                checked: chosen.has(option.value) ? 'checked' : null,
                on: {
                  change: (event) => {
                    if (event.target.checked) chosen.add(option.value);
                    else chosen.delete(option.value);
                    commit([...chosen]);
                  },
                },
              }),
              el('span', { text: option.label }),
            ),
          );
        }
        return el(
          'div',
          { className: 'tc-field' },
          el('span', { text: definition.label }),
          choices,
          help,
        );
      }

      case 'lines':
        return el(
          'div',
          { className: 'tc-field' },
          el(
            'label',
            {},
            el('span', { text: definition.label }),
            el('textarea', {
              spellcheck: 'false',
              on: {
                change: (event) => commit(event.target.value.split('\n')),
              },
              text: (value ?? []).join('\n'),
            }),
          ),
          help,
        );

      default:
        return null;
    }
  }

  /**
   * External links, or nothing at all.
   *
   * Gated on PUBLIC_REPO (src/meta.js) so that a fork kept private offers no
   * links at all rather than links that 404.
   */
  function buildLinks() {
    if (!PUBLIC_REPO) return null;

    const link = (href, text) =>
      el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });

    return el(
      'p',
      { className: 'tc-links' },
      link(LINKS.docs, 'Full documentation'),
      el('span', { text: ' · ', 'aria-hidden': 'true' }),
      link(LINKS.issues, 'Report an issue'),
      el('span', { text: ' · ', 'aria-hidden': 'true' }),
      link(LINKS.repository, 'Source on GitHub'),
    );
  }

  function buildSheet() {
    const body = el(
      'div',
      { className: 'tc-sheet', role: 'document' },
      el('h2', { text: 'Threadcalm' }),
      el('p', { className: 'tc-version', text: `Version ${version}` }),
    );

    for (const group of GROUPS) {
      const definitions = settings.definitionsFor(group.id);
      if (definitions.length === 0) continue;

      const fieldset = el('fieldset', {}, el('legend', { text: group.title }));
      for (const definition of definitions) {
        const field = renderField(definition);
        if (field) fieldset.append(field);
      }
      body.append(fieldset);
    }

    body.append(
      el(
        'div',
        { className: 'tc-actions' },
        el('button', {
          type: 'button',
          text: 'Forget seen posts',
          title: 'Clear the local "new post" history',
          on: {
            click: () => {
              highlighter?.forgetSeen?.();
              bus.emit(EVENTS.TOAST, { message: 'Seen-post history cleared' });
            },
          },
        }),
        el('button', {
          type: 'button',
          text: 'Reset to defaults',
          on: {
            click: () => {
              settings.reset();
              // Rebuild so every control reflects the restored values.
              closeSettings();
              openSettings();
              bus.emit(EVENTS.TOAST, { message: 'Settings reset' });
            },
          },
        }),
        el('button', { type: 'button', text: 'Close', on: { click: closeSettings } }),
      ),
    );

    const links = buildLinks();
    if (links) body.append(links);

    return el(
      'div',
      {
        id: SETTINGS_ID,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Threadcalm settings',
        on: {
          click: (event) => {
            if (event.target.id === SETTINGS_ID) closeSettings();
          },
        },
      },
      body,
    );
  }

  function openSettings() {
    if (sheet) return true;
    sheet = buildSheet();
    document.body.append(sheet);
    sheet.querySelector('input, select, textarea, button')?.focus();
    return true;
  }

  /** @returns {boolean} whether anything was actually closed */
  function closeSettings() {
    if (!sheet) return false;
    sheet.remove();
    sheet = null;
    return true;
  }

  return {
    start() {
      build();
      unsubscribes = [
        bus.on(EVENTS.EXPAND_PROGRESS, onProgress),
        bus.on(EVENTS.EXPAND_STATE, onState),
        bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => {
          if ('general.showPanel' in changed) applyVisibility();
        }),
      ];
    },

    stop() {
      for (const off of unsubscribes) off();
      unsubscribes = [];
      closeSettings();
      panel?.remove();
      panel = null;
    },

    openSettings,
    closeSettings,
    setStatus,
    hide,
    show() {
      settings.update({ 'general.showPanel': true });
    },
    /** @returns {boolean} whether the panel is now visible */
    toggle() {
      if (settings.get('general.showPanel')) {
        hide();
        return false;
      }
      settings.update({ 'general.showPanel': true });
      return true;
    },
  };
}
