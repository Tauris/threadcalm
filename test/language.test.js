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
