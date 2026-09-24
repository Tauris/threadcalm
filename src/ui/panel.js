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
import { LINKS, PUBLIC_REPO, brandLink } from '../meta.js';
import { brandMark, icon } from './icons.js';
import * as settings from '../core/settings.js';
import { GROUPS } from '../core/settings.js';

const PANEL_ID = 'tc-panel';
const SETTINGS_ID = 'tc-settings';

export function createPanel({ expander, highlighter, version, channel = 'dev', build: stamp = 'dev' }) {
  // Shown in the panel and in the settings sheet. The stamp changes with
  // every change to the sources, so it answers "am I running what I just
  // built?" without opening a console.
  const buildLabel = channel === 'stable' ? `v${version} · ${stamp}`
    : `v${version} · ${channel} · ${stamp}`;
  let panel = null;
  let statusText = null;
  let pauseButton = null;
  let sheet = null;
  let unsubscribes = [];

  // ------------------------------------------------------------- panel --

  /** A square, icon-only button. The label is its accessible name and tooltip. */
  function iconButton(name, label, onClick) {
    return el(
      'button',
      {
        type: 'button',
        className: 'tc-icon-btn',
        title: label,
        'aria-label': label,
        on: { click: onClick },
      },
      icon(name),
    );
  }

  function build() {
    // The live region is the status line alone. Putting it on the whole panel
    // would have every button change announced as well.
    statusText = el('span', {
      className: 'tc-status',
      role: 'status',
      'aria-live': 'polite',
      text: 'Watching for threads…',
    });

    pauseButton = iconButton('pause', 'Pause automatic expansion (e)', () => expander.togglePause());
    pauseButton.setAttribute('aria-pressed', 'false');

    panel = el(
      'div',
      { id: PANEL_ID, role: 'region', 'aria-label': 'Threadcalm' },
      // Identity first: what this is, which build, and where it came from --
      // the panel appears on a page nobody asked it to appear on.
      el(
        'div',
        { className: 'tc-build' },
        brandMark(),
        brandLink(el),
        channel === 'stable' ? null : el('span', { className: 'tc-chip-pre', text: channel }),
        el('span', {
          className: 'tc-stamp',
          text: `v${version} · ${stamp}`,
          title: 'Version and build stamp',
        }),
      ),
      el(
        'div',
        { className: 'tc-row' },
        el('span', { className: 'tc-dot', 'aria-hidden': 'true' }),
        statusText,
        el(
          'div',
          { className: 'tc-tools' },
          pauseButton,
          iconButton('settings', 'Settings (s)', openSettings),
          // The only visible affordance for the shortcuts. Without it nobody
          // discovers that pressing ? does anything.
          iconButton('help', 'Keyboard shortcuts (?)', () => bus.emit(EVENTS.SHOW_HELP)),
          iconButton('close', 'Hide this panel (p)', hide),
        ),
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
    // The dot pulses only while work is actually happening, so a still dot
    // means a quiet script.
    panel?.classList.toggle('tc-busy', !settled);
  }

  let shownPaused = null;

  function onState({ enabled, paused, totalClicks, limitReached }) {
    if (!panel) return;
    panel.classList.toggle('tc-paused', paused || !enabled);
    panel.classList.toggle('tc-limit', limitReached);
    if (paused || !enabled || limitReached) panel.classList.remove('tc-busy');

    if (pauseButton && shownPaused !== paused) {
      shownPaused = paused;
      const label = paused ? 'Resume automatic expansion (e)' : 'Pause automatic expansion (e)';
      pauseButton.replaceChildren(icon(paused ? 'play' : 'pause'));
      pauseButton.title = label;
      pauseButton.setAttribute('aria-label', label);
      pauseButton.setAttribute('aria-pressed', paused ? 'true' : 'false');
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

  /** A stable, attribute-safe id for a setting's row. */
  function fieldId(definition) {
    return `tc-field-${definition.key.replace(/[^a-z0-9]+/gi, '-')}`;
  }

  /**
   * Splits a trailing unit off a label: "Scan delay (ms)" -> "Scan delay", "ms".
   * The unit is then shown beside the number it measures, where it is read.
   */
  function splitUnit(label) {
    const match = /^(.*?)\s*\((ms|px)\)$/.exec(label);
    return match ? { text: match[1], unit: match[2] } : { text: label, unit: null };
  }

  /** The left-hand half of every row: what the setting is, and what it does. */
  function describe(definition, id) {
    const { text } = splitUnit(definition.label);
    return el(
      'span',
      { className: 'tc-field-text' },
      el('span', { className: 'tc-label', id: `${id}-label`, text }),
      definition.help
        ? el('span', { className: 'tc-help', id: `${id}-help`, text: definition.help })
        : null,
    );
  }

  /**
   * One row per schema entry, bound straight to `settings.update`.
   *
   * The native checkbox and radio inputs stay in the document -- focusable,
   * labelled, operable from the keyboard -- and are only visually replaced by
   * the switch, card or pill drawn beside them. Nothing here is a div that
   * pretends to be a control.
   */
  function renderField(definition) {
    const value = settings.get(definition.key);
    const id = fieldId(definition);
    const describedBy = definition.help ? `${id}-help` : null;
    const commit = (next) => settings.update({ [definition.key]: next });

    switch (definition.type) {
      case 'boolean':
        return el(
          'label',
          { className: 'tc-field tc-field-inline' },
          describe(definition, id),
          el(
            'span',
            { className: 'tc-control' },
            el('input', {
              type: 'checkbox',
              className: 'tc-vh',
              checked: value ? 'checked' : null,
              'aria-labelledby': `${id}-label`,
              'aria-describedby': describedBy,
              on: { change: (event) => commit(event.target.checked) },
            }),
            el('span', { className: 'tc-switch', 'aria-hidden': 'true' }),
          ),
        );

      case 'number': {
        const { unit } = splitUnit(definition.label);
        return el(
          'label',
          { className: 'tc-field tc-field-inline' },
          describe(definition, id),
          el(
            'span',
            { className: 'tc-control' },
            el('input', {
              type: 'number',
              value: String(value),
              min: definition.min ?? null,
              max: definition.max ?? null,
              step: definition.step ?? 1,
              inputmode: 'decimal',
              'aria-labelledby': unit ? `${id}-label ${id}-unit` : `${id}-label`,
              'aria-describedby': describedBy,
              on: { change: (event) => commit(event.target.value) },
            }),
            // Rendered even when empty, so every number field in the sheet
            // shares one right edge whether or not it carries a unit.
            el('span', {
              className: 'tc-unit',
              id: unit ? `${id}-unit` : null,
              'aria-hidden': unit ? null : 'true',
              text: unit ?? '',
            }),
          ),
        );
      }

      case 'select': {
        const options = definition.options ?? [];

        // A choice that is a trade rather than a taste is drawn as cards, each
        // showing what it gains and costs, so the comparison happens at the
        // point of choosing rather than in a legend beside a dropdown.
        if (options.some((option) => option.gain || option.cost)) {
          const cards = el('div', {
            className: 'tc-cards',
            role: 'radiogroup',
            'aria-labelledby': `${id}-label`,
            'aria-describedby': describedBy,
          });
          for (const option of options) {
            cards.append(
              el(
                'label',
                { className: 'tc-card' },
                el('input', {
                  type: 'radio',
                  className: 'tc-vh',
                  name: id,
                  value: option.value,
                  checked: option.value === value ? 'checked' : null,
                  on: {
                    change: (event) => {
                      if (event.target.checked) commit(option.value);
                    },
                  },
                }),
                el(
                  'span',
                  { className: 'tc-card-face' },
                  el('span', { className: 'tc-card-title', text: option.label }),
                  option.gain ? el('span', { className: 'tc-gain', text: option.gain }) : null,
                  option.cost ? el('span', { className: 'tc-cost', text: option.cost }) : null,
                ),
              ),
            );
          }
          return el(
            'div',
            { className: 'tc-field tc-field-stacked' },
            describe(definition, id),
            cards,
          );
        }

        const select = el('select', {
          'aria-labelledby': `${id}-label`,
          'aria-describedby': describedBy,
          on: { change: (event) => commit(event.target.value) },
        });
        for (const option of options) {
          select.append(
            el('option', {
              value: option.value,
              selected: option.value === value ? 'selected' : null,
              text: option.label,
            }),
          );
        }
        return el(
          'label',
          { className: 'tc-field tc-field-inline' },
          describe(definition, id),
          el('span', { className: 'tc-control' }, select),
        );
      }

      case 'multiselect': {
        const chosen = new Set(value);
        const pills = el('div', {
          className: 'tc-pills',
          role: 'group',
          'aria-labelledby': `${id}-label`,
          'aria-describedby': describedBy,
        });
        for (const option of definition.options ?? []) {
          pills.append(
            el(
              'label',
              { className: 'tc-pill' },
              el('input', {
                type: 'checkbox',
                className: 'tc-vh',
                checked: chosen.has(option.value) ? 'checked' : null,
                on: {
                  change: (event) => {
                    if (event.target.checked) chosen.add(option.value);
                    else chosen.delete(option.value);
                    commit([...chosen]);
                  },
                },
              }),
              el('span', { className: 'tc-pill-face', text: option.label }),
            ),
          );
        }
        return el(
          'div',
          { className: 'tc-field tc-field-stacked' },
          describe(definition, id),
          pills,
        );
      }

      case 'lines':
        return el(
          'div',
          { className: 'tc-field tc-field-stacked' },
          describe(definition, id),
          el('textarea', {
            spellcheck: 'false',
            rows: '3',
            'aria-labelledby': `${id}-label`,
            'aria-describedby': describedBy,
            on: {
              change: (event) => commit(event.target.value.split('\n')),
            },
            text: (value ?? []).join('\n'),
          }),
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

  function textButton(text, onClick, { variant = null, title = null } = {}) {
    return el('button', {
      type: 'button',
      className: variant ? `tc-btn tc-btn-${variant}` : 'tc-btn',
      text,
      title,
      on: { click: onClick },
    });
  }

  function buildSheet() {
    const head = el(
      'header',
      { className: 'tc-sheet-head' },
      brandMark(),
      el('h2', {}, brandLink(el)),
      el('span', { className: 'tc-stamp', text: buildLabel }),
      el('span', { className: 'tc-spacer' }),
      iconButton('close', 'Close settings (Esc)', closeSettings),
    );

    const content = el('div', { className: 'tc-sheet-body' });
    for (const group of GROUPS) {
      const definitions = settings.definitionsFor(group.id);
      if (definitions.length === 0) continue;

      const titleId = `tc-group-${group.id}`;
      const section = el(
        'section',
        { className: 'tc-group', 'aria-labelledby': titleId },
        el('h3', { className: 'tc-group-title', id: titleId, text: group.title }),
      );
      for (const definition of definitions) {
        const field = renderField(definition);
        if (field) section.append(field);
      }
      content.append(section);
    }

    const links = buildLinks();
    if (links) content.append(links);

    const foot = el(
      'footer',
      { className: 'tc-sheet-foot' },
      el(
        'div',
        { className: 'tc-foot-group' },
        // The diagnostics report is the answer to "is it still working when
        // it should be idle?", so it belongs where someone worried about that
        // will actually look, not only in the manager's menu.
        textButton('Copy diagnostics', () => bus.emit(EVENTS.COPY_DIAGNOSTICS), {
          title: 'Selector health and how hard the script has been working, for bug reports',
        }),
        textButton(
          'Forget seen posts',
          () => {
            highlighter?.forgetSeen?.();
            bus.emit(EVENTS.TOAST, { message: 'Seen-post history cleared' });
          },
          { title: 'Clear the local "new post" history' },
        ),
      ),
      el(
        'div',
        { className: 'tc-foot-group' },
        textButton(
          'Reset to defaults',
          () => {
            settings.reset();
            // Rebuild so every control reflects the restored values.
            closeSettings();
            openSettings();
            bus.emit(EVENTS.TOAST, { message: 'Settings reset' });
          },
          { variant: 'danger' },
        ),
        textButton('Done', closeSettings, { variant: 'primary' }),
      ),
    );

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
      el('div', { className: 'tc-sheet', role: 'document' }, head, content, foot),
    );
  }

  function openSettings() {
    if (sheet) return true;
    sheet = buildSheet();
    document.body.append(sheet);
    // Straight to the first setting rather than the close button in the header.
    (
      sheet.querySelector('.tc-sheet-body :is(input, select, textarea)')
      ?? sheet.querySelector('button')
    )?.focus();
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
