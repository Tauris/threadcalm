import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allPosts,
  closestPost,
  isBodyLinkButton,
  isTranslationLinkButton,
  nestedPosts,
  postContainerFor,
  rootPosts,
} from '../src/core/dom.js';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import { OPEN_DWELL_MS, createExpander } from '../src/features/expand.js';
import { extractPost, extractThread, threadMembers } from '../src/features/thread.js';
import { COMPACT_CLASS, TRANSLATE_DWELL_MS, createTranslateTamer } from '../src/features/translate.js';
import { stubLayout } from './fixtures.js';

/**
 * Engage's post, as the round-2 survey found it in English, Japanese and
 * Portuguese alike: the body text in a `contentStateBodyTextWrapper-*` block
 * with "see more" inside it, then a row holding only the translation control,
 * then the action row. Both controls are `button > span.y-fakeLink`; since
 * November 2026 the translation control is a `button.fui-Link` with a bare
 * text label instead, which the last block below covers for both controls,
 * should "see more" follow.
 *
 * The labels are deliberately in no language Threadcalm has a word list for
 * (the matchers below know English only), so every test here passes on
 * structure alone.
 */
const FRENCH_BODY =
  'Nous avons decide que la publication sera reportee a la fin du mois pour que tous les problemes qui restent puissent etre corriges.';

function inlineLink(label, shape = 'fakeLink') {
  const button = document.createElement('button');
  button.type = 'button';
  if (shape === 'fluent') {
    // As seen in November 2026: the component's class among hashed ones, the
    // label a bare text node.
    button.className = 'fui-Link ___52mpgl0 f2hkw1w f3rmtva f1ewtqcl';
    button.textContent = label;
    return button;
  }
  button.className = 'link-170';
  const span = document.createElement('span');
  span.className = 'y-fakeLink';
  span.textContent = label;
  button.append(span);
  return button;
}

