/**
 * Hiding suggested, promoted and sponsored cards.
 *
 * The matching rule is deliberately narrow: only a *short, whole* label may
 * mark a card as promoted. A post that merely contains the word "sponsored"
 * in its text must never disappear, so patterns are anchored in the label
 * packs and the candidate's text length is capped here as well.
 *
 * As with the translate tamer, nothing is removed — a class is added and CSS
 * hides it, which is reversible the moment the setting is turned off.
 */
import { accessibleTexts, closestPost, debounce } from '../core/dom.js';
import { log } from '../core/logger.js';
import * as settings from '../core/settings.js';

export const HIDDEN_CLASS = 'tc-decluttered';

/** A promoted badge is a word or two, never a sentence. */
const MAX_LABEL_LENGTH = 40;

export function createDeclutterer({ matchers }) {
  let active = matchers;

  function sweep(root = document) {
    if (!settings.get('declutter.enabled')) return 0;
    if (!active.promoted) return 0;

    let hidden = 0;
    for (const element of root.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6')) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.children.length > 0) continue; // leaf text nodes only

      const texts = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH });
      if (!texts.some((text) => active.promoted.test(text))) continue;

      const card = closestPost(element) ?? element.closest('[role="listitem"], li, section');
      if (!card || card.classList.contains(HIDDEN_CLASS)) continue;

      card.classList.add(HIDDEN_CLASS);
      hidden += 1;
    }

    if (hidden > 0) log.debug(`decluttered ${hidden} card(s)`);
    return hidden;
  }

  function restore() {
    for (const element of document.querySelectorAll(`.${HIDDEN_CLASS}`)) {
      element.classList.remove(HIDDEN_CLASS);
    }
  }

  const scheduleSweep = debounce(() => sweep(), 250);

  return {
    start() {
      sweep();
    },
    stop: restore,
    onDomChanged: scheduleSweep,
    onNavigate: scheduleSweep,
    onSettingsChanged() {
      if (settings.get('declutter.enabled')) sweep();
      else restore();
    },
    setMatchers(next) {
      active = next;
      scheduleSweep();
    },
    sweep,
  };
}
