import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settings from '../src/core/settings.js';
import { GESTURE_WINDOW_MS, createVideoGuard, withoutAutoplay } from '../src/features/video.js';
import { createPost, stubLayout } from './fixtures.js';

let guard;

/** A post holding a video, drawn at 100,100 and 200 wide and tall. */
function mountVideo({ paused = true, muted = true } = {}) {
  const post = createPost({ author: 'Ada Lovelace', body: 'Have a look at this.' });
  const video = document.createElement('video');
  video.muted = muted;
  Object.defineProperty(video, 'paused', { value: paused, configurable: true });
  video.pause = vi.fn();
  video.getBoundingClientRect = () => ({ left: 100, right: 300, top: 100, bottom: 300, width: 200, height: 200 });
  post.append(video);

  const row = document.createElement('div');
  row.setAttribute('data-testid', 'overflow-set');
  const like = document.createElement('button');
  row.append(like);
  post.append(row);

  document.body.append(post);
  return { post, video, like };
}

/** Starts the guard, treating the synthetic events below as genuine. */
function start(options = { isGenuine: () => true }) {
  guard = createVideoGuard(options);
  guard.start();
  return guard;
}

function press(target, x = 0, y = 0) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
}

function play(video) {
  video.dispatchEvent(new Event('play'));
}

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  guard?.stop();
  vi.useRealTimers();
});

describe('by default', () => {
  it('leaves videos to Engage', () => {
    expect(settings.get('video.autoplay')).toBe('engage');
    const { video } = mountVideo();
    start();
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
  });
});

