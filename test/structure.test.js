import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allPosts, closestPost, isBodyLinkButton, isTranslationLinkButton } from '../src/core/dom.js';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import { OPEN_DWELL_MS, createExpander } from '../src/features/expand.js';
import { threadMembers } from '../src/features/thread.js';
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

describe('a thread starter without its own action row', () => {
  /** The layout from the 1.1.1.18 handoff: the starter holds no action row. */
  function rowlessThread() {
    const { post: starter, translation } = engagePost();
    starter.querySelector('[data-testid="overflow-set"]').remove();
    const main = starter.parentElement;

    const reply = document.createElement('div');
    reply.className = 'y-fixedGridColumn';
    reply.textContent = 'Merci, bien reçu, nous allons regarder cela ensemble demain matin.';
    const actions = document.createElement('div');
    actions.setAttribute('data-testid', 'overflow-set');
    reply.append(actions);
    main.append(reply);
    return { starter, translation, reply };
  }

  it('is still a post', () => {
    const { starter, translation } = rowlessThread();
    expect(closestPost(translation)).toBe(starter);
    expect(allPosts()).toContain(starter);
  });

  it('comes first, in document order', () => {
    const { starter, reply } = rowlessThread();
    expect(allPosts()).toEqual([starter, reply]);
  });

  it('keeps its translation control recognisable', () => {
    const { translation } = rowlessThread();
    expect(isTranslationLinkButton(translation)).toBe(true);
  });

  it('is copied with its replies', () => {
    const { starter, reply } = rowlessThread();
    expect(threadMembers(reply)).toEqual([starter, reply]);
  });

  it('is not listed twice when a found post already wraps it', () => {
    const { starter } = rowlessThread();
    const wrapper = document.createElement('div');
    wrapper.className = 'y-fixedGridColumn';
    starter.replaceWith(wrapper);
    const row = document.createElement('div');
    row.setAttribute('data-testid', 'overflow-set');
    wrapper.append(starter, row);
    expect(allPosts().filter((post) => post === starter)).toHaveLength(0);
  });
});

describe('opening long posts as they come on screen', () => {
  let expander;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    expander?.stop();
    vi.useRealTimers();
  });

  /** An expander with a hand-driven IntersectionObserver, after its first scan. */
  function start() {
    let notify;
    const viewer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    const IntersectionObserverImpl = vi.fn((callback) => {
      notify = callback;
      return viewer;
    });
    expander = createExpander({ matchers, IntersectionObserverImpl });
    expander.start();
    vi.advanceTimersByTime(settings.get('expand.scanDelayMs'));
    const scroll = (target, onScreen) =>
      notify([{ target, isIntersecting: onScreen, intersectionRatio: onScreen ? 0.5 : 0 }]);
    return { viewer, scroll };
  }

  function longPost() {
    const { more } = engagePost();
    const click = vi.fn();
    more.addEventListener('click', click);
    return { more, body: more.closest('[class*="contentStateBodyTextWrapper"]'), click };
  }

  it('waits for the post, rather than opening it on sight', () => {
    const { body, click } = longPost();
    const { viewer } = start();
    expect(viewer.observe).toHaveBeenCalledWith(body);
    expect(click).not.toHaveBeenCalled();
  });

  it('opens it once it has been on screen for a moment', () => {
    const { body, click } = longPost();
    const { scroll } = start();

    scroll(body, true);
    vi.advanceTimersByTime(OPEN_DWELL_MS - 1);
    expect(click).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('leaves a post alone that was only scrolled past', () => {
    const { body, click } = longPost();
    const { scroll } = start();

    scroll(body, true);
    vi.advanceTimersByTime(OPEN_DWELL_MS / 2);
    scroll(body, false);
    vi.advanceTimersByTime(OPEN_DWELL_MS * 10);

    expect(click).not.toHaveBeenCalled();
  });

  it('opens nothing while expansion is paused', () => {
    const { body, click } = longPost();
    const { scroll } = start();

    scroll(body, true);
    expander.pause();
    vi.advanceTimersByTime(OPEN_DWELL_MS * 10);
    expect(click).not.toHaveBeenCalled();

    expander.resume();
    vi.advanceTimersByTime(OPEN_DWELL_MS);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('still opens everything at once when asked: o, copying, expand everything', () => {
    const { more, click } = longPost();
    start();
    expect(expander.expandWithin(more.closest('.qaThreadStarter'))).toBe(1);
    expect(click).toHaveBeenCalledTimes(1);

    document.body.innerHTML = '';
    const other = longPost();
    expander.rescan();
    expect(other.click).toHaveBeenCalledTimes(1);
  });

  it('still clicks reply counters without waiting', () => {
    const { post } = engagePost({ seeMore: null });
    const counter = document.createElement('button');
    counter.textContent = '3 replies';
    post.append(counter);
    const click = vi.fn();
    counter.addEventListener('click', click);

    start();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('releases posts Engage removed before they were seen', () => {
    const { body } = longPost();
    const { viewer } = start();

    body.closest('[role="main"]').remove();
    expander.onDomChanged();
    vi.advanceTimersByTime(settings.get('expand.scanDelayMs'));

    expect(viewer.unobserve).toHaveBeenCalledWith(body);
  });
});
