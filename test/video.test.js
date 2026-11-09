import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settings from '../src/core/settings.js';
import {
  CHECK_INTERVAL_MS,
  GESTURE_WINDOW_MS,
  MAX_HOLDS,
  RECREATION_LIMIT,
  classifyFrame,
  createVideoGuard,
} from '../src/features/video.js';
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

describe('classifyFrame', () => {
  function frame(attributes, parent = document.body) {
    const node = document.createElement('iframe');
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    parent.append(node);
    return node;
  }

  it('takes autoplay permission as a player on its own', () => {
    const { player, reasons } = classifyFrame(frame({ allow: 'autoplay *', src: 'https://player.example/x' }));
    expect(player).toBe(true);
    expect(reasons).toContain('allow:autoplay');
  });

  it('takes a player-shaped address as a player on its own', () => {
    expect(classifyFrame(frame({ src: 'https://cdn.example/_layouts/15/embed.aspx?id=1' })).player).toBe(true);
    expect(classifyFrame(frame({ src: 'https://cdn.example/videoplayer/abc' })).player).toBe(true);
  });

  it('takes a SharePoint frame as a player only near something named after video, or in a post', () => {
    const bare = frame({ src: 'https://contoso.sharepoint.com/sites/x/page.aspx' });
    expect(classifyFrame(bare)).toEqual({ player: false, reasons: ['host:sharepoint'] });

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-testid', 'videoPlayerContainer');
    document.body.append(wrapper);
    expect(classifyFrame(frame({ src: 'https://contoso.sharepoint.com/sites/x/page.aspx' }, wrapper)).player).toBe(true);

    const post = createPost({ author: 'A', body: 'b' });
    document.body.append(post);
    expect(classifyFrame(frame({ src: 'https://contoso.sharepoint.com/sites/x/page.aspx' }, post)).player).toBe(true);
  });

  it('leaves other embeds alone', () => {
    expect(classifyFrame(frame({ src: 'https://forms.example/embed-form', allow: 'clipboard-write' })).player).toBe(false);
    expect(classifyFrame(frame({ src: 'https://sharepoint.com.example/x' })).player).toBe(false);
  });
});