function engagePost({
  body = FRENCH_BODY,
  seeMore = 'zzz mehrzz',
  translate = 'qqq trnslt',
  className = 'qaThreadStarter',
  shape = 'fakeLink',
} = {}) {
  const post = document.createElement('div');
  post.className = className;

  const bodyWrapper = document.createElement('div');
  bodyWrapper.className = 'y-block contentStateBodyTextWrapper-231';
  const text = document.createElement('div');
  text.textContent = body;
  bodyWrapper.append(text);
  const more = seeMore ? inlineLink(seeMore, shape) : null;
  if (more) bodyWrapper.append(more);
  post.append(bodyWrapper);

  const translateRow = document.createElement('div');
  translateRow.className = 'y-block';
  const translation = translate ? inlineLink(translate, shape) : null;
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

describe('overview', () => {
  let expander;

  beforeEach(() => {
    vi.useFakeTimers();
    settings.update({ 'expand.overview': true });
  });

  afterEach(() => {
    expander?.stop();
    vi.useRealTimers();
  });

  /** A feed post with a reply counter and a long body. */
  function feedPost() {
    const { post, more } = engagePost();
    const counter = document.createElement('button');
    counter.textContent = '3 replies';
    post.append(counter);
    const replies = vi.fn();
    const seeMore = vi.fn();
    counter.addEventListener('click', replies);
    more.addEventListener('click', seeMore);
    return { post, replies, seeMore };
  }

  function start() {
    expander = createExpander({ matchers, IntersectionObserverImpl: undefined });
    expander.start();
    vi.advanceTimersByTime(settings.get('expand.scanDelayMs') * 4);
  }

  it('keeps a feed as Engage shows it', () => {
    const { replies, seeMore } = feedPost();
    start();
    expect(replies).not.toHaveBeenCalled();
    expect(seeMore).not.toHaveBeenCalled();
  });

  it('still opens a single conversation', () => {
    window.history.replaceState({}, '', '/main/threads/abc');
    const { replies } = feedPost();
    start();
    expect(replies).toHaveBeenCalledTimes(1);
  });

  it('still opens the post you ask for, and everything when asked', () => {
    const { post, replies, seeMore } = feedPost();
    start();
    expander.expandWithin(post);
    expect(replies).toHaveBeenCalledTimes(1);
    expect(seeMore).toHaveBeenCalledTimes(1);

    document.body.innerHTML = '';
    const other = feedPost();
    expander.rescan();
    expect(other.replies).toHaveBeenCalledTimes(1);
  });

  it('lets the feed open again when switched off', () => {
    const { replies } = feedPost();
    start();
    settings.update({ 'expand.overview': false });
    expander.onSettingsChanged({ 'expand.overview': false });
    vi.advanceTimersByTime(settings.get('expand.scanDelayMs') * 4);
    expect(replies).toHaveBeenCalledTimes(1);
  });
});

describe('the Fluent link button of November 2026', () => {
  let tamer;

  afterEach(() => {
    tamer?.stop();
    vi.useRealTimers();
  });

  it('is told apart by position like the old one', () => {
    const { more, translation } = engagePost({ shape: 'fluent' });
    expect(more.querySelector('span')).toBe(null);
    expect(isBodyLinkButton(more)).toBe(true);
    expect(isTranslationLinkButton(more)).toBe(false);
    expect(isTranslationLinkButton(translation)).toBe(true);
    expect(isBodyLinkButton(translation)).toBe(false);
  });

  it('still needs the component class: a plain button in the same place is nothing', () => {
    const { translation } = engagePost({ shape: 'fluent' });
    translation.className = '___52mpgl0 f2hkw1w';
    expect(isTranslationLinkButton(translation)).toBe(false);
  });

  it('is not a counter: a label that starts with a digit is left alone', () => {
    const { translation } = engagePost({ shape: 'fluent', translate: '3 rplzz' });
    expect(isTranslationLinkButton(translation)).toBe(false);
  });

  it('still ignores one that opens something', () => {
    const { translation } = engagePost({ shape: 'fluent' });
    translation.setAttribute('aria-haspopup', 'menu');
    expect(isTranslationLinkButton(translation)).toBe(false);
  });

  it('opens "see more" in a language without a word list', () => {
    const { post, more } = engagePost({ shape: 'fluent' });
    const clicks = vi.fn(() => {
      more.textContent = 'zzz wenigerzz';
    });
    more.addEventListener('click', clicks);
    const expander = createExpander({ matchers });
    expect(expander.expandWithin(post)).toBe(1);
    expect(expander.expandWithin(post)).toBe(0);
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('compacts the translation control in a language without a word list', () => {
    const { translation } = engagePost({ shape: 'fluent' });
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(translation.classList.contains(COMPACT_CLASS)).toBe(true);
    expect(translation.getAttribute('data-tc-title')).toBe('qqq trnslt');
  });

  it('reads the translated state from the brackets of a bare text label', () => {
    const { post, translation } = engagePost({ shape: 'fluent' });
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(tamer.translationOf(post)).toBe(null);
    translation.textContent = 'qqq orgnl (Fransk)';
    expect(tamer.translationOf(post)).toMatchObject({ from: 'Fransk' });
  });

  it('compacts a control that is only an icon, by its position', () => {
    const { translation } = engagePost({ shape: 'fluent' });
    translation.textContent = '';
    translation.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(translation.classList.contains(COMPACT_CLASS)).toBe(true);
  });

  it('leaves an icon-only button alone anywhere else', () => {
    const { post, translation } = engagePost({ shape: 'fluent' });
    const icon = document.createElement('button');
    icon.className = 'fui-Link';
    icon.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    post.append(icon); // after the action row
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(icon.classList.contains(COMPACT_CLASS)).toBe(false);
    expect(translation.classList.contains(COMPACT_CLASS)).toBe(true);
  });
});

/**
 * The comment layout of late 2026: replies are `.qaThreadReply` speech bubbles
 * beside the starter inside one `.qaFeedThread`, each with its own body
 * wrapper, translation row and action row, the controls ten levels deep.
 */
const REPLY_BODY = 'Oui, et la migration des donnees est comprise dans ce delai, comme convenu la semaine derniere.';

function column() {
  const node = document.createElement('div');
  node.className = 'y-fixedGridColumn ___c1';
  return node;
}

function bubbleThread({ columns = false } = {}) {
  const feed = document.createElement('div');
  feed.className = 'qaFeedThread';
  const { post: starter } = engagePost({ shape: 'fluent' });
  if (columns) {
    // The speech-bubble layout wraps the starter's body in a grid column, and
    // the reply's action row in another: columns, not posts.
    const wrap = column();
    const bodyWrapper = starter.querySelector('[class*="contentStateBodyTextWrapper"]');
    bodyWrapper.replaceWith(wrap);
    wrap.append(bodyWrapper);
  }
  feed.append(starter);

  const reply = document.createElement('div');
  reply.className = 'qaThreadReply ___r1';
  let node = reply;
  for (let i = 0; i < 6; i += 1) {
    const inner = document.createElement('div');
    inner.className = i % 2 ? 'y-block' : '';
    node.append(inner);
    node = inner;
  }
  const body = document.createElement('div');
  body.className = 'y-block contentStateBodyTextWrapper-77';
  body.append(Object.assign(document.createElement('div'), { textContent: REPLY_BODY }));
  const translateRow = document.createElement('div');
  translateRow.className = 'y-block';
  const control = inlineLink('qqq trnslt', 'fluent');
  translateRow.append(control);
  const actions = document.createElement('div');
  actions.setAttribute('data-testid', 'overflow-set');
  actions.append(document.createElement('button'));
  if (columns) {
    const wrap = column();
    wrap.append(actions);
    node.append(body, translateRow, wrap);
  } else {
    node.append(body, translateRow, actions);
  }
  feed.append(reply);

  document.querySelector('[role="main"]').append(feed);
  return { starter, reply, control };
}

describe('replies drawn as speech bubbles', () => {
  let tamer;

  afterEach(() => {
    tamer?.stop();
    vi.useRealTimers();
  });

  it('resolve as posts of their own, beside the starter', () => {
    const { starter, reply, control } = bubbleThread();
    expect(closestPost(control)).toBe(reply);
    expect(allPosts()).toEqual([starter, reply]);
    expect(rootPosts()).toEqual([starter, reply]);
  });

  it('are not posts without an action row inside', () => {
    const { reply, control } = bubbleThread();
    reply.querySelector('[data-testid="overflow-set"]').remove();
    expect(closestPost(control)).toBe(null);
  });

  it('have their translation control recognised by position', () => {
    const { control } = bubbleThread();
    expect(isTranslationLinkButton(control)).toBe(true);
    tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
    tamer.start();
    expect(control.classList.contains(COMPACT_CLASS)).toBe(true);
  });

  it('belong to the starter\'s thread when copied', () => {
    const { starter, reply } = bubbleThread();
    expect(threadMembers(starter)).toEqual([starter, reply]);
    expect(threadMembers(reply)).toEqual([starter, reply]);
  });
});

describe('grid columns inside posts, as the speech-bubble layout draws them', () => {
  it('are not nested posts: nothing inside a starter with one action row is', () => {
    const { starter, reply } = bubbleThread({ columns: true });
    expect(starter.querySelectorAll('.y-fixedGridColumn')).toHaveLength(1);
    expect(nestedPosts(starter)).toEqual([]);
    expect(nestedPosts(reply)).toEqual([]);
  });

  it('do not stand in for the reply whose action row they wrap', () => {
    const { starter, reply } = bubbleThread({ columns: true });
    const row = reply.querySelector('[data-testid="overflow-set"]');
    expect(postContainerFor(row)).toBe(reply);
    expect(allPosts()).toEqual([starter, reply]);
  });

  it('leave the bodies in a copied thread', () => {
    const { starter } = bubbleThread({ columns: true });
    const thread = extractThread(threadMembers(starter));
    expect(thread.body).toContain('reportee a la fin du mois');
    expect(thread.replies).toHaveLength(1);
    expect(thread.replies[0].body).toContain('migration des donnees');
    expect(thread.body).not.toContain('migration des donnees');
  });

  it('still count a nested reply as a post in the layout that nests them', () => {
    // The older layout: a reply column inside the starter, each with its own row.
    const { post: starter } = engagePost({ translate: null });
    const replyColumn = column();
    replyColumn.append(Object.assign(document.createElement('p'), { textContent: REPLY_BODY }));
    const row = document.createElement('div');
    row.setAttribute('data-testid', 'overflow-set');
    replyColumn.append(row);
    starter.append(replyColumn);
    const own = starter.querySelector(':scope > [data-testid="overflow-set"]');

    expect(nestedPosts(starter)).toEqual([replyColumn]);
    expect(postContainerFor(row)).toBe(replyColumn);
    expect(postContainerFor(own)).toBe(starter);
    const post = extractPost(starter);
    expect(post.body).toContain('reportee a la fin du mois');
    expect(post.body).not.toContain('migration des donnees');
    expect(post.replies).toHaveLength(1);
    expect(post.replies[0].body).toContain('migration des donnees');
  });
});
