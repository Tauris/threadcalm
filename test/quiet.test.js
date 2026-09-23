import { beforeEach, describe, expect, it } from 'vitest';
import * as settings from '../src/core/settings.js';
import {
  ACTION_MODE_CLASSES,
  COMPOSER_CLASS,
  MODE_CLASSES,
  POST_CLASS,
  createQuietChrome,
} from '../src/features/quiet.js';
import { stubLayout } from './fixtures.js';

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

function quiet() {
  const feature = createQuietChrome();
  feature.start();
  return feature;
}

/**
 * The collapsed reply composer, as Engage renders it before activation.
 *
 * The button carries no `aria-label` and no `placeholder` — its name is the
 * visible text of a nested div. Reproducing that exactly is the point of this
 * fixture: a detector that reads naming attributes only will pass a simpler
 * fixture and still miss the real thing.
 */
function mountCollapsedReplyComposer() {
  document.body.innerHTML = `
    <div id="outer">
      <div id="padded">
        <div data-testid="focus-catcher-wrapper" id="wrapper">
          <div id="inner">
            <div style="cursor: pointer;">
              <div id="row">
                <div aria-hidden="true" id="avatar"></div>
                <div id="pill-host">
                  <button id="opener" aria-expanded="false" type="button">
                    <div><div>Write a reply</div></div>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div aria-hidden="true" id="dropzone"><span>Drag files to attach</span></div>
        </div>
      </div>
    </div>
  `;
  const id = (value) => document.getElementById(value);
  return {
    outer: id('outer'),
    padded: id('padded'),
    wrapper: id('wrapper'),
    pillHost: id('pill-host'),
    opener: id('opener'),
  };
}

describe('the collapsed reply composer', () => {
  beforeEach(() => {
    settings.update({ 'quiet.composer': true });
  });

  it('is found although its name is only visible descendant text', () => {
    const { wrapper } = mountCollapsedReplyComposer();
    quiet();
    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(true);
  });

  it('tags the whole wrapper, not the button row', () => {
    const { wrapper, pillHost, opener } = mountCollapsedReplyComposer();
    quiet();

    // The avatar, the pill and the drop zone all live under the wrapper;
    // tagging the button's parent would leave every one of them on screen.
    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(true);
    expect(pillHost.classList.contains(COMPOSER_CLASS)).toBe(false);
    expect(opener.classList.contains(COMPOSER_CLASS)).toBe(false);
  });

  it('collapses the padded blocks that exist only to hold it', () => {
    const { outer, padded } = mountCollapsedReplyComposer();
    quiet();

    // Their padding would otherwise survive the composer going to zero height.
    expect(padded.classList.contains(COMPOSER_CLASS)).toBe(true);
    expect(outer.classList.contains(COMPOSER_CLASS)).toBe(true);
  });

  it('leaves a block it shares with anything else alone', () => {
    const { padded } = mountCollapsedReplyComposer();
    padded.append(document.createElement('span'));
    quiet();
    expect(padded.classList.contains(COMPOSER_CLASS)).toBe(false);
  });
});

describe('composer detection', () => {
  beforeEach(() => {
    settings.update({ 'quiet.composer': true });
  });

  it('never hides an expanded editor', () => {
    // Hiding this is what made Reply appear to do nothing: the editor opens
    // because the reader asked for it, inside the very wrapper being hidden.
    document.body.innerHTML = `
      <div data-testid="focus-catcher-wrapper" id="wrapper">
        <div role="textbox" aria-label="Write a reply" id="editor"></div>
      </div>
    `;
    quiet();
    expect(document.getElementById('wrapper').classList.contains(COMPOSER_CLASS)).toBe(false);
  });

  it('releases a wrapper once its editor opens', () => {
    // The same wrapper holds the opener first and the editor a moment later,
    // so a class added on an earlier sweep has to come off again.
    const { wrapper } = mountCollapsedReplyComposer();
    const feature = quiet();
    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(true);

    document.getElementById('opener').remove();
    const editor = document.createElement('div');
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', 'Write a reply');
    wrapper.append(editor);
    feature.sweep();

    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(false);
  });

  it('releases the padded blocks with it', () => {
    const { wrapper, padded, outer } = mountCollapsedReplyComposer();
    const feature = quiet();
    expect(padded.classList.contains(COMPOSER_CLASS)).toBe(true);

    document.getElementById('opener').remove();
    const editor = document.createElement('textarea');
    editor.setAttribute('aria-label', 'Write a reply');
    wrapper.append(editor);
    feature.sweep();

    expect(padded.classList.contains(COMPOSER_CLASS)).toBe(false);
    expect(outer.classList.contains(COMPOSER_CLASS)).toBe(false);
  });

  it('finds the thread-level comment composer', () => {
    document.body.innerHTML = `
      <div data-testid="focus-catcher-wrapper" id="wrapper">
        <button type="button"><div>Write a comment</div></button>
      </div>
    `;
    quiet();
    expect(document.getElementById('wrapper').classList.contains(COMPOSER_CLASS)).toBe(true);
  });

  it('finds a translated composer', () => {
    document.body.innerHTML = `
      <div data-testid="focus-catcher-wrapper" id="wrapper">
        <button type="button"><div>Antwort schreiben</div></button>
      </div>
    `;
    quiet();
    expect(document.getElementById('wrapper').classList.contains(COMPOSER_CLASS)).toBe(true);
  });

  it('ignores prose that merely contains the words', () => {
    document.body.innerHTML = `
      <div data-testid="focus-catcher-wrapper" id="wrapper">
        <button type="button"><div>Please write a reply when you can</div></button>
      </div>
    `;
    quiet();
    expect(document.getElementById('wrapper').classList.contains(COMPOSER_CLASS)).toBe(false);
  });

  it('does nothing while the setting is off', () => {
    settings.update({ 'quiet.composer': false });
    const { wrapper } = mountCollapsedReplyComposer();
    quiet();
    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(false);
    expect(document.documentElement.classList.contains(MODE_CLASSES.composer)).toBe(false);
  });
});