describe('embedded players', () => {
  const ALLOW = 'autoplay *; fullscreen *';
  const SRC = 'https://example.sharepoint.com/_layouts/15/embed.aspx?UniqueId=1';
  const BLANK = 'about:blank';

  function mountFrame({ allow = ALLOW, src = SRC, srcdoc = null, parent = document.body } = {}) {
    const frame = document.createElement('iframe');
    if (allow) frame.setAttribute('allow', allow);
    if (src) frame.setAttribute('src', src);
    if (srcdoc != null) frame.setAttribute('srcdoc', srcdoc);
    const wrapper = document.createElement('div');
    wrapper.append(frame);
    parent.append(wrapper);
    return { frame, wrapper };
  }

  const placeholderIn = (wrapper) => wrapper.querySelector('.tc-video-hold');
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('leaves them alone by default', () => {
    const { frame, wrapper } = mountFrame();
    start();
    guard.onDomChanged();
    expect(frame.getAttribute('src')).toBe(SRC);
    expect(placeholderIn(wrapper)).toBeNull();
  });

  describe('with videos held', () => {
    beforeEach(() => {
      settings.update({ 'video.autoplay': 'manual' });
    });

    it('keeps a player already there from loading, and offers a button', () => {
      const { frame, wrapper } = mountFrame();
      start();
      expect(frame.getAttribute('src')).toBe(BLANK);
      expect(frame.getAttribute('allow')).toBe(ALLOW);
      expect(frame.isConnected).toBe(true);
      expect(placeholderIn(wrapper).textContent).toContain('Load video here');
      expect(placeholderIn(wrapper).textContent).toContain('Embedded video');
      expect(placeholderIn(wrapper).querySelector('a').href).toBe(SRC);
    });

    it('does not mistake its own blanking for the page putting the address back', async () => {
      const { frame, wrapper } = mountFrame();
      start();
      await settle();
      await settle();
      expect(frame.getAttribute('src')).toBe(BLANK);
      expect(placeholderIn(wrapper)).not.toBeNull();
      expect(guard.inspect().join('\n')).toContain('holds=1');
    });

    it('catches a player added later, however deep', async () => {
      start();
      const outer = document.createElement('div');
      const { frame } = mountFrame({ parent: outer });
      document.body.append(outer);
      await settle();
      expect(frame.getAttribute('src')).toBe(BLANK);
    });

    it('catches a player that gets its address after it was added', async () => {
      start();
      const { frame } = mountFrame({ src: null });
      await settle();
      expect(frame.getAttribute('src')).toBeNull();
      frame.setAttribute('src', SRC);
      await settle();
      expect(frame.getAttribute('src')).toBe(BLANK);
    });

    it('holds inline content too, and gives it back on a click', () => {
      const { frame, wrapper } = mountFrame({ src: null, srcdoc: '<video autoplay></video>' });
      start();
      expect(frame.hasAttribute('srcdoc')).toBe(false);
      expect(frame.getAttribute('src')).toBe(BLANK);
      placeholderIn(wrapper).click();
      expect(frame.getAttribute('srcdoc')).toBe('<video autoplay></video>');
    });

    it('loads the player on a click, without the click reaching the post', () => {
      const { frame, wrapper } = mountFrame();
      const onPostClick = vi.fn();
      wrapper.addEventListener('click', onPostClick);
      start();
      placeholderIn(wrapper).click();
      expect(frame.getAttribute('src')).toBe(SRC);
      expect(placeholderIn(wrapper)).toBeNull();
      expect(onPostClick).not.toHaveBeenCalled();
    });

    it('does not hold a player again once it was clicked', () => {
      const { frame, wrapper } = mountFrame();
      start();
      placeholderIn(wrapper).click();
      guard.onDomChanged();
      expect(frame.getAttribute('src')).toBe(SRC);
    });

    it('leaves other embeds alone', () => {
      const other = mountFrame({ allow: 'clipboard-write', src: 'https://forms.example/embed-form' });
      const quiet = mountFrame({ allow: 'fullscreen *', src: 'https://docs.example/page' });
      start();
      expect(other.frame.getAttribute('src')).toBe('https://forms.example/embed-form');
      expect(quiet.frame.getAttribute('src')).toBe('https://docs.example/page');
      expect(guard.inspect().join('\n')).toContain('left alone: not a player');
    });

    it('leaves a player in a dialog of its own alone, but not one in a post shown in a dialog', () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.append(dialog);
      const lightbox = mountFrame({ parent: dialog });
      const post = createPost({ author: 'A', body: 'b' });
      dialog.append(post);
      const inPost = mountFrame({ parent: post });
      start();
      expect(lightbox.frame.getAttribute('src')).toBe(SRC);
      expect(inPost.frame.getAttribute('src')).toBe(BLANK);
    });

    it('holds again when the page restores the address, keeping one button', () => {
      const { frame, wrapper } = mountFrame();
      start();
      frame.setAttribute('src', SRC);
      guard.onDomChanged();
      expect(frame.getAttribute('src')).toBe(BLANK);
      expect(wrapper.querySelectorAll('.tc-video-hold')).toHaveLength(1);
    });

    it('gives up on a page that keeps restoring the address, and gives the address back', () => {
      const { frame, wrapper } = mountFrame();
      start();
      for (let round = 0; round < MAX_HOLDS + 1; round += 1) {
        frame.setAttribute('src', SRC);
        guard.onDomChanged();
      }
      expect(frame.getAttribute('src')).toBe(SRC);
      expect(placeholderIn(wrapper)).toBeNull();
      expect(guard.inspect().join('\n')).toContain('released: address put back');
    });

    it('gives up on a post that keeps creating new frames', () => {
      const post = createPost({ author: 'A', body: 'b' });
      document.body.append(post);
      start();
      const frames = [];
      for (let round = 0; round < RECREATION_LIMIT; round += 1) {
        frames.push(mountFrame({ parent: post }).frame);
        guard.onDomChanged();
      }
      expect(frames.at(-1).getAttribute('src')).toBe(SRC);
      expect(frames[0].getAttribute('src')).toBe(SRC);
      expect(post.querySelectorAll('.tc-video-hold')).toHaveLength(0);
      const later = mountFrame({ parent: post }).frame;
      guard.onDomChanged();
      expect(later.getAttribute('src')).toBe(SRC);
    });

    it('keeps the tile when the page takes the frame away, and rebuilds the player from it', () => {
      const { frame, wrapper } = mountFrame();
      start();
      frame.remove();
      guard.onDomChanged();
      expect(placeholderIn(wrapper)).not.toBeNull();
      expect(guard.inspect().join('\n')).toContain('tile-connected=true frame-connected=false');

      placeholderIn(wrapper).click();
      const rebuilt = wrapper.querySelector('iframe.tc-video-rebuilt');
      expect(rebuilt.getAttribute('src')).toBe(SRC);
      expect(rebuilt.getAttribute('allow')).toBe(ALLOW);
      expect(placeholderIn(wrapper)).toBeNull();
      guard.onDomChanged();
      expect(rebuilt.getAttribute('src')).toBe(SRC);
    });

    it('puts the tile back when the page re-renders around it', () => {
      const { frame, wrapper } = mountFrame();
      start();
      placeholderIn(wrapper).remove();
      guard.onDomChanged();
      expect(placeholderIn(wrapper)).not.toBeNull();
      expect(frame.nextElementSibling).toBe(placeholderIn(wrapper));
    });

    it('lets the secondary link open the player elsewhere without loading it here', () => {
      const { frame, wrapper } = mountFrame();
      start();
      const link = placeholderIn(wrapper).querySelector('a.tc-video-hold-open');
      expect(link.target).toBe('_blank');
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(frame.getAttribute('src')).toBe(BLANK);
      expect(placeholderIn(wrapper)).not.toBeNull();
    });

    it('restores every player when switched off, and holds again when switched on', () => {
      const { frame, wrapper } = mountFrame();
      start();
      settings.update({ 'video.autoplay': 'engage' });
      guard.onSettingsChanged({ 'video.autoplay': 'engage' });
      expect(frame.getAttribute('src')).toBe(SRC);
      expect(placeholderIn(wrapper)).toBeNull();
      settings.update({ 'video.autoplay': 'manual' });
      guard.onSettingsChanged({ 'video.autoplay': 'manual' });
      expect(frame.getAttribute('src')).toBe(BLANK);
    });
  });
});

