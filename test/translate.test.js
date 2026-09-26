import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, bus } from '../src/core/bus.js';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import {
  COMPACT_CLASS,
  TRANSLATE_DWELL_MS,
  TRANSLATE_SPACING_MS,
  HIDDEN_CLASS,
  ROW_CLASS,
  ROW_HIDDEN_CLASS,
  createTranslateTamer,
} from '../src/features/translate.js';
import { createPost, stubLayout } from './fixtures.js';

const matchers = buildMatchers(['en', 'de']);

const ENGLISH_BODY =
  'The team has decided that we will move the release to the end of the month so that all of the remaining issues can be fixed and tested.';
const FRENCH_BODY =
  'Nous avons decide que la publication sera reportee a la fin du mois pour que tous les problemes qui restent puissent etre corriges.';

function mount(body, label = 'Show translation') {
  const article = createPost({ author: 'Ada Lovelace', body, translateLabel: label });
  document.body.append(article);
  return article.querySelector('.translate-control');
}

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
});

describe('compact mode', () => {
  it('compacts the control without touching its DOM', () => {
    const button = mount(ENGLISH_BODY);
    const before = button.innerHTML;

    createTranslateTamer({ matchers }).sweep();

    expect(button.classList.contains(COMPACT_CLASS)).toBe(true);
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(button.innerHTML).toBe(before);
    expect(button.isConnected).toBe(true);
  });

  it('keeps the original label as a tooltip', () => {
    const button = mount(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();
    expect(button.getAttribute('title')).toBe('Show translation');
  });

  it('recognises German labels', () => {
    const button = mount(ENGLISH_BODY, 'Übersetzung anzeigen');
    createTranslateTamer({ matchers }).sweep();
    expect(button.classList.contains(COMPACT_CLASS)).toBe(true);
  });
});

describe('hide mode', () => {
  it('hides every translate control', () => {
    settings.update({ 'translate.mode': 'hide' });
    const button = mount(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(true);
  });

  it('keeps the language-qualified original control visible and uncompact', () => {
    settings.update({ 'translate.mode': 'hide' });
    const button = mount(ENGLISH_BODY, 'Show original (Japanese)');
    createTranslateTamer({ matchers }).sweep();

    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(button.classList.contains(COMPACT_CLASS)).toBe(false);
    expect(button.textContent).toBe('Show original (Japanese)');
  });
});

describe('automatic translation', () => {
  const JAPANESE_BODY = '日本語の投稿です。明日の会議について確認します。';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A tamer with a hand-driven IntersectionObserver. */
  function mountObserver() {
    let notify;
    const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    const IntersectionObserverImpl = vi.fn((callback) => {
      notify = callback;
      return observer;
    });
    const tamer = createTranslateTamer({ matchers, IntersectionObserverImpl });
    const scroll = (post, onScreen) =>
      notify([{ target: post, isIntersecting: onScreen, intersectionRatio: onScreen ? 0.5 : 0 }]);
    return { tamer, observer, scroll };
  }

  /** Mounts a post and counts clicks on its translate control. */
  function post(body, label) {
    const control = mount(body, label);
    const click = vi.fn();
    control.addEventListener('click', click);
    return { control, post: control.closest('[role="article"]'), click };
  }

  function enable(extra = {}) {
    settings.update({ 'translate.autoWhenVisible': true, ...extra });
  }

  it('does nothing while switched off', () => {
    post(JAPANESE_BODY);
    const { tamer, observer } = mountObserver();
    tamer.start();
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('watches the post, not the control at its bottom', () => {
    enable();
    const { post: article } = post(JAPANESE_BODY);
    const { tamer, observer } = mountObserver();
    tamer.start();
    expect(observer.observe).toHaveBeenCalledWith(article);
  });

  it('translates a post once it has stayed on screen', () => {
    enable({ 'translate.mode': 'hide' });
    const { control, post: article, click } = post(JAPANESE_BODY);
    const { tamer, scroll } = mountObserver();
    tamer.start();
    // A post about to be translated keeps its control, whatever the mode.
    expect(control.classList.contains(HIDDEN_CLASS)).toBe(false);

    scroll(article, true);
    expect(click).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TRANSLATE_DWELL_MS);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('leaves a post alone that was only scrolled past', () => {
    enable();
    const { post: article, click } = post(JAPANESE_BODY);
    const { tamer, scroll } = mountObserver();
    tamer.start();

    scroll(article, true);
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS / 2);
    scroll(article, false);
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS * 4);

    expect(click).not.toHaveBeenCalled();
  });

  it('never translates a post that did not reach the screen', () => {
    enable();
    const { click } = post(JAPANESE_BODY);
    const { tamer } = mountObserver();
    tamer.start();
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS * 10);
    expect(click).not.toHaveBeenCalled();
  });

  it('translates even when the control is left unchanged', () => {
    enable({ 'translate.mode': 'off' });
    const { control, post: article, click } = post(JAPANESE_BODY);
    const { tamer, scroll } = mountObserver();
    tamer.start();

    scroll(article, true);
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS);

    expect(click).toHaveBeenCalledTimes(1);
    expect(control.classList.contains(COMPACT_CLASS)).toBe(false);
  });

  it('spaces translations out, and skips posts scrolled away while waiting', () => {
    enable();
    const posts = [post(FRENCH_BODY), post(FRENCH_BODY), post(FRENCH_BODY)];
    const { tamer, scroll } = mountObserver();
    tamer.start();
    const clicks = () => posts.map(({ click }) => click.mock.calls.length);

    for (const { post: article } of posts) scroll(article, true);
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS);
    expect(clicks()).toEqual([1, 0, 0]);

    scroll(posts[1].post, false);
    vi.advanceTimersByTime(TRANSLATE_SPACING_MS);
    expect(clicks()).toEqual([1, 0, 1]);
  });

  it('translates a post only once, so "Show original" sticks', () => {
    enable();
    const { control, post: article } = post(FRENCH_BODY);
    const { tamer, observer, scroll } = mountObserver();
    tamer.start();
    scroll(article, true);
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS);

    // Engage renders a fresh control after the reader goes back to the original.
    control.replaceWith(control.cloneNode(true));
    observer.observe.mockClear();
    tamer.sweep();

    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('leaves text too short to judge alone', () => {
    enable();
    post('Merci !');
    const { tamer, observer } = mountObserver();
    tamer.start();
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('leaves posts confidently in a language the reader reads', () => {
    enable({ 'translate.knownLanguages': ['en'] });
    post(ENGLISH_BODY);
    const { tamer, observer } = mountObserver();
    tamer.start();
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('leaves Japanese alone for a reader of Japanese', () => {
    enable({ 'translate.knownLanguages': ['ja'] });
    post(JAPANESE_BODY);
    const { tamer, observer } = mountObserver();
    tamer.start();
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('leaves Han-only text alone for a reader of Japanese', () => {
    enable({ 'translate.knownLanguages': ['ja'] });
    post('東京会議資料確認事項改善方法品質問題解決計画。');
    const { tamer, observer } = mountObserver();
    tamer.start();
    expect(observer.observe).not.toHaveBeenCalled();
  });

  it('releases posts Engage has removed before they were seen', () => {
    enable();
    const { post: article } = post(FRENCH_BODY);
    const { tamer, observer } = mountObserver();
    tamer.start();

    article.remove();
    tamer.sweep();

    expect(observer.unobserve).toHaveBeenCalledWith(article);
  });

  it('stops at once when switched off, even for a post already waiting', () => {
    enable();
    const { post: article, click } = post(FRENCH_BODY);
    const { tamer, observer, scroll } = mountObserver();
    tamer.start();
    scroll(article, true);

    settings.update({ 'translate.autoWhenVisible': false });
    tamer.onSettingsChanged({ 'translate.autoWhenVisible': false });
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS * 4);

    expect(click).not.toHaveBeenCalled();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('switches off when expansion is paused, and stays off when it resumes', () => {
    enable();
    const { post: article, click } = post(FRENCH_BODY);
    const { tamer, scroll } = mountObserver();
    tamer.start();
    // The settings bus reaches the feature the way main.js wires it.
    const off = bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => tamer.onSettingsChanged(changed));
    try {
      scroll(article, true);
      bus.emit(EVENTS.EXPAND_STATE, { enabled: true, paused: true });
      vi.advanceTimersByTime(TRANSLATE_DWELL_MS * 4);

      expect(settings.get('translate.autoWhenVisible')).toBe(false);
      expect(click).not.toHaveBeenCalled();

      bus.emit(EVENTS.EXPAND_STATE, { enabled: true, paused: false });
      expect(settings.get('translate.autoWhenVisible')).toBe(false);
    } finally {
      off();
      tamer.stop();
    }
  });

  it('can be switched back on while expansion stays paused', () => {
    const { tamer } = mountObserver();
    tamer.start();
    try {
      bus.emit(EVENTS.EXPAND_STATE, { enabled: true, paused: true });
      enable();
      bus.emit(EVENTS.EXPAND_STATE, { enabled: true, paused: true });
      expect(settings.get('translate.autoWhenVisible')).toBe(true);
    } finally {
      tamer.stop();
    }
  });

  it('stops everything when stopped', () => {
    enable();
    const { post: article, click } = post(FRENCH_BODY);
    const { tamer, observer, scroll } = mountObserver();
    tamer.start();
    scroll(article, true);

    tamer.stop();
    vi.advanceTimersByTime(TRANSLATE_DWELL_MS * 4);

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
});

describe('known-language mode', () => {
  beforeEach(() => {
    settings.update({ 'translate.mode': 'known', 'translate.knownLanguages': ['en', 'de'] });
  });

  it('hides the control on a post in a language the reader reads', () => {
    const button = mount(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(true);
  });

  it('keeps the control on a post in another language', () => {
    const button = mount(FRENCH_BODY);
    createTranslateTamer({ matchers }).sweep();

    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(button.classList.contains(COMPACT_CLASS)).toBe(true);
  });

  it('keeps the control when the post is too short to judge', () => {
    const button = mount('Thanks!');
    createTranslateTamer({ matchers }).sweep();
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
  });

  it('respects the confidence floor', () => {
    settings.update({ 'translate.minConfidence': 0.99 });
    const button = mount(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
  });
});

describe('off mode and teardown', () => {
  it('leaves controls untouched when off', () => {
    settings.update({ 'translate.mode': 'off' });
    const button = mount(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();

    expect(button.classList.contains(COMPACT_CLASS)).toBe(false);
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
  });

  it('restores every control on stop', () => {
    const button = mount(ENGLISH_BODY);
    const tamer = createTranslateTamer({ matchers });
    tamer.sweep();
    tamer.stop();

    expect(button.classList.contains(COMPACT_CLASS)).toBe(false);
    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
  });

  it('ignores controls that are not about translation', () => {
    const article = createPost({ author: 'Ada', body: ENGLISH_BODY, translateLabel: 'Reply' });
    document.body.append(article);
    const button = article.querySelector('.translate-control');

    createTranslateTamer({ matchers }).sweep();
    expect(button.classList.contains(COMPACT_CLASS)).toBe(false);
  });
});

describe('row collapsing', () => {
  /** Wraps the control so it is the only element child of its parent. */
  function mountWrapped(body, label = 'Show translation') {
    const article = createPost({ author: 'Ada Lovelace', body });
    const row = document.createElement('div');
    const button = document.createElement('button');
    button.textContent = label;
    button.className = 'translate-control';
    row.append(button);
    article.append(row);
    document.body.append(article);
    return { row, button };
  }

  it('collapses a wrapper that holds nothing else', () => {
    const { row } = mountWrapped(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();
    expect(row.classList.contains(ROW_CLASS)).toBe(true);
  });

  it('hides the wrapper when the control itself is hidden', () => {
    settings.update({ 'translate.mode': 'hide' });
    const { row } = mountWrapped(ENGLISH_BODY);
    createTranslateTamer({ matchers }).sweep();

    expect(row.classList.contains(ROW_HIDDEN_CLASS)).toBe(true);
    expect(row.classList.contains(ROW_CLASS)).toBe(false);
  });

  it('leaves a wrapper shared with other controls alone', () => {
    const { row } = mountWrapped(ENGLISH_BODY);
    const sibling = document.createElement('button');
    sibling.textContent = 'Like';
    row.append(sibling);

    createTranslateTamer({ matchers }).sweep();
    expect(row.classList.contains(ROW_CLASS)).toBe(false);
  });

  it('restores the wrapper on stop', () => {
    const { row } = mountWrapped(ENGLISH_BODY);
    const tamer = createTranslateTamer({ matchers });
    tamer.sweep();
    tamer.stop();

    expect(row.classList.contains(ROW_CLASS)).toBe(false);
    expect(row.classList.contains(ROW_HIDDEN_CLASS)).toBe(false);
  });
});
