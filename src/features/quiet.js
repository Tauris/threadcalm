/**
 * Quieting the chrome that sits under every post.
 *
 * Two pieces of furniture repeat once per post and cost a row each:
 *
 *   the action bar    Like / Comment / Reply / Share / More actions,
 *                     `[data-testid="overflow-set"]`
 *   the composer      an inline "Write a comment" box
 *
 * Neither is wanted while reading; both are wanted the instant you reach for
 * them. So they are revealed on hover and on focus, and hidden again after.
 *
 * Accessibility is the constraint that shapes the implementation. `display:
 * none` would remove the buttons from the tab order, so a keyboard user could
 * never reach them — the page's own guidance is explicit about this. Instead
 * the quiet state uses opacity and `pointer-events`, and every rule is written
 * so that `:focus-within` overrides it. Tabbing into a post reveals its row
 * exactly as hovering does.
 *
 * All of the work is CSS. This module only marks the containers, so the class
 * names the stylesheet keys off are ours rather than Engage's.
 */
import { ACTION_ROW_SELECTOR, debounce, postContainerFor } from '../core/dom.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';

/** Marks a post container, so CSS can use its :hover / :focus-within. */
export const POST_CLASS = 'tc-quiet-post';

/** Marks the composer's own wrapper. */
export const COMPOSER_CLASS = 'tc-quiet-composer';

/** Mode classes on <html>, so a setting change is one class toggle. */
export const MODE_CLASSES = {
  dim: 'tc-quiet-dim',
  collapse: 'tc-quiet-collapse',
  composer: 'tc-quiet-composer-on',
};

/**
 * Controls that open the inline composer, by accessible name.
 * Kept narrow: only a whole-label match counts.
 */
const COMPOSER_LABELS = [
  /^write a comment$/i,
  /^write a reply$/i,
  /^add a comment$/i,
  /^kommentar schreiben$/i,
  /^antwort schreiben$/i,
  /^écrire un commentaire$/i,
  /^escribir un comentario$/i,
];

export function createQuietChrome() {
  function applyModes() {
    const root = document.documentElement;
    const mode = settings.get('quiet.actions');

    root.classList.toggle(MODE_CLASSES.dim, mode === 'dim');
    root.classList.toggle(MODE_CLASSES.collapse, mode === 'collapse');
    root.classList.toggle(MODE_CLASSES.composer, settings.get('quiet.composer'));
  }

  /** Tags each action row's post, and each composer wrapper. */
  function sweep(root = document) {
    let posts = 0;

    for (const row of root.querySelectorAll(ACTION_ROW_SELECTOR)) {
      const post = postContainerFor(row);
      if (post && !post.classList.contains(POST_CLASS)) {
        post.classList.add(POST_CLASS);
        posts += 1;
      }
    }

    let composers = 0;
    if (settings.get('quiet.composer')) {
      for (const element of root.querySelectorAll('textarea, input[type="text"], [role="textbox"], [contenteditable="true"]')) {
        const label =
          element.getAttribute('aria-label') ??
          element.getAttribute('placeholder') ??
          '';
        if (!COMPOSER_LABELS.some((pattern) => pattern.test(label.trim()))) continue;

        // Tag the wrapper rather than the field: collapsing the field itself
        // would fight whatever sizing Engage applies to it while typing.
        const wrapper = element.closest('form, [role="form"]') ?? element.parentElement;
        if (wrapper && !wrapper.classList.contains(COMPOSER_CLASS)) {
          wrapper.classList.add(COMPOSER_CLASS);
          composers += 1;
        }
      }
    }

    if (posts || composers) {
      log.debug(`quiet chrome: tagged ${posts} post(s), ${composers} composer(s)`);
    }
    return { posts, composers };
  }

  function restore() {
    const root = document.documentElement;
    for (const value of Object.values(MODE_CLASSES)) root.classList.remove(value);
    for (const element of document.querySelectorAll(`.${POST_CLASS}`)) {
      element.classList.remove(POST_CLASS);
    }
    for (const element of document.querySelectorAll(`.${COMPOSER_CLASS}`)) {
      element.classList.remove(COMPOSER_CLASS);
    }
  }

  const scheduleSweep = debounce(() => sweep(), 250);

  return {
    start() {
      applyModes();
      sweep();
    },
    stop: restore,
    onDomChanged: scheduleSweep,
    onNavigate: scheduleSweep,
    onSettingsChanged(changed) {
      if ('quiet.actions' in changed || 'quiet.composer' in changed) {
        applyModes();
        sweep();
      }
    },
    sweep,
  };
}
