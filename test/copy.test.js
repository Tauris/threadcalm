import { beforeEach, describe, expect, it } from 'vitest';
import * as settings from '../src/core/settings.js';
import {
  CHIP_CLASS,
  CORNER_CLASSES,
  HOST_CLASS,
  REVEAL_CLASSES,
  createCopyTools,
} from '../src/features/copy.js';
import { stubLayout } from './fixtures.js';

/** The expander is only used when copying; the chip never touches it. */
const expander = { expandWithin: () => 0 };

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

function mountPost() {
  document.body.innerHTML = `
    <div role="main">
      <div role="article" id="post">
        <div data-testid="overflow-set"><button type="button">Like</button></div>
      </div>
    </div>
  `;
  return document.getElementById('post');
}

function copyTools() {
  const feature = createCopyTools({ expander });
  feature.start();
  return feature;
}

describe('the copy chip', () => {
  it('is attached to the post', () => {
    const post = mountPost();
    copyTools();
    expect(post.classList.contains(HOST_CLASS)).toBe(true);
    expect(post.querySelector(`.${CHIP_CLASS}`)).not.toBe(null);
  });

  it('is not attached when copying is left to the keyboard', () => {
    settings.update({ 'copy.showButtons': 'off' });
    const post = mountPost();
    copyTools();
    expect(post.querySelector(`.${CHIP_CLASS}`)).toBe(null);
  });

  it('is attached, but not pointer-revealed, in keyboard mode', () => {
    // The chip still exists so focus can reach it; only what summons it moves.
    settings.update({ 'copy.showButtons': 'focus' });
    const post = mountPost();
    copyTools();

    expect(post.querySelector(`.${CHIP_CLASS}`)).not.toBe(null);
    const root = document.documentElement;
    expect(root.classList.contains(REVEAL_CLASSES.focus)).toBe(true);
    expect(root.classList.contains(REVEAL_CLASSES.hover)).toBe(false);
  });

  it('carries the hover reveal class by default', () => {
    mountPost();
    copyTools();
    expect(document.documentElement.classList.contains(REVEAL_CLASSES.hover)).toBe(true);
  });

  it('drops its classes when switched to keyboard-only at runtime', () => {
    mountPost();
    const feature = copyTools();
    settings.update({ 'copy.showButtons': 'off' });
    feature.onSettingsChanged();

    const root = document.documentElement;
    for (const className of Object.values(REVEAL_CLASSES)) {
      expect(root.classList.contains(className), className).toBe(false);
    }
    expect(document.querySelector(`.${CHIP_CLASS}`)).toBe(null);
  });
});

describe('settings written by an older version', () => {
  it.each([
    [true, 'hover'],
    [false, 'off'],
  ])('reads a stored %s as %s', (stored, expected) => {
    // copy.showButtons was a switch before it became a choice. Without the
    // migration everyone who had turned it off would find it back on.
    localStorage.setItem('threadcalm:settings', JSON.stringify({ 'copy.showButtons': stored }));
    settings.load();
    expect(settings.get('copy.showButtons')).toBe(expected);
  });
});

describe('the chip corner', () => {
  it.each(Object.entries(CORNER_CLASSES))(
    'applies %s, and only that one',
    (corner, className) => {
      // Engage uses a post's corners itself, so which one is free differs by
      // tenant. Every choice is checked: adding one and forgetting to apply it
      // would fail silently.
      settings.update({ 'copy.chipCorner': corner });
      mountPost();
      copyTools();

      const root = document.documentElement;
      expect(root.classList.contains(className)).toBe(true);
      for (const other of Object.values(CORNER_CLASSES)) {
        if (other === className) continue;
        expect(root.classList.contains(other), other).toBe(false);
      }
    },
  );

  it('follows a change without a reload', () => {
    mountPost();
    const feature = copyTools();
    expect(document.documentElement.classList.contains(CORNER_CLASSES['top-right'])).toBe(true);

    settings.update({ 'copy.chipCorner': 'bottom-left' });
    feature.onSettingsChanged();

    const root = document.documentElement;
    expect(root.classList.contains(CORNER_CLASSES['bottom-left'])).toBe(true);
    expect(root.classList.contains(CORNER_CLASSES['top-right'])).toBe(false);
  });

  it('is cleaned up on stop', () => {
    mountPost();
    const feature = copyTools();
    feature.stop();
    for (const className of Object.values(CORNER_CLASSES)) {
      expect(document.documentElement.classList.contains(className), className).toBe(false);
    }
  });
});
