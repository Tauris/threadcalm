import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settings from '../src/core/settings.js';
import { GESTURE_WINDOW_MS, createVideoGuard } from '../src/features/video.js';
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
