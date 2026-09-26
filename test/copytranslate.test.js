import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, bus } from '../src/core/bus.js';
import { buildMatchers } from '../src/core/i18n.js';
import * as settings from '../src/core/settings.js';
import { createCopyTools } from '../src/features/copy.js';
import { renderThread } from '../src/features/thread.js';
import {
  MAX_COPY_TRANSLATIONS,
  TRANSLATE_TIMEOUT_MS,
  createTranslateTamer,
} from '../src/features/translate.js';
import { createToaster } from '../src/ui/toast.js';
import { createPost, stubLayout } from './fixtures.js';

const matchers = buildMatchers(['en', 'de']);

const FRENCH_BODY =
  'Nous avons decide que la publication sera reportee a la fin du mois pour que tous les problemes qui restent puissent etre corriges.';
const FRENCH_IN_ENGLISH = 'We decided to move the release to the end of the month.';
const ENGLISH_BODY =
  'The team has decided that we will move the release to the end of the month so that all of the remaining issues can be fixed and tested.';

/**
 * Plays Engage's part: clicking "Show translation" replaces the body with the
 * translation and turns the control into "Show original (French)".
 */
function engageTranslates(article, { translation = FRENCH_IN_ENGLISH, from = 'French', delayMs = 0 } = {}) {
  const control = article.querySelector(':scope > div > .translate-control');
  const body = article.children[1];
  control.addEventListener('click', () => {
    const apply = () => {
      body.textContent = translation;
      control.textContent = `Show original (${from})`;
    };
    if (delayMs) setTimeout(apply, delayMs);
    else apply();
  });
  return control;
}

function mountThread(replies = []) {
  const main = document.createElement('div');
  main.setAttribute('role', 'main');
  const starter = createPost({
    author: 'Ada Lovelace',
    body: FRENCH_BODY,
    translateLabel: 'Show translation',
    replies,
  });
  main.append(starter);
  document.body.append(main);
  return starter;
}

let tamer;

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  vi.useFakeTimers();
  tamer = createTranslateTamer({ matchers, IntersectionObserverImpl: undefined });
  tamer.start();
});

afterEach(() => {
  tamer.stop();
  vi.useRealTimers();
  delete globalThis.GM_setClipboard;
});

/** Runs a promise to completion while fake time passes. */
async function settle(promise, ms = 60_000) {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

describe('recognising a translated post', () => {
  it('reads the source language from Engage’s own label', () => {
    const post = mountThread();
    engageTranslates(post).click();
    expect(tamer.translationOf(post)).toMatchObject({ from: 'French' });
  });

  it('keeps the original when the reader translates by hand', () => {
    const post = mountThread();
    engageTranslates(post).click();
    expect(tamer.translationOf(post).original).toBe(FRENCH_BODY);
  });

  it('says nothing about a post showing its original', () => {
    const post = mountThread();
    expect(tamer.translationOf(post)).toBe(null);
  });
});

describe('translating a thread for copying', () => {
  it('does nothing while automatic translation is off', async () => {
    const post = mountThread();
    const control = engageTranslates(post);
    const click = vi.fn();
    control.addEventListener('click', click);

    const result = await settle(tamer.translateForCopy([post]));

    expect(result.translated).toBe(0);
    expect(click).not.toHaveBeenCalled();
  });

  it('translates posts that never came on screen', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const post = mountThread();
    engageTranslates(post);

    const result = await settle(tamer.translateForCopy([post]));

    expect(result).toMatchObject({ translated: 1, eligible: 1, stopped: false });
    expect(tamer.translationOf(post)).toEqual({ from: 'French', original: FRENCH_BODY });
  });

  it('leaves readable posts and posts the reader turned back alone', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const post = mountThread([{ author: 'Grace Hopper', body: ENGLISH_BODY, translateLabel: 'Show translation' }]);
    const control = engageTranslates(post);

    // Translated once, then turned back to the original by the reader.
    await settle(tamer.translateForCopy([post]));
    control.textContent = 'Show translation';
    const click = vi.fn();
    control.addEventListener('click', click);

    const reply = post.querySelector('[role="article"]');
    const result = await settle(tamer.translateForCopy([post, reply]));

    expect(result.eligible).toBe(0);
    expect(click).not.toHaveBeenCalled();
  });

  it('waits for Engage, and copies without a translation that never comes', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const slow = mountThread();
    engageTranslates(slow, { delayMs: 1500 });
    expect((await settle(tamer.translateForCopy([slow]))).translated).toBe(1);

    document.body.innerHTML = '';
    const silent = mountThread();
    const promise = tamer.translateForCopy([silent]);
    await vi.advanceTimersByTimeAsync(TRANSLATE_TIMEOUT_MS + 1000);
    expect((await promise).translated).toBe(0);
  });

  it('stops between posts when switched off', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const posts = [mountThread(), mountThread(), mountThread()];
    posts.forEach((post) => engageTranslates(post));
    const clicks = posts.map((post) => {
      const click = vi.fn();
      post.querySelector('.translate-control').addEventListener('click', click);
      return click;
    });

    const promise = tamer.translateForCopy(posts, {
      onProgress: (done) => {
        if (done === 1) settings.update({ 'translate.autoWhenVisible': false });
      },
    });
    const result = await settle(promise);

    expect(result.stopped).toBe(true);
    expect(clicks.map((click) => click.mock.calls.length)).toEqual([1, 0, 0]);
  });

  it('stops when expansion is paused', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const posts = [mountThread(), mountThread()];
    posts.forEach((post) => engageTranslates(post));

    const promise = tamer.translateForCopy(posts, {
      onProgress: (done) => {
        if (done === 1) bus.emit(EVENTS.EXPAND_STATE, { enabled: true, paused: true });
      },
    });
    const result = await settle(promise);

    expect(result.stopped).toBe(true);
    expect(tamer.translationOf(posts[1])).toBe(null);
  });

  it('translates at most a fixed number of posts per copy', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const posts = Array.from({ length: MAX_COPY_TRANSLATIONS + 2 }, () => mountThread());
    posts.forEach((post) => engageTranslates(post));

    const result = await settle(tamer.translateForCopy(posts), 120_000);

    expect(result).toMatchObject({ translated: MAX_COPY_TRANSLATIONS, skipped: 2 });
  });
});

