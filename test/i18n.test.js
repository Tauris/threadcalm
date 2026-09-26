import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_LANGUAGES,
  buildMatchers,
  LABEL_PACKS,
  pageLanguage,
  resolveLanguages,
} from '../src/core/i18n.js';

describe('label packs', () => {
  it('gives every language the same set of fields', () => {
    const fields = Object.keys(LABEL_PACKS.en).sort();
    for (const code of AVAILABLE_LANGUAGES) {
      expect(Object.keys(LABEL_PACKS[code]).sort(), `language ${code}`).toEqual(fields);
    }
  });

  it('compiles every shipped pattern', () => {
    for (const code of AVAILABLE_LANGUAGES) {
      const pack = LABEL_PACKS[code];
      const matchers = buildMatchers([code]);
      for (const [field, value] of Object.entries(pack)) {
        if (field === 'name') continue;
        const patterns = [value].flat().filter(Boolean);
        for (const pattern of patterns) expect(() => new RegExp(pattern), `${code}.${field}`).not.toThrow();
        // A field with patterns compiles to a matcher; one without has none.
        if (patterns.length > 0) expect(matchers[field], `${code}.${field}`).toBeInstanceOf(RegExp);
        else expect(matchers[field], `${code}.${field}`).toBe(null);
      }
    }
  });

  it('covers every interface language Engage offers', () => {
    const engage = ['ar', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'he', 'hr', 'hu', 'id',
      'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'th', 'tr', 'uk', 'vi', 'zh'];
    for (const code of engage) {
      const matchers = buildMatchers([code]);
      expect(matchers.translate, `${code} translate`).toBeInstanceOf(RegExp);
      expect(matchers.expandText, `${code} see more`).toBeInstanceOf(RegExp);
    }
  });

  it.each([
    ['ja', 'translate', '翻訳を表示'],
    ['ja', 'showOriginal', '原文を表示 (英語)'],
    ['ja', 'expandText', '詳細を表示'],
    ['ar', 'showOriginal', 'إظهار النسخة الأصلية ()'],
    ['ar', 'expandReplies', 'إظهار ١ تعليق سابق'],
    ['pt', 'translate', 'Exibir tradução'],
    ['pt', 'showOriginal', 'Exibir original (Inglês)'],
    ['hu', 'expandText', 'Kibontás'],
    ['en', 'expandReplies', 'Show 3 previous comments'],
    ['en', 'expandReplies', 'Show 12 more comments'],
  ])('%s matches the live %s label %s', (code, field, label) => {
    expect(buildMatchers([code])[field].test(label)).toBe(true);
  });
});

describe('reply counters', () => {
  const matchers = buildMatchers(['en', 'de']);

  it.each([
    ['1 reply', true],
    ['12 replies', true],
    ['3 comments', true],
    ['1 Antwort', true],
    ['5 Antworten', true],
    ['2 Kommentare', true],
  ])('matches %s', (label, expected) => {
    expect(matchers.replyCount.test(label)).toBe(expected);
  });

  it.each([
    'Reply',
    'See 3 replies from your network',
    'replies',
    '12 people',
    'Reply to this post',
  ])('does not match prose: %s', (label) => {
    expect(matchers.replyCount.test(label)).toBe(false);
  });

  it('captures the count so the highlighter can read it', () => {
    expect(matchers.replyCount.exec('7 replies')[1]).toBe('7');
  });
});

describe('expansion labels', () => {
  const matchers = buildMatchers(['en', 'de', 'fr']);

  it.each([
    'Show more replies',
    'Load more replies',
    'View all replies',
    'Show previous replies',
    'Show 12 more replies',
    'Weitere Antworten anzeigen',
    'Alle Kommentare anzeigen',
    'Afficher les réponses précédentes',
  ])('matches pagination control: %s', (label) => {
    expect(matchers.expandReplies.test(label)).toBe(true);
  });

  it('does not treat a bare "Show more" as reply pagination', () => {
    // A bare "Show more" also names unrelated controls, so it must not match.
    expect(matchers.expandReplies.test('Show more')).toBe(false);
  });

  it('keeps "See more" in the separate truncation matcher', () => {
    expect(matchers.expandText.test('See more')).toBe(true);
    expect(matchers.expandText.test('Mehr anzeigen')).toBe(true);
    expect(matchers.expandText.test('See more replies')).toBe(false);
  });
});

describe('translation labels', () => {
  const matchers = buildMatchers(['en', 'de', 'fr', 'es']);

  it.each([
    'Show translation',
    'Translate',
    'Translate post',
    'Übersetzung anzeigen',
    'übersetzen',
    'Traduction',
    'Traducir',
  ])('matches %s', (label) => {
    expect(matchers.translate.test(label)).toBe(true);
  });

  it('distinguishes the inverse control', () => {
    expect(matchers.showOriginal.test('Show original')).toBe(true);
    expect(matchers.showOriginal.test('Original anzeigen')).toBe(true);
    expect(matchers.translate.test('Show original')).toBe(false);
  });
});

describe('custom patterns', () => {
  it('merges user-supplied patterns', () => {
    const matchers = buildMatchers(['en'], { expandReplies: ['^unfold thread$'] });
    expect(matchers.expandReplies.test('Unfold thread')).toBe(true);
  });

  it('ignores an invalid pattern rather than breaking the matcher', () => {
    const matchers = buildMatchers(['en'], { expandReplies: ['([unclosed'] });
    expect(matchers.expandReplies.test('Show more replies')).toBe(true);
  });

  it('falls back to English when no known language is selected', () => {
    const matchers = buildMatchers(['klingon']);
    expect(matchers.languages).toEqual(['en']);
    expect(matchers.replyCount.test('2 replies')).toBe(true);
  });
});

describe('choosing label sets from the page', () => {
  function withLang(lang) {
    const doc = document.implementation.createHTMLDocument('');
    if (lang !== null) doc.documentElement.lang = lang;
    return doc;
  }

  it('reads Engage’s language from <html lang>', () => {
    expect(pageLanguage(withLang('de-de'))).toBe('de');
    expect(pageLanguage(withLang('ja-JP'))).toBe('ja');
    expect(pageLanguage(withLang(null))).toBe(null);
  });

  it('uses the page’s own set, then the reader’s additions', () => {
    expect(resolveLanguages('fr', ['en', 'fr', 'klingon'])).toEqual({ codes: ['fr', 'en'], page: 'fr', supported: true });
  });

  it('says when the page is in a language without a set', () => {
    expect(resolveLanguages('is', [])).toMatchObject({ codes: [], supported: false });
  });

  it('falls back to English when nothing is known', () => {
    const { codes } = resolveLanguages(null, []);
    expect(buildMatchers(codes).languages).toEqual(['en']);
  });
});
