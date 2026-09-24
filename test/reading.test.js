import { beforeEach, describe, expect, it } from 'vitest';
import { bus, EVENTS } from '../src/core/bus.js';
import * as settings from '../src/core/settings.js';
import { MODE_CLASSES, createQuietChrome } from '../src/features/quiet.js';
import { NO_BANNER_CLASS, PRESET, createReadingMode } from '../src/features/reading.js';
import { stubLayout } from './fixtures.js';

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  settings.setOverrides({});
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

/** Reading mode switched on, the way the r key does it. */
function reading() {
  const feature = createReadingMode();
  feature.start();
  feature.toggle();
  // The toggle writes reading.enabled; the feature reacts to that change.
  feature.onSettingsChanged({ 'reading.enabled': true });
  return feature;
}

describe('reading mode', () => {
  it('makes a loud page quiet', () => {
    reading();
    expect(settings.get('quiet.actions')).toBe('cluster');
    expect(settings.get('quiet.composer')).toBe(true);
    expect(settings.get('copy.showButtons')).toBe('focus');
    expect(settings.get('translate.mode')).toBe('compact');
    expect(settings.get('declutter.enabled')).toBe(true);
  });

  it('leaves alone a choice that is already at least as quiet', () => {
    // It only ever makes things quieter; overriding a quieter choice with a
    // louder one would be reading mode making the page noisier.
    settings.update({
      'quiet.actions': 'cluster-focus',
      'copy.showButtons': 'off',
      'translate.mode': 'hide',
    });
    reading();
    expect(settings.get('quiet.actions')).toBe('cluster-focus');
    expect(settings.get('copy.showButtons')).toBe('off');
    expect(settings.get('translate.mode')).toBe('hide');
    expect(settings.isOverridden('quiet.actions')).toBe(false);
  });

  it('hands every setting back exactly when switched off', () => {
    settings.update({ 'quiet.actions': 'dim', 'copy.showButtons': 'hover' });
    const feature = reading();
    expect(settings.get('quiet.actions')).toBe('cluster');

    feature.toggle();
    feature.onSettingsChanged({ 'reading.enabled': false });

    expect(settings.get('quiet.actions')).toBe('dim');
    expect(settings.get('copy.showButtons')).toBe('hover');
    for (const key of Object.keys(PRESET)) {
      expect(settings.isOverridden(key), key).toBe(false);
    }
  });

  it('never writes its values into the stored settings', () => {
    reading();
    const stored = JSON.parse(localStorage.getItem('threadcalm:settings'));
    expect(stored['quiet.actions']).toBe('off');
    expect(stored['quiet.composer']).toBe(false);
    expect(settings.getOwn('quiet.actions')).toBe('off');
  });

  it('hides the app bar unless the reader keeps it', () => {
    const feature = reading();
    expect(document.documentElement.classList.contains(NO_BANNER_CLASS)).toBe(true);

    settings.update({ 'reading.keepBanner': true });
    feature.onSettingsChanged({ 'reading.keepBanner': true });
    expect(document.documentElement.classList.contains(NO_BANNER_CLASS)).toBe(false);
  });

  it('reaches the features that read the settings', () => {
    reading();
    const quiet = createQuietChrome();
    quiet.start();
    expect(document.documentElement.classList.contains(MODE_CLASSES.cluster)).toBe(true);
  });
});

describe('overrides', () => {
  it('report exactly the settings whose value moved', () => {
    const seen = [];
    const off = bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => seen.push(changed));
    try {
      settings.setOverrides({ 'quiet.actions': 'cluster' });
      expect(seen).toEqual([{ 'quiet.actions': 'cluster' }]);
    } finally {
      off();
    }
  });

  it('stay silent when nothing moves, so a listener that re-applies cannot loop', () => {
    settings.setOverrides({ 'quiet.actions': 'cluster' });
    const seen = [];
    const off = bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => seen.push(changed));
    try {
      settings.setOverrides({ 'quiet.actions': 'cluster' });
      expect(seen).toEqual([]);
    } finally {
      off();
    }
  });
});