describe('copying a translated thread', () => {
  async function copy(post) {
    let copied = '';
    globalThis.GM_setClipboard = (text) => {
      copied = text;
    };
    const tools = createCopyTools({ expander: { expandWithin: () => 0 }, translate: tamer });
    await settle(tools.copyThread(post));
    return copied;
  }

  it('translates first, and says the text is a translation', async () => {
    settings.update({ 'translate.autoWhenVisible': true });
    const post = mountThread();
    engageTranslates(post);

    const copied = await copy(post);

    expect(copied).toContain(FRENCH_IN_ENGLISH);
    expect(copied).toContain('*Translated from French by Engage.*');
    expect(copied).not.toContain(FRENCH_BODY);
  });

  it('adds the original when asked to', async () => {
    settings.update({ 'translate.autoWhenVisible': true, 'copy.includeOriginal': true });
    const post = mountThread();
    engageTranslates(post);

    const copied = await copy(post);

    expect(copied).toContain('*Original:*');
    expect(copied).toContain(FRENCH_BODY);
  });

  it('marks a translation the reader made, with automatic translation off', async () => {
    const post = mountThread();
    engageTranslates(post).click();

    const copied = await copy(post);

    expect(copied).toContain('*Translated from French by Engage.*');
  });

  it('copies as shown, untranslated, with automatic translation off', async () => {
    const post = mountThread();
    engageTranslates(post);

    const copied = await copy(post);

    expect(copied).toContain(FRENCH_BODY);
    expect(copied).not.toContain('Translated');
  });
});

describe('rendering translations', () => {
  const thread = {
    author: 'Ada Lovelace',
    body: FRENCH_IN_ENGLISH,
    timestamp: { iso: null, display: '' },
    permalink: null,
    translation: { from: 'French', original: FRENCH_BODY },
    replies: [
      {
        author: 'Grace Hopper',
        body: 'Merci, bien noted.',
        timestamp: { iso: null, display: '' },
        permalink: null,
        translation: { from: null, original: null },
        replies: [],
      },
    ],
  };

  it('keeps notes and originals inside a reply’s quote', () => {
    const markdown = renderThread(thread, { includePermalink: false, includeOriginal: true });
    expect(markdown).toContain('> *Translated by Engage.*');
    expect(markdown).toContain('> *The original was not captured.*');
  });

  it('marks translations in plain text too', () => {
    const text = renderThread(thread, { format: 'text', includePermalink: false, includeOriginal: true });
    expect(text).toContain('[Translated from French by Engage]');
    expect(text).toContain(`Original:\n${FRENCH_BODY}`);
  });
});

describe('progress toasts', () => {
  it('update in place instead of stacking', () => {
    const toaster = createToaster();
    toaster.show({ message: 'Translating 1 of 3…', key: 'progress' });
    toaster.show({ message: 'Translating 2 of 3…', key: 'progress' });

    const toasts = document.querySelectorAll('#tc-toasts .tc-toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('Translating 2 of 3…');
    toaster.stop();
  });
});
