import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bus, EVENTS } from '../src/core/bus.js';
import { accessibleTexts } from '../src/core/dom.js';
import { resetStats, snapshot } from '../src/core/stats.js';
import * as settings from '../src/core/settings.js';
import { startSpaWatcher } from '../src/core/spa.js';
import { createExpander } from '../src/features/expand.js';
import { buildMatchers } from '../src/core/i18n.js';
import { stubLayout } from './fixtures.js';

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  window.history.replaceState({}, '', '/main/feed');
  resetStats();
});

/**
 * Counts reads of `innerText` on one element.
 *
 * This is the whole performance question in one number. `innerText` flushes
 * layout, so reading it once per candidate control -- every span in the
 * document, several times a second -- is what made a long feed grind and the
 * heap climb. `textContent` costs nothing and answers "could this be a label?"
 * on its own.
 */
function watchInnerText(element, value) {
  const reads = { count: 0 };
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get() {
      reads.count += 1;
      return value;
    },
  });
  return reads;
}

describe('reading an element name', () => {
  it('does not lay out an element far too long to be a label', () => {
    const post = document.createElement('div');
    post.textContent = 'x'.repeat(5000);
    document.body.append(post);
    const reads = watchInnerText(post, post.textContent);

    expect(accessibleTexts(post, { maxLength: 40 })).toEqual([]);
    expect(reads.count).toBe(0);
  });

  it('still reads one that could plausibly be a label', () => {
    const button = document.createElement('button');
    button.textContent = '3 replies';
    document.body.append(button);
    const reads = watchInnerText(button, '3 replies');

    expect(accessibleTexts(button, { maxLength: 40 })).toContain('3 replies');
    expect(reads.count).toBe(1);
  });

  it('tolerates hidden text alongside a short visible label', () => {
    // innerText omits what is hidden, so raw text runs longer than the label.
    // The budget has to be loose enough not to discard these.
    const button = document.createElement('button');
    button.textContent = `3 replies${'s'.repeat(200)}`;
    document.body.append(button);
    watchInnerText(button, '3 replies');

    expect(accessibleTexts(button, { maxLength: 40 })).toContain('3 replies');
  });

  it('still finds a name in the attributes of something long', () => {
    const post = document.createElement('div');
    post.textContent = 'x'.repeat(5000);
    post.setAttribute('aria-label', 'Like - someone’s post');
    document.body.append(post);

    // The body is skipped, the label is not.
    expect(accessibleTexts(post, { maxLength: 40 })).toEqual(['Like - someone’s post']);
  });

  it('reads everything when no limit is given', () => {
    const post = document.createElement('div');
    post.textContent = 'x'.repeat(5000);
    document.body.append(post);
    const reads = watchInnerText(post, post.textContent);

    expect(accessibleTexts(post)).toHaveLength(1);
    expect(reads.count).toBe(1);
  });
});

describe('watching the page for changes', () => {
  /** Resolves with true if DOM_CHANGED arrives before the deadline. */
  function sawDomChange(act, ms = 120) {
    return new Promise((resolve) => {
      const off = bus.on(EVENTS.DOM_CHANGED, () => {
        off();
        clearTimeout(timer);
        resolve(true);
      });
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, ms);
      act();
    });
  }

  it('ignores the script rewriting its own panel', async () => {
    // The panel rewrites its status as expansion progresses. Counted as page
    // activity it runs every sweep, which reports progress, which rewrites the
    // panel: a loop that never settles and gets slower as the feed grows.
    const panel = document.createElement('div');
    panel.id = 'tc-panel';
    const status = document.createElement('span');
    panel.append(status);
    document.body.append(panel);

    const stop = startSpaWatcher({ domDebounceMs: 10 });
    try {
      const seen = await sawDomChange(() => {
        status.textContent = 'Expanding… 12 items';
      });
      expect(seen).toBe(false);
    } finally {
      stop();
    }
  });

  it('ignores its own chip being taken off a post and put back', async () => {
    const post = document.createElement('div');
    post.setAttribute('role', 'article');
    document.body.append(post);

    const stop = startSpaWatcher({ domDebounceMs: 10 });
    try {
      const chip = document.createElement('div');
      chip.className = 'tc-chip';
      const seen = await sawDomChange(() => {
        post.append(chip);
        chip.remove();
      });
      expect(seen).toBe(false);
    } finally {
      stop();
    }
  });

  it('still reports a change Engage makes', async () => {
    const main = document.createElement('div');
    main.setAttribute('role', 'main');
    document.body.append(main);

    const stop = startSpaWatcher({ domDebounceMs: 10 });
    try {
      const seen = await sawDomChange(() => {
        main.append(document.createElement('article'));
      });
      expect(seen).toBe(true);
    } finally {
      stop();
    }
  });
});

describe('the heartbeat once a thread has settled', () => {
  // Scans are deferred through setTimeout, and the heartbeat is an interval,
  // so this has to drive the clock rather than call anything directly.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const BEAT = 1000;

  function running() {
    const expander = createExpander({ matchers: buildMatchers(['en']) });
    expander.start();
    // Five beats: three empty scans settle it, the rest go idle.
    vi.advanceTimersByTime(BEAT * 5);
    return expander;
  }

  it('stops rescanning a page that has not moved', () => {
    // A scan reads every candidate control in the document. Repeating one
    // against an unchanged page is what kept a machine busy overnight.
    const expander = running();
    const settled = expander._internals.scanCount();
    expect(settled).toBeGreaterThan(0);

    vi.advanceTimersByTime(BEAT * 5);
    expect(expander._internals.scanCount()).toBe(settled);

    expander.stop();
  });

  it('keeps a slow safety net, for replies that arrive unannounced', () => {
    const expander = running();
    const settled = expander._internals.scanCount();

    // Far enough to cross the idle interval at least once.
    vi.advanceTimersByTime(BEAT * 12);
    expect(expander._internals.scanCount()).toBeGreaterThan(settled);

    expander.stop();
  });

  it('wakes immediately when the page really changes', () => {
    const expander = running();
    const settled = expander._internals.scanCount();

    expander.onDomChanged();
    vi.advanceTimersByTime(BEAT);
    expect(expander._internals.scanCount()).toBeGreaterThan(settled);

    expander.stop();
  });
});

describe('the activity counters', () => {
  it('separate what was laid out from what was skipped', () => {
    // This is the number that answers "is it still working when idle?".
    const label = document.createElement('button');
    label.textContent = '3 replies';
    const prose = document.createElement('div');
    prose.textContent = 'x'.repeat(5000);
    document.body.append(label, prose);

    accessibleTexts(label, { maxLength: 40 });
    accessibleTexts(prose, { maxLength: 40 });

    const stats = snapshot();
    expect(stats.layoutReads).toBe(1);
    expect(stats.layoutSkips).toBe(1);
  });

  it('report the page size and how long the script has been up', () => {
    const stats = snapshot();
    expect(stats.domNodes).toBeGreaterThan(0);
    expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    // Nothing has scanned yet, which is different from having scanned now.
    expect(stats.sinceLastScanSeconds).toBe(null);
  });

  it('start over when reset, so a second reading has a baseline', () => {
    const label = document.createElement('button');
    label.textContent = 'Reply';
    document.body.append(label);
    accessibleTexts(label, { maxLength: 40 });
    expect(snapshot().layoutReads).toBe(1);

    resetStats();
    expect(snapshot().layoutReads).toBe(0);
  });
});
