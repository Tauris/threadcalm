/**
 * Reading mode: one key into a quiet page, and the same key back out.
 *
 * It began as layout -- a narrower column, hidden side rails, tighter lines --
 * aimed at landmarks Engage turned out not to use, so on a real page it did
 * little more than centre the column. It is now a preset over features known
 * to work: the action bar as a corner cluster, comment boxes and copy buttons
 * out of sight, translate controls as an icon, promoted cards gone, and the
 * app bar hidden.
 *
 * It never writes the reader's settings. It imposes overrides (see
 * settings.setOverrides), so switching it off returns every choice exactly as
 * it was. And it only ever makes things quieter: a setting the reader has
 * already made at least as quiet is left alone.
 */
import * as settings from '../core/settings.js';

export const READING_CLASS = 'tc-reading';
export const NO_BANNER_CLASS = 'tc-no-banner';

/**
 * What reading mode sets, and which of the reader's own values are already at
 * least that quiet. A key without a `quieter` list keeps only its own value.
 */
export const PRESET = {
  'quiet.actions': { value: 'cluster', quieter: ['cluster', 'cluster-focus'] },
  'quiet.composer': { value: true },
  'copy.showButtons': { value: 'focus', quieter: ['focus', 'off'] },
  'translate.mode': { value: 'compact', quieter: ['compact', 'known', 'hide'] },
  'declutter.enabled': { value: true },
};

/** The overrides reading mode imposes, given the reader's own settings now. */
export function readingOverrides() {
  const imposed = {};
  for (const [key, { value, quieter = [value] }] of Object.entries(PRESET)) {
    if (!quieter.includes(settings.getOwn(key))) imposed[key] = value;
  }
  return imposed;
}

export function createReadingMode() {
  function apply() {
    const root = document.documentElement;
    const enabled = settings.getOwn('reading.enabled');

    root.classList.toggle(READING_CLASS, enabled);
    root.classList.toggle(NO_BANNER_CLASS, enabled && !settings.getOwn('reading.keepBanner'));

    // Recomputed on every change, because which keys need overriding depends
    // on the reader's own values. Emits nothing when nothing moves, so reacting
    // to the event this may itself raise cannot loop.
    settings.setOverrides(enabled ? readingOverrides() : {});
  }

  return {
    start: apply,
    stop() {
      document.documentElement.classList.remove(READING_CLASS, NO_BANNER_CLASS);
      settings.setOverrides({});
    },
    onSettingsChanged: apply,
    onNavigate: apply,
    toggle() {
      settings.update({ 'reading.enabled': !settings.getOwn('reading.enabled') });
      return settings.getOwn('reading.enabled');
    },
    isEnabled: () => settings.getOwn('reading.enabled'),
  };
}