describe('players loaded from inside the frame', () => {
  const SRC = 'https://example.sharepoint.com/_layouts/15/embed.aspx?UniqueId=1';
  const ORIGINAL_GET = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;

  /** Engage's player as the report showed it: autoplay allowed, in a post, and no src. */
  function mountPlayer({ parent = null, allow = 'autoplay *;clipboard-write *;' } = {}) {
    const post = parent ?? createPost({ author: 'Ada Lovelace', body: 'A talk.' });
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-testid', 'one-player');
    const frame = document.createElement('iframe');
    frame.setAttribute('allow', allow);
    frame.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin');
    wrapper.append(frame);
    post.append(wrapper);
    if (!parent) document.body.append(post);
    return { post, wrapper, frame };
  }

  /** What the SDK does: write a token form into the blank frame and submit it. */
  function sdkPosts(frame, { viaEvent = false } = {}) {
    const doc = frame.contentDocument;
    const form = doc.createElement('form');
    form.method = 'post';
    form.action = SRC;
    const token = doc.createElement('input');
    token.type = 'hidden';
    token.name = 'access_token';
    token.value = 'secret-token';
    form.append(token);
    doc.body.append(form);
    if (viaEvent) {
      const event = new frame.contentWindow.Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
      return event;
    }
    form.submit();
    return form;
  }

  const placeholderIn = (node) => node.querySelector('.tc-video-hold');

  /** The frame realm's own submit, watched before the guard wraps it; what it posts is recorded. */
  function watchRealmSubmit(frame) {
    const posted = [];
    const realm = ORIGINAL_GET.call(frame);
    vi.spyOn(realm.HTMLFormElement.prototype, 'submit').mockImplementation(function record() {
      posted.push({
        method: this.method,
        action: this.action,
        target: this.target,
        inFrame: this.ownerDocument === realm.document,
        fields: [...this.elements].map((element) => [element.name, element.value]),
      });
    });
    return posted;
  }

  const notes = [];
  const recorder = {
    note: (kind, detail) => notes.push(`${kind} ${detail}`),
    idOf: () => 7,
    track() {},
    deepQueryAll: (selector) => [...document.querySelectorAll(selector)],
  };

  beforeEach(() => {
    settings.update({ 'video.autoplay': 'manual' });
    notes.length = 0;
  });

  it('hands the SDK the real window, so its own identity checks hold', () => {
    const { frame } = mountPlayer();
    start();
    expect(frame.contentWindow).toBe(ORIGINAL_GET.call(frame));
  });

  it('catches the form the SDK submits inside the frame, and keeps it instead of sending it', () => {
    const { frame, wrapper } = mountPlayer();
    start({ isGenuine: () => true, recorder });
    const realSubmit = vi.fn();
    sdkPosts(frame);
    expect(realSubmit).not.toHaveBeenCalled();
    expect(placeholderIn(wrapper)).not.toBeNull();
    expect(placeholderIn(wrapper).querySelector('a').href).toBe(SRC);
    expect(guard.inspect().join('\n')).toContain('held (form submission intercepted) [allow:autoplay path:player host:sharepoint near:video-hint in-post]');
    expect(guard.inspect().join('\n')).toContain('loads-by=form');
    const held = notes.find((line) => line.startsWith('frame-form-held'));
    expect(held).toContain('via submit() post https://*.sharepoint.com (3 labels)/_layouts/15/embed.aspx?UniqueId=<number> fields=[access_token]');
    expect(held).not.toContain('secret-token');
  });

  it('catches a submission by event too', () => {
    const { frame, wrapper } = mountPlayer();
    start();
    const event = sdkPosts(frame, { viaEvent: true });
    expect(event.defaultPrevented).toBe(true);
    expect(placeholderIn(wrapper)).not.toBeNull();
  });

  it('posts the kept form from inside the frame on a click, as the SDK did', () => {
    const { frame, wrapper } = mountPlayer();
    const posted = watchRealmSubmit(frame);
    start();
    sdkPosts(frame);
    expect(posted).toHaveLength(0);
    placeholderIn(wrapper).click();
    expect(posted).toEqual([{
      method: 'post',
      action: SRC,
      target: '',
      inFrame: true,
      fields: [['access_token', 'secret-token']],
    }]);
    expect(document.querySelector('body > form')).toBeNull();
    expect(placeholderIn(wrapper)).toBeNull();
    expect(guard.inspect().join('\n')).toContain('released: clicked');
  });

  it('brings the tile back when the frame is still blank after the click', () => {
    const { frame, wrapper } = mountPlayer();
    const posted = watchRealmSubmit(frame);
    start();
    sdkPosts(frame);
    placeholderIn(wrapper).click();
    expect(placeholderIn(wrapper)).toBeNull();
    expect(posted).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(placeholderIn(wrapper)).not.toBeNull();
    expect(guard.inspect().join('\n')).toContain('held again after a failed load');
    // And it can be tried again, with the realm's own submit as before.
    placeholderIn(wrapper).click();
    expect(posted).toHaveLength(2);
  });

  it('shows the kept form in the guard summary, without values', () => {
    const { frame } = mountPlayer();
    start();
    sdkPosts(frame);
    const summary = guard.inspect().join('\n');
    expect(summary).toContain('form: post https://*.sharepoint.com (3 labels)/_layouts/15/embed.aspx?UniqueId=<number>  fields=[access_token]');
    expect(summary).not.toContain('secret-token');
  });

  it('rebuilds the frame and posts into it when the SDK gave up and removed its own', () => {
    const { frame, wrapper } = mountPlayer();
    start();
    sdkPosts(frame);
    // The SDK, hearing nothing from a player that never loaded, tears down.
    frame.remove();
    guard.onDomChanged();
    expect(placeholderIn(wrapper)).not.toBeNull();
    placeholderIn(wrapper).click();
    const rebuilt = wrapper.querySelector('iframe.tc-video-rebuilt');
    expect(rebuilt.getAttribute('allow')).toBe('autoplay *;clipboard-write *;');
    expect(rebuilt.getAttribute('sandbox')).toBe('allow-forms allow-scripts allow-same-origin');
    expect(rebuilt.getAttribute('src')).toBeNull();
    const inside = ORIGINAL_GET.call(rebuilt).document.querySelector('form');
    expect(inside.action).toBe(SRC);
    expect(inside.elements.access_token.value).toBe('secret-token');
  });

  it('notes what else the SDK does in there, for the report', () => {
    const { frame } = mountPlayer();
    start({ isGenuine: () => true, recorder });
    const win = frame.contentWindow;
    win.postMessage({ hello: 1 }, '*');
    win.document.write('<p>x</p>');
    const script = win.document.createElement('script');
    win.document.body.append(script);
    expect(notes.some((line) => line.startsWith('frame-window #7 first reached'))).toBe(true);
    expect(notes.some((line) => line.startsWith('frame-message #7'))).toBe(true);
    expect(notes.some((line) => line === 'frame-doc-write #7 <8 chars>')).toBe(true);
  });

  it('instruments nothing else', () => {
    const plain = document.createElement('iframe');
    document.body.append(plain);
    const { frame: noAutoplay } = mountPlayer({ allow: 'clipboard-write *' });
    start({ isGenuine: () => true, recorder });
    void plain.contentWindow;
    void noAutoplay.contentDocument;
    expect(notes.some((line) => line.startsWith('frame-window'))).toBe(false);
  });

  it('records a frame it is waiting for, so the report can say so', () => {
    const { frame } = mountPlayer();
    start();
    guard.onDomChanged();
    expect(guard.inspect().join('\n')).toContain('waiting: no address yet, navigation will be intercepted');
    expect(frame.getAttribute('src')).toBeNull();
  });

  it('does nothing when the setting is off, and puts the prototype back', () => {
    settings.update({ 'video.autoplay': 'engage' });
    const { frame } = mountPlayer();
    start();
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get).toBe(ORIGINAL_GET);
    expect(frame.contentWindow).toBe(ORIGINAL_GET.call(frame));
  });

  it('restores the hook when switched off, and lets what was held load', () => {
    const { frame, wrapper } = mountPlayer();
    const posted = watchRealmSubmit(frame);
    start();
    sdkPosts(frame);
    settings.update({ 'video.autoplay': 'engage' });
    guard.onSettingsChanged({ 'video.autoplay': 'engage' });
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get).toBe(ORIGINAL_GET);
    expect(posted).toHaveLength(1);
    expect(placeholderIn(wrapper)).toBeNull();
  });
});

describe('plain videos, before they start', () => {
  beforeEach(() => {
    settings.update({ 'video.autoplay': 'manual' });
  });

  it('disarms autoplay and preload on a video found on the page', () => {
    const { video } = mountVideo();
    video.setAttribute('autoplay', '');
    start();
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.preload).toBe('none');
  });

  it('disarms a video added later', async () => {
    start();
    const { video } = mountVideo();
    video.setAttribute('autoplay', '');
    await Promise.resolve();
    await Promise.resolve();
    expect(video.hasAttribute('autoplay')).toBe(false);
  });

  it('checks shadow roots and readable frames on the slow tick', () => {
    const roots = [];
    const recorder = {
      note() {},
      idOf: () => 1,
      track() {},
      deepQueryAll: (selector) => [document, ...roots].flatMap((root) => [...root.querySelectorAll(selector)]),
    };
    start({ isGenuine: () => true, recorder });
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    roots.push(root);
    const video = document.createElement('video');
    video.muted = true;
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    video.pause = vi.fn();
    root.append(video);
    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
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
