import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBodyLinkButton, isTranslationLinkButton } from '../src/core/dom.js';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import { createExpander } from '../src/features/expand.js';
import { COMPACT_CLASS, TRANSLATE_DWELL_MS, createTranslateTamer } from '../src/features/translate.js';
import { stubLayout } from './fixtures.js';

/**
 * Engage's post, as the round-2 survey found it in English, Japanese and
 * Portuguese alike: the body text in a `contentStateBodyTextWrapper-*` block
 * with "see more" inside it, then a row holding only the translation control,
 * then the action row. Both controls are `button > span.y-fakeLink`.
 *
 * The labels are deliberately in no language Threadcalm has a word list for
 * (the matchers below know English only), so every test here passes on
 * structure alone.
 */
const FRENCH_BODY =
  'Nous avons decide que la publication sera reportee a la fin du mois pour que tous les problemes qui restent puissent etre corriges.';

function inlineLink(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-170';
  const span = document.createElement('span');
  span.className = 'y-fakeLink';
  span.textContent = label;
  button.append(span);
  return button;
}

function engagePost({ body = FRENCH_BODY, seeMore = 'zzz mehrzz', translate = 'qqq trnslt', className = 'qaThreadStarter' } = {}) {
  const post = document.createElement('div');
  post.className = className;

  const bodyWrapper = document.createElement('div');
  bodyWrapper.className = 'y-block contentStateBodyTextWrapper-231';
  const text = document.createElement('div');
  text.textContent = body;
  bodyWrapper.append(text);
  const more = seeMore ? inlineLink(seeMore) : null;
  if (more) bodyWrapper.append(more);
  post.append(bodyWrapper);

  const translateRow = document.createElement('div');
  translateRow.className = 'y-block';
  const translation = translate ? inlineLink(translate) : null;
  if (translation) translateRow.append(translation);
  post.append(translateRow);

  const actions = document.createElement('div');
  actions.setAttribute('data-testid', 'overflow-set');
  const like = document.createElement('button');
  like.setAttribute('aria-label', 'Like');
  actions.append(like);
  post.append(actions);

  const main = document.createElement('div');
  main.setAttribute('role', 'main');
  main.append(post);
  document.body.append(main);
  return { post, more, translation, actions };
}

const matchers = buildMatchers(['en']);

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/main/feed');
});

describe('recognising Engage’s inline links by position', () => {
  it('tells "see more" in the body from the translation control below it', () => {
    const { more, translation } = engagePost();
    expect(isBodyLinkButton(more)).toBe(true);
    expect(isTranslationLinkButton(more)).toBe(false);
    expect(isTranslationLinkButton(translation)).toBe(true);
    expect(isBodyLinkButton(translation)).toBe(false);
  });

  it('ignores a link-styled button that opens something', () => {
    // The collapsed "Write a comment" box is link-styled too, and carries aria-expanded.
    const { translation } = engagePost();
    translation.setAttribute('aria-expanded', 'false');
    expect(isTranslationLinkButton(translation)).toBe(false);
  });

  it('ignores a link-styled button after the action row', () => {
    const { post, translation } = engagePost();
    post.append(translation.parentElement);
    expect(isTranslationLinkButton(translation)).toBe(false);
  });

  it('ignores plain buttons and buttons outside posts', () => {
    const { translation } = engagePost();
    const plain = document.createElement('button');
    plain.textContent = 'qqq trnslt';
    translation.parentElement.append(plain);
    expect(isTranslationLinkButton(plain)).toBe(false);

    const loose = inlineLink('see more');
    document.body.append(loose);
    expect(isBodyLinkButton(loose)).toBe(false);
  });
});

describe('"see more" in any language', () => {
  it('is clicked once per post, though it then reads "see less"', () => {
    const { post, more } = engagePost();
    const expander = createExpander({ matchers });
    const click = vi.fn(() => {
      more.querySelector('.y-fakeLink').textContent = 'zzz wenigerzz';
    });
    more.addEventListener('click', click);

    expect(expander.expandWithin(post)).toBe(1);
    expect(expander.expandWithin(post)).toBe(0);

    // Engage re-renders the body; the new button is still "see less".
    const again = inlineLink('zzz wenigerzz');
    more.replaceWith(again);
    expect(expander.expandWithin(post)).toBe(0);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('is left alone when truncated text expansion is off', () => {
    settings.update({ 'expand.truncatedText': false });
    const { post } = engagePost();
    expect(createExpander({ matchers }).expandWithin(post)).toBe(0);
  });
});

describe('the translation control in any language', () => {
  let tamer;

  afterEach(() => {
    tamer?.stop();
    vi.useRealTimers();
  });

  it('is compacted like a known one', () => {
    const { translation } = engagePost();
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(translation.classList.contains(COMPACT_CLASS)).toBe(true);
  });

  it('reads its translated state and source language from the brackets', () => {
    const { post, translation } = engagePost();
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(tamer.translationOf(post)).toBe(null);

    translation.querySelector('.y-fakeLink').textContent = 'qqq orgnl (Fransk)';
    expect(tamer.translationOf(post)).toMatchObject({ from: 'Fransk' });
  });

  it('is pressed by automatic translation', () => {
    vi.useFakeTimers();
    settings.update({ 'translate.autoWhenVisible': true });
    const { post, translation } = engagePost();
    const click = vi.fn();
    translation.addEventListener('click', click);

    let notify;
    const IntersectionObserverImpl = vi.fn((callback) => {
      notify = callback;
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl });
    tamer.start();

    notify([{ target: post, isIntersecting: true, intersectionRatio: 1 }]);
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS);

    expect(click).toHaveBeenCalledTimes(1);
  });
});
