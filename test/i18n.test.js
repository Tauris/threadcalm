import { describe, expect, it } from 'vitest';
import { AVAILABLE_LANGUAGES, buildMatchers, LABEL_PACKS } from '../src/core/i18n.js';

describe('label packs', () => {
  it('gives every language the same set of fields', () => {
    const fields = Object.keys(LABEL_PACKS.en).sort();
    for (const code of AVAILABLE_LANGUAGES) {
      expect(Object.keys(LABEL_PACKS[code]).sort(), `language ${code}`).toEqual(fields);
    }
  });

  it('compiles every shipped pattern', () => {
    for (const code of AVAILABLE_LANGUAGES) {
      const matchers = buildMatchers([code]);
      for (const [field, value] of Object.entries(matchers)) {
        if (field === 'languages') continue;
        expect(value, `${code}.${field}`).toBeInstanceOf(RegExp);
      }
    }
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
