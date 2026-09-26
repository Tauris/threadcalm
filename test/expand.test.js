import { beforeEach, describe, expect, it } from 'vitest';
import { buildMatchers } from '../src/core/i18n.js';
import { closestPost } from '../src/core/dom.js';
import * as settings from '../src/core/settings.js';
import { createExpander } from '../src/features/expand.js';
import { control, counterControl, createPost, mountFeed, stubLayout } from './fixtures.js';

const matchers = buildMatchers(['en', 'de']);

function newExpander() {
  return createExpander({ matchers });
}

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/main/feed');
});

describe('language-independent reply detection', () => {
  it('finds a reply counter in a locale with no label pack', () => {
    const { _internals } = newExpander();
    // None of these words appear in the en/de packs the expander was built with.
    expect(_internals.classify(counterControl('3 件の返信'))).toBe('reply-count');
    expect(_internals.classify(counterControl('5 条回复'))).toBe('reply-count');
    expect(_internals.classify(counterControl('2 respostas'))).toBe('reply-count');
  });

  it('ignores a numeric counter carrying a different glyph', () => {
    const { _internals } = newExpander();
    // Share and reaction counters are numeric too; the icon is what separates them.
    expect(_internals.classify(counterControl('4 compartilhamentos', { iconPath: 'M2 2h4' }))).toBe(
      null,
    );
  });

  it('ignores a button whose label does not start with a digit', () => {
    const { _internals } = newExpander();
    expect(_internals.classify(counterControl('Responder'))).toBe(null);
  });

  it('still rejects a menu that carries the glyph', () => {
    const { _internals } = newExpander();
    const menu = counterControl('3 件の返信');
    menu.setAttribute('aria-haspopup', 'true');
    expect(_internals.classify(menu)).toBe(null);
  });

  it('falls back to the label packs when the signature is cleared', () => {
    settings.update({ 'advanced.replyIconSignatures': [] });
    const { _internals } = newExpander();
    expect(_internals.classify(counterControl('3 replies'))).toBe('reply-count');
    expect(_internals.classify(counterControl('3 件の返信'))).toBe(null);
  });
});

describe('control classification', () => {
  it('accepts a bare reply counter', () => {
    const { _internals } = newExpander();
    expect(_internals.classify(control('3 replies'))).toBe('reply-count');
    expect(_internals.classify(control('1 Antwort'))).toBe('reply-count');
  });

  it('accepts explicit reply pagination', () => {
    const { _internals } = newExpander();
    expect(_internals.classify(control('Show more replies'))).toBe('pagination');
  });

  it('rejects the post overflow menu', () => {
    const { _internals } = newExpander();
    const menu = control('More options', { attributes: { 'aria-haspopup': 'menu' } });
    expect(_internals.classify(menu)).toBe(null);
  });

  it('rejects anything whose label names a menu', () => {
    const { _internals } = newExpander();
    expect(_internals.classify(control('Post actions'))).toBe(null);
    expect(_internals.classify(control('Settings'))).toBe(null);
  });

  it('rejects a disabled control', () => {
    const { _internals } = newExpander();
    const disabled = control('Show more replies', { attributes: { 'aria-disabled': 'true' } });
    expect(_internals.classify(disabled)).toBe(null);
  });

  it('rejects an invisible control', () => {
    const { _internals } = newExpander();
    const hidden = control('3 replies', { attributes: { 'data-zero-size': 'true' } });
    expect(_internals.classify(hidden)).toBe(null);
  });

  it('rejects prose that happens to mention replies', () => {
    const { _internals } = newExpander();
    expect(
      _internals.classify(control('Please read all 3 replies before commenting again')),
    ).toBe(null);
  });

  it('only accepts a bare "See more" inside a post', () => {
    const { _internals } = newExpander();
    expect(_internals.classify(control('See more'))).toBe(null);

    const post = createPost({ author: 'Ada', body: 'Long text' });
    const seeMore = document.createElement('button');
    seeMore.textContent = 'See more';
    post.append(seeMore);
    document.body.append(post);

    expect(_internals.classify(seeMore)).toBe('truncation');
  });

  it('recognizes truncated text in a thread starter without a local action row', () => {
    const { _internals } = newExpander();
    const starter = document.createElement('div');
    starter.className = 'y-block qaThreadStarter';
    const body = document.createElement('div');
    body.className = 'y-block contentStateBodyTextWrapper-287';
    const button = document.createElement('button');
    const label = document.createElement('span');
    label.className = 'y-fakeLink';
    label.textContent = 'see more';
    button.append(label);
    let clicks = 0;
    button.addEventListener('click', () => { clicks += 1; });
    body.append(button);
    starter.append(body);
    document.body.append(starter);

    expect(closestPost(button)).toBe(null);
    expect(_internals.classify(button)).toBe('truncation');
    expect(newExpander().expandWithin(starter)).toBe(1);
    expect(clicks).toBe(1);
  });

  it('skips truncation controls when the setting is off', () => {
    settings.update({ 'expand.truncatedText': false });
    const { _internals } = newExpander();

    const post = createPost({ author: 'Ada', body: 'Long text' });
    const seeMore = document.createElement('button');
    seeMore.textContent = 'See more';
    post.append(seeMore);
    document.body.append(post);

    expect(_internals.classify(seeMore)).toBe(null);
  });
});

