/**
 * Compact reading mode.
 *
 * A single class on `<html>` plus one CSS custom property. Everything else
 * lives in the stylesheet, which keeps the feature reversible and keeps
 * layout guesswork in one reviewable place.
 *
 * The rules it applies are intentionally structural — `[role="complementary"]`,
 * `[role="main"]`, `aside` — rather than class-based, for the same reason the
 * rest of the script avoids `fui-*`: those names are build output.
 */
import * as settings from '../core/settings.js';

export const READING_CLASS = 'tc-reading';
export const NO_RAILS_CLASS = 'tc-no-rails';
export const NO_BANNER_CLASS = 'tc-no-banner';

export function createReadingMode() {
  function apply() {
    const root = document.documentElement;
    const enabled = settings.get('reading.enabled');

    root.classList.toggle(READING_CLASS, enabled);
    root.classList.toggle(NO_RAILS_CLASS, enabled && settings.get('reading.hideSidebars'));
    root.classList.toggle(NO_BANNER_CLASS, enabled && settings.get('reading.hideBanner'));
    root.style.setProperty('--tc-reading-width', `${settings.get('reading.maxWidth')}px`);
  }

  return {
    start: apply,
    stop() {
      document.documentElement.classList.remove(READING_CLASS, NO_RAILS_CLASS, NO_BANNER_CLASS);
    },
    onSettingsChanged: apply,
    onNavigate: apply,
    toggle() {
      settings.update({ 'reading.enabled': !settings.get('reading.enabled') });
      return settings.get('reading.enabled');
    },
    isEnabled: () => settings.get('reading.enabled'),
  };
}