describe('hiding the bars outright', () => {
  it('hides them, then hands them back to the chosen mode', () => {
    settings.update({ 'quiet.actions': 'cluster' });
    const feature = quiet();
    const root = document.documentElement;
    expect(root.classList.contains(MODE_CLASSES.hidden)).toBe(false);

    expect(feature.toggleActions()).toBe('hidden');
    expect(root.classList.contains(MODE_CLASSES.hidden)).toBe(true);

    expect(feature.toggleActions()).toBe('shown');
    expect(root.classList.contains(MODE_CLASSES.hidden)).toBe(false);
  });

  it.each(['dim', 'collapse', 'cluster', 'cluster-focus', 'edge'])(
    'leaves the %s mode in place underneath',
    (mode) => {
      // Hiding is a layer over the mode, not a replacement for it, so showing
      // again returns to exactly what was configured.
      settings.update({ 'quiet.actions': mode });
      const feature = quiet();
      feature.toggleActions();

      const root = document.documentElement;
      expect(root.classList.contains(ACTION_MODE_CLASSES[mode]), mode).toBe(true);
      expect(root.classList.contains(MODE_CLASSES.hidden), mode).toBe(true);
    },
  );

  it('works even when the bars are set to always visible', () => {
    // That is exactly when hiding them is worth having: otherwise they never
    // go away at all.
    settings.update({ 'quiet.actions': 'off' });
    const feature = quiet();
    expect(feature.toggleActions()).toBe('hidden');
    expect(document.documentElement.classList.contains(MODE_CLASSES.hidden)).toBe(true);
  });

  it('gives way to an explicit choice of mode', () => {
    settings.update({ 'quiet.actions': 'collapse' });
    const feature = quiet();
    feature.toggleActions();
    expect(document.documentElement.classList.contains(MODE_CLASSES.hidden)).toBe(true);

    settings.update({ 'quiet.actions': 'cluster' });
    feature.onSettingsChanged({ 'quiet.actions': 'cluster' });

    // Choosing a mode is deliberate, so it outranks the live override.
    expect(document.documentElement.classList.contains(MODE_CLASSES.cluster)).toBe(true);
    expect(document.documentElement.classList.contains(MODE_CLASSES.hidden)).toBe(false);
  });

  it('forgets the override on stop', () => {
    settings.update({ 'quiet.actions': 'cluster' });
    const feature = quiet();
    feature.toggleActions();
    feature.stop();
    feature.start();
    expect(document.documentElement.classList.contains(MODE_CLASSES.hidden)).toBe(false);
  });
});

describe('the reveal path', () => {
  beforeEach(() => {
    settings.update({ 'quiet.composer': true });
  });

  it('tags the post around a composer, so hover has something to key on', () => {
    // A hidden composer has no box left to hover; the CSS reveals it from the
    // surrounding post instead, which has to be tagged for that to work.
    document.body.innerHTML = `
      <div role="article" id="post">
        <div data-testid="focus-catcher-wrapper" id="wrapper">
          <button type="button"><div>Write a reply</div></button>
        </div>
      </div>
    `;
    quiet();
    expect(document.getElementById('post').classList.contains(POST_CLASS)).toBe(true);
  });

  it('puts the mode class on the document element', () => {
    quiet();
    expect(document.documentElement.classList.contains(MODE_CLASSES.composer)).toBe(true);
  });

  it.each([
    ['dim', MODE_CLASSES.dim],
    ['collapse', MODE_CLASSES.collapse],
    ['cluster', MODE_CLASSES.cluster],
    ['cluster-focus', MODE_CLASSES.clusterFocus],
    ['edge', MODE_CLASSES.edge],
  ])('applies the %s mode class, and only that one', (value, className) => {
    // Every mode is checked, because adding one and forgetting to toggle it
    // fails silently -- which is exactly what happened the first time.
    settings.update({ 'quiet.actions': value });
    quiet();

    const root = document.documentElement;
    expect(root.classList.contains(className)).toBe(true);
    for (const other of Object.values(ACTION_MODE_CLASSES)) {
      if (other === className) continue;
      expect(root.classList.contains(other), other).toBe(false);
    }
  });

  it('applies no action-mode class when the bar is left alone', () => {
    settings.update({ 'quiet.actions': 'off' });
    quiet();
    for (const className of Object.values(ACTION_MODE_CLASSES)) {
      expect(document.documentElement.classList.contains(className), className).toBe(false);
    }
  });

  it('restores everything it touched on stop', () => {
    const { wrapper, outer } = mountCollapsedReplyComposer();
    const feature = quiet();
    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(true);

    feature.stop();
    expect(wrapper.classList.contains(COMPOSER_CLASS)).toBe(false);
    expect(outer.classList.contains(COMPOSER_CLASS)).toBe(false);
    expect(document.documentElement.classList.contains(MODE_CLASSES.composer)).toBe(false);
  });
});