describe('click targeting', () => {
  it('clicks the button rather than the label span inside it', () => {
    mountFeed([{ author: 'Ada', body: 'Hello', replyCount: 3 }]);
    const expander = newExpander();

    const button = document.querySelector('.reply-opener');
    let clicked = null;
    button.addEventListener('click', (event) => {
      clicked = event.currentTarget;
    });

    expander.expandWithin(document);
    expect(clicked).toBe(button);
  });

  it('reports one control per real target, not one per matching node', () => {
    mountFeed([{ author: 'Ada', body: 'Hello', replyCount: 3 }]);
    const { _internals } = newExpander();
    const found = _internals.findControls(document);
    expect(found).toHaveLength(1);
  });

  it('expands a later body when it shares a fallback post container', () => {
    const container = document.createElement('div');
    container.className = 'y-fixedGridColumn';
    const actions = document.createElement('div');
    actions.setAttribute('data-testid', 'overflow-set');
    container.append(actions);

    const makeBody = (suffix, onClick) => {
      const starter = document.createElement('div');
      starter.className = 'thread-item';
      const body = document.createElement('div');
      body.className = `contentStateBodyTextWrapper-${suffix}`;
      const button = document.createElement('button');
      const label = document.createElement('span');
      label.className = 'y-fakeLink';
      label.textContent = 'see more';
      button.append(label);
      button.addEventListener('click', onClick);
      body.append(button);
      starter.append(body);
      container.append(starter);
      return body;
    };

    let firstClicks = 0;
    let laterClicks = 0;
    const firstBody = makeBody('first', () => { firstClicks += 1; });
    document.body.append(container);
    const expander = newExpander();

    const firstButton = firstBody.querySelector('button');
    expect(closestPost(firstButton)).toBe(container);
    expect(expander.expandWithin(firstBody)).toBe(1);
    expect(expander._internals.classify(firstButton)).toBe(null);

    const replacement = document.createElement('button');
    const replacementLabel = document.createElement('span');
    replacementLabel.className = 'y-fakeLink';
    replacementLabel.textContent = 'see less';
    replacement.append(replacementLabel);
    firstBody.append(replacement);
    expect(expander._internals.findControls(firstBody)).toHaveLength(0);

    const labelFallback = document.createElement('button');
    labelFallback.textContent = 'See more';
    firstBody.append(labelFallback);
    expect(expander._internals.classify(labelFallback)).toBe(null);

    const laterBody = makeBody('later', () => { laterClicks += 1; });
    const laterButton = laterBody.querySelector('button');
    expect(closestPost(laterButton)).toBe(container);
    expect(expander._internals.findControls(laterBody)).toHaveLength(1);
    expect(expander.expandWithin(laterBody)).toBe(1);
    expect(firstClicks).toBe(1);
    expect(laterClicks).toBe(1);
  });
});

describe('deduplication and limits', () => {
  it('never clicks the same control twice', () => {
    mountFeed([{ author: 'Ada', body: 'Hello', replyCount: 3 }]);
    const expander = newExpander();

    let clicks = 0;
    document.querySelector('.reply-opener').addEventListener('click', () => {
      clicks += 1;
    });

    expander.expandWithin(document);
    expander.expandWithin(document);
    expander.expandWithin(document);

    expect(clicks).toBe(1);
  });

  it('honours the per-pass click budget', () => {
    mountFeed(
      Array.from({ length: 10 }, (_, index) => ({
        author: `User ${index}`,
        body: 'Body',
        replyCount: 2,
      })),
    );
    settings.update({ 'expand.maxClicksPerScan': 4 });
    const expander = newExpander();

    expect(expander.expandWithin(document)).toBe(4);
    expect(expander.expandWithin(document)).toBe(4);
    expect(expander.expandWithin(document)).toBe(2);
  });

  it('stops at the per-page total and says so', () => {
    mountFeed(
      Array.from({ length: 6 }, (_, index) => ({
        author: `User ${index}`,
        body: 'Body',
        replyCount: 1,
      })),
    );
    settings.update({ 'expand.maxTotalClicks': 10, 'expand.maxClicksPerScan': 40 });
    const expander = newExpander();

    expander.expandWithin(document);
    expect(expander.stats.totalClicks).toBe(6);
    expect(expander.stats.limitReached).toBe(false);
  });

  it('forgets its click history on navigation', () => {
    mountFeed([{ author: 'Ada', body: 'Hello', replyCount: 3 }]);
    const expander = newExpander();

    expander.expandWithin(document);
    expect(expander.stats.totalClicks).toBe(1);

    expander.onNavigate();
    expect(expander.stats.totalClicks).toBe(0);
  });
});

describe('scope', () => {
  it('expands nothing while paused', () => {
    mountFeed([{ author: 'Ada', body: 'Hello', replyCount: 3 }]);
    const expander = newExpander();
    expander.pause();

    // expandWithin is the explicit user action, so it still works; the
    // automatic scan is what pausing stops.
    expect(expander.isPaused()).toBe(true);
  });
});
