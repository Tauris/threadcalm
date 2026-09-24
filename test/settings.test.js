import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bus, EVENTS } from '../src/core/bus.js';
import * as settings from '../src/core/settings.js';

beforeEach(() => {
  localStorage.clear();
  bus.clear();
  settings.load();
});

describe('defaults', () => {
  it('gives every schema entry a value', () => {
    const values = settings.defaults();
    for (const definition of settings.SCHEMA) {
      expect(values[definition.key], definition.key).toBeDefined();
    }
  });

  it('rejects reads of unknown keys instead of returning undefined', () => {
    expect(() => settings.get('nope.nothing')).toThrow(/Unknown setting/);
  });
});

describe('coercion', () => {
  it('clamps numbers into their declared range', () => {
    settings.update({ 'expand.maxClicksPerScan': 100000 });
    expect(settings.get('expand.maxClicksPerScan')).toBe(500);

    settings.update({ 'expand.maxClicksPerScan': -5 });
    expect(settings.get('expand.maxClicksPerScan')).toBe(1);
  });

  it('accepts numeric strings from form inputs', () => {
    settings.update({ 'expand.settleDelayMs': '1200' });
    expect(settings.get('expand.settleDelayMs')).toBe(1200);
  });

  it('falls back to the default for unparseable numbers', () => {
    settings.update({ 'expand.settleDelayMs': 'soon' });
    expect(settings.get('expand.settleDelayMs')).toBe(800);
  });

  it('refuses select values outside the option list', () => {
    settings.update({ 'translate.mode': 'sideways' });
    expect(settings.get('translate.mode')).toBe('compact');
  });

  it('filters unknown entries out of a multiselect', () => {
    settings.update({ 'general.languages': ['en', 'klingon'] });
    expect(settings.get('general.languages')).toEqual(['en']);
  });

  it('drops blank lines from pattern lists', () => {
    settings.update({ 'advanced.extraExpandReplies': ['^unfold$', '', '   '] });
    expect(settings.get('advanced.extraExpandReplies')).toEqual(['^unfold$']);
  });
});

describe('persistence', () => {
  it('survives a reload', () => {
    settings.update({ 'reading.enabled': true, 'expand.settleDelayMs': 900 });
    settings.load();

    expect(settings.get('reading.enabled')).toBe(true);
    expect(settings.get('expand.settleDelayMs')).toBe(900);
  });

  it('ignores stored keys that no longer exist', () => {
    settings.update({ 'reading.enabled': true });
    const stored = JSON.parse(localStorage.getItem('threadcalm:settings'));
    stored['removed.feature'] = 'whatever';
    localStorage.setItem('threadcalm:settings', JSON.stringify(stored));

    expect(() => settings.load()).not.toThrow();
    expect(settings.get('reading.enabled')).toBe(true);
  });

  it('recovers from corrupt storage', () => {
    localStorage.setItem('threadcalm:settings', 'not json');
    expect(() => settings.load()).not.toThrow();
    expect(settings.get('expand.enabled')).toBe(true);
  });

  it('resets to defaults', () => {
    settings.update({ 'expand.enabled': false });
    settings.reset();
    expect(settings.get('expand.enabled')).toBe(true);
  });
});

describe('change notification', () => {
  it('announces only the keys that actually changed', () => {
    const listener = vi.fn();
    bus.on(EVENTS.SETTINGS_CHANGED, listener);

    settings.update({ 'expand.enabled': true, 'reading.enabled': true });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].changed).toEqual({ 'reading.enabled': true });
  });

  it('stays silent when nothing changes', () => {
    const listener = vi.fn();
    bus.on(EVENTS.SETTINGS_CHANGED, listener);

    settings.update({ 'expand.enabled': settings.get('expand.enabled') });
    expect(listener).not.toHaveBeenCalled();
  });

  it('toggles booleans', () => {
    expect(settings.toggle('reading.enabled')).toBe(true);
    expect(settings.toggle('reading.enabled')).toBe(false);
  });
});

describe('panel wiring', () => {
  it('groups every setting under a known panel group', () => {
    const groups = new Set(settings.GROUPS.map((group) => group.id));
    for (const definition of settings.SCHEMA) {
      expect(groups, definition.key).toContain(definition.key.split('.')[0]);
    }
  });

  it('exposes custom patterns in the matcher shape', () => {
    settings.update({ 'advanced.extraPromoted': ['^ad$'] });
    expect(settings.customPatterns().promoted).toEqual(['^ad$']);
  });
});