describe('with videos held', () => {
  beforeEach(() => {
    settings.update({ 'video.autoplay': 'manual' });
  });

  it('pauses a video that starts by itself', () => {
    const { video } = mountVideo();
    start();
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('lets a video play that was clicked', () => {
    const { video } = mountVideo();
    start();
    press(video, 150, 150);
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('lets a video play when a control drawn on top of it was clicked', () => {
    const { post, video } = mountVideo();
    const overlay = document.createElement('button');
    document.body.append(overlay);
    start();
    press(overlay, 150, 150);
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
    expect(post.contains(overlay)).toBe(false);
  });

  it('lets a video play when its post was clicked outside the video', () => {
    const { post, video } = mountVideo();
    const poster = document.createElement('button');
    post.append(poster);
    start();
    press(poster, 500, 500);
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('lets a video play that was started from the keyboard', () => {
    const { post, video } = mountVideo();
    const control = document.createElement('button');
    post.append(control);
    start();
    control.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('does not count a click on the action row', () => {
    const { video, like } = mountVideo();
    start();
    press(like, 500, 500);
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('does not count a click elsewhere on the page', () => {
    const { video } = mountVideo();
    start();
    press(document.body, 900, 900);
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('does not count a click from long ago', () => {
    const { video } = mountVideo();
    start();
    press(video, 150, 150);
    vi.advanceTimersByTime(GESTURE_WINDOW_MS + 1);
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('keeps leaving alone a video the reader started', () => {
    const { video } = mountVideo();
    start();
    press(video, 150, 150);
    play(video);
    vi.advanceTimersByTime(GESTURE_WINDOW_MS * 10);
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('leaves alone a video in a dialog, which was opened on purpose', () => {
    const { video } = mountVideo();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.append(video);
    document.body.append(dialog);
    start();
    play(video);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('ignores script-made clicks, including its own', () => {
    const { video } = mountVideo();
    start({});
    press(video, 150, 150);
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('pauses a muted video already running, not one with sound', () => {
    const muted = mountVideo({ paused: false, muted: true }).video;
    const loud = mountVideo({ paused: false, muted: false }).video;
    start();
    expect(muted.pause).toHaveBeenCalledTimes(1);
    expect(loud.pause).not.toHaveBeenCalled();
  });

  it('catches a running video that arrives later', () => {
    start();
    const { video } = mountVideo({ paused: false });
    guard.onDomChanged();
    expect(video.pause).toHaveBeenCalledTimes(1);
  });
});

describe('withoutAutoplay', () => {
  it('removes autoplay and keeps the other entries', () => {
    expect(withoutAutoplay('autoplay *; fullscreen *; encrypted-media *'))
      .toBe('fullscreen *; encrypted-media *');
    expect(withoutAutoplay('fullscreen *; autoplay *')).toBe('fullscreen *');
    expect(withoutAutoplay('autoplay *')).toBe('');
    expect(withoutAutoplay('autoplay')).toBe('');
  });

  it('leaves an entry alone that only starts with the same letters', () => {
    expect(withoutAutoplay('autoplay-extra *; fullscreen')).toBe('autoplay-extra *; fullscreen');
  });
});

describe('embedded frames', () => {
  const ALLOW = 'autoplay *; fullscreen *';
  const SRC = 'https://player.example/embed';

  /** A frame with its src writes counted, since each one is a reload. */
  function mountFrame({ allow = ALLOW, parent = document.body } = {}) {
    const frame = document.createElement('iframe');
    frame.setAttribute('allow', allow);
    frame.setAttribute('src', SRC);
    const setAttribute = vi.spyOn(frame, 'setAttribute');
    parent.append(frame);
    const reloads = () => setAttribute.mock.calls.filter(([name]) => name === 'src').length;
    return { frame, reloads };
  }

  it('leaves frames alone by default', () => {
    const { frame, reloads } = mountFrame();
    start();
    guard.onDomChanged();
    expect(frame.getAttribute('allow')).toBe(ALLOW);
    expect(reloads()).toBe(0);
  });

  describe('with videos held', () => {
    beforeEach(() => {
      settings.update({ 'video.autoplay': 'manual' });
    });

    it('removes autoplay from a frame already there, and reloads it once', () => {
      const { frame, reloads } = mountFrame();
      start();
      expect(frame.getAttribute('allow')).toBe('fullscreen *');
      expect(frame.getAttribute('src')).toBe(SRC);
      expect(reloads()).toBe(1);
    });

    it('catches a frame added later, however deep', async () => {
      start();
      const wrapper = document.createElement('div');
      const { frame, reloads } = mountFrame({ parent: wrapper });
      document.body.append(wrapper);
      await Promise.resolve();
      await Promise.resolve();
      expect(frame.getAttribute('allow')).toBe('fullscreen *');
      expect(reloads()).toBe(1);
    });

    it('does not touch a frame without autoplay', () => {
      const { frame, reloads } = mountFrame({ allow: 'fullscreen *' });
      start();
      expect(frame.getAttribute('allow')).toBe('fullscreen *');
      expect(reloads()).toBe(0);
    });

    it('leaves a frame in a dialog alone', () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.append(dialog);
      const { frame, reloads } = mountFrame({ parent: dialog });
      start();
      expect(frame.getAttribute('allow')).toBe(ALLOW);
      expect(reloads()).toBe(0);
    });

    it('does not reload again if the page puts autoplay back', () => {
      const { frame, reloads } = mountFrame();
      start();
      frame.setAttribute('allow', ALLOW);
      guard.onDomChanged();
      expect(frame.getAttribute('allow')).toBe('fullscreen *');
      expect(reloads()).toBe(1);
    });

    it('restores the original value, and reloads, when switched off', () => {
      const { frame, reloads } = mountFrame();
      start();
      settings.update({ 'video.autoplay': 'engage' });
      guard.onSettingsChanged({ 'video.autoplay': 'engage' });
      expect(frame.getAttribute('allow')).toBe(ALLOW);
      expect(reloads()).toBe(2);
    });
  });
});

describe('switching', () => {
  it('takes effect at once in both directions', () => {
    const { video } = mountVideo();
    start();

    settings.update({ 'video.autoplay': 'manual' });
    guard.onSettingsChanged({ 'video.autoplay': 'manual' });
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);

    settings.update({ 'video.autoplay': 'engage' });
    guard.onSettingsChanged({ 'video.autoplay': 'engage' });
    play(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });
});
