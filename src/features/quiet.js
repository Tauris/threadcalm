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
import {
  ACTION_ROW_SELECTOR,
  accessibleTexts,
  closestPost,
  debounce,
  postContainerFor,
} from '../core/dom.js';
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
  cluster: 'tc-quiet-cluster',
  clusterFocus: 'tc-quiet-cluster-focus',
  edge: 'tc-quiet-edge',
  composer: 'tc-quiet-composer-on',
};

/**
 * Which class each setting value puts on the document element.
 *
 * A map rather than a run of toggles: adding a mode and forgetting to toggle
 * it is a silent failure, and it has already happened once.
 */
export const ACTION_MODE_CLASSES = {
  dim: MODE_CLASSES.dim,
  collapse: MODE_CLASSES.collapse,
  cluster: MODE_CLASSES.cluster,
  'cluster-focus': MODE_CLASSES.clusterFocus,
  edge: MODE_CLASSES.edge,
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

/**
 * The expanded editor: the box you actually type into.
 *
 * This must never be hidden. It only exists because the reader just asked for
 * it — by clicking Reply, or the opener below — so hiding it means Reply
 * appears to do nothing at all.
 */
const EDITOR_SELECTOR =
  'textarea, input[type="text"], [role="textbox"], [contenteditable="true"]';

/**
 * The collapsed opener: the avatar-and-pill that *summons* the editor.
 *
 * Before activation Engage renders this as a plain `button` whose name is its
 * own visible text — no `aria-label`, no `placeholder`. Missing it is why
 * reply composers stayed visible while comment ones were tagged. This is the
 * part that is clutter, and the only part that is hidden.
 */
const OPENER_SELECTOR = 'button, [role="button"]';

const COMPOSER_SELECTOR = `${EDITOR_SELECTOR}, ${OPENER_SELECTOR}`;

/**
 * The wrapper that owns the composer's visible box.
 *
 * `[data-testid="focus-catcher-wrapper"]` is a real test id and holds the
 * avatar, the pill and the drag-and-drop area — tagging the button's immediate
 * parent would leave all three on screen.
 */
const COMPOSER_WRAPPER_SELECTOR =
  'form, [role="form"], [data-testid="focus-catcher-wrapper"]';

/** Composer labels are short; anything longer is prose that mentions them. */
const MAX_LABEL_LENGTH = 40;

/** How far to climb past the wrapper looking for padding that belongs to it. */
const MAX_LONE_ANCESTORS = 2;

/**
 * Ancestors that exist only to hold this wrapper.
 *
 * Collapsing the wrapper is not enough to win the row back: Engage puts the
 * composer inside padded blocks of its own, and that padding survives whatever
 * happens to the child. A parent with no other element children is therefore
 * treated as part of the composer. The "no other children" test is what keeps
 * it safe — a block shared with anything else is left alone.
 */
function loneAncestors(element) {
  const found = [];
  let node = element;
  for (let depth = 0; depth < MAX_LONE_ANCESTORS; depth += 1) {
    const parent = node.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    if (parent.children.length !== 1) break;
    found.push(parent);
    node = parent;
  }
  return found;
}

export function createQuietChrome() {
  function applyModes() {
    const root = document.documentElement;
    const mode = settings.get('quiet.actions');

    for (const [value, className] of Object.entries(ACTION_MODE_CLASSES)) {
      root.classList.toggle(className, mode === value);
    }
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
      // A wrapper can hold the opener now and the editor a moment later, so
      // decide per wrapper rather than per element: one editor inside is
      // enough to make the whole wrapper off-limits.
      const wrappers = new Map();

      for (const element of root.querySelectorAll(COMPOSER_SELECTOR)) {
        // accessibleTexts() covers visible descendant text as well as the
        // naming attributes, which is what finds the collapsed reply button.
        const names = accessibleTexts(element).filter(
          (text) => text.length <= MAX_LABEL_LENGTH,
        );
        if (!names.some((name) => COMPOSER_LABELS.some((pattern) => pattern.test(name)))) {
          continue;
        }

        // Tag the wrapper rather than the field: collapsing the field itself
        // would fight whatever sizing Engage applies to it while typing.
        const wrapper = element.closest(COMPOSER_WRAPPER_SELECTOR) ?? element.parentElement;
        if (!wrapper) continue;

        const entry = wrappers.get(wrapper) ?? { hasEditor: false };
        entry.hasEditor = entry.hasEditor || element.matches(EDITOR_SELECTOR);
        wrappers.set(wrapper, entry);
      }

      for (const [wrapper, { hasEditor }] of wrappers) {
        const targets = [wrapper, ...loneAncestors(wrapper)];

        if (hasEditor) {
          // The reader opened this one. Un-tag it, including a wrapper tagged
          // on an earlier pass while it still held nothing but the opener.
          for (const target of targets) target.classList.remove(COMPOSER_CLASS);
          continue;
        }

        if (wrapper.classList.contains(COMPOSER_CLASS)) continue;
        for (const target of targets) target.classList.add(COMPOSER_CLASS);
        composers += 1;

        // The opener keeps its place in the tab order, so focus can still
        // reach it; the post around it is tagged so the CSS has that anchor.
        const post = closestPost(wrapper);
        if (post) post.classList.add(POST_CLASS);
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
