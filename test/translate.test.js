import { beforeEach, describe, expect, it } from 'vitest';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import {
  COMPACT_CLASS,
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

  it('still never hides "Show original"', () => {
    settings.update({ 'translate.mode': 'hide' });
    const button = mount(ENGLISH_BODY, 'Show original');
    createTranslateTamer({ matchers }).sweep();

    expect(button.classList.contains(HIDDEN_CLASS)).toBe(false);
    expect(button.classList.contains(COMPACT_CLASS)).toBe(true);
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
