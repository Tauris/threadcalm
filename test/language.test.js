import { describe, expect, it } from 'vitest';
import { detectLanguage, isKnownLanguage } from '../src/core/language.js';

const SAMPLES = {
  en: 'The team has decided that we will move the release to the end of the month so that all of the remaining issues can be fixed and tested properly before anyone sees it.',
  de: 'Das Team hat entschieden, dass wir die Veröffentlichung auf das Ende des Monats verschieben, damit alle offenen Punkte noch behoben und getestet werden können.',
  fr: 'Nous avons décidé que la publication sera reportée à la fin du mois pour que tous les problèmes qui restent puissent être corrigés et testés.',
  es: 'El equipo ha decidido que la publicación se aplazará hasta el final del mes para que todos los problemas que quedan se puedan corregir y probar.',
  nl: 'Het team heeft besloten dat we de release naar het einde van de maand verplaatsen zodat alle openstaande punten nog kunnen worden opgelost en getest.',
};

describe('detectLanguage', () => {
  it.each(Object.entries(SAMPLES))('identifies %s prose', (expected, text) => {
    const result = detectLanguage(text);
    expect(result.language).toBe(expected);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('refuses to guess from too few words', () => {
    expect(detectLanguage('Thanks!')).toMatchObject({ language: null, confidence: 0 });
    expect(detectLanguage('')).toMatchObject({ language: null, confidence: 0 });
    expect(detectLanguage(null)).toMatchObject({ language: null, confidence: 0 });
  });

  it('returns no language when nothing is recognised', () => {
    const result = detectLanguage('lorem ipsum dolor sit amet consectetur adipiscing elit sed');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('ignores URLs and punctuation', () => {
    const withNoise = `${SAMPLES.en} https://engage.cloud.microsoft/main/feed #tag @someone`;
    expect(detectLanguage(withNoise).language).toBe('en');
  });

  it('handles accented text without a dedicated code path', () => {
    expect(detectLanguage(SAMPLES.fr).language).toBe('fr');
  });

  it.each([
    ['ja', '日本語の投稿です。明日の会議について確認します。'],
    ['zh', '这是一个中文帖子，讨论明天的会议安排和相关问题。'],
    ['ko', '내일 회의 일정과 관련된 내용을 확인하고 있습니다.'],
    ['el', 'Αυτή είναι μια ελληνική δημοσίευση για τη συνάντηση αύριο.'],
    ['th', 'นี่คือข้อความภาษาไทยเกี่ยวกับการประชุมในวันพรุ่งนี้'],
    ['hy', 'Սա վաղվա հանդիպման մասին հայերեն գրառում է։'],
    ['ka', 'ეს არის ქართული პოსტი ხვალინდელი შეხვედრის შესახებ.'],
  ])('recognizes %s from a distinctive script', (expected, text) => {
    expect(detectLanguage(text)).toMatchObject({ language: expected });
  });

  it('marks Han-only text as ambiguous between Chinese and Japanese', () => {
    expect(detectLanguage('这是一个中文帖子，讨论明天的会议安排和相关问题。'))
      .toMatchObject({ language: 'zh', ambiguous: true });
  });

  it('recognizes Japanese when a post also contains Latin text', () => {
    expect(detectLanguage('日本語の会議について Project Orion で確認します。'))
      .toMatchObject({ language: 'ja' });
  });

  it('lets Japanese win over the English it quotes', () => {
    const text = 'The release notes say: "All migrations are complete and the rollout starts on Monday '
      + 'for every region that has signed off." この件について、来週の会議で確認します。';
    expect(detectLanguage(text)).toMatchObject({ language: 'ja' });
  });

  it('lets Korean and Greek win over quoted English too', () => {
    const quote = 'The release notes say that all of the migrations are complete and the rollout starts on Monday.';
    expect(detectLanguage(`${quote} 내일 회의에서 확인하겠습니다.`)).toMatchObject({ language: 'ko' });
    expect(detectLanguage(`${quote} Θα το επιβεβαιώσουμε αύριο στη συνάντηση.`)).toMatchObject({ language: 'el' });
  });

  it('does not call an English post Japanese for one borrowed word', () => {
    const text = 'We should apply the カイゼン approach to the release process so that all of the remaining issues are fixed.';
    expect(detectLanguage(text)).toMatchObject({ language: 'en' });
  });

  it('does not guess Chinese from a short Han-only fragment', () => {
    expect(detectLanguage('東京会議')).toMatchObject({ language: null, confidence: 0 });
  });
});

describe('isKnownLanguage', () => {
  it('is true only for a confident match in the reader list', () => {
    expect(isKnownLanguage(SAMPLES.de, ['en', 'de'])).toBe(true);
    expect(isKnownLanguage(SAMPLES.fr, ['en', 'de'])).toBe(false);
  });

  it('is false for text it cannot judge, so the control stays visible', () => {
    expect(isKnownLanguage('Thanks!', ['en'])).toBe(false);
  });

  it('is false when the reader listed no languages', () => {
    expect(isKnownLanguage(SAMPLES.en, [])).toBe(false);
  });

  it('respects the confidence floor', () => {
    expect(isKnownLanguage(SAMPLES.en, ['en'], 0.99)).toBe(false);
  });
});
