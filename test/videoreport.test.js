import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as settings from '../src/core/settings.js';
import { createVideoGuard } from '../src/features/video.js';
import { createVideoRecorder, redactHost, redactUrl } from '../src/features/videoreport.js';
import { createPost, stubLayout } from './fixtures.js';

const TENANT_URL =
  'https://contoso-my.sharepoint.com/personal/jane_doe_contoso_com/_layouts/15/embed.aspx'
  + '?UniqueId=0b5a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d&embed=%7B%22af%22%3Atrue%7D&referrer=Yammer&nav=true';

let recorder;

beforeEach(() => {
  stubLayout(window);
  localStorage.clear();
  settings.load();
  document.body.innerHTML = '';
});

afterEach(() => {
  recorder?.stop();
  recorder = null;
});

describe('redaction', () => {
  it('keeps the product and the structure of an address, and nothing of the tenant', () => {
    const shape = redactUrl(TENANT_URL);
    expect(shape).toBe(
      'https://*.sharepoint.com (3 labels)/personal/~/_layouts/15/embed.aspx'
      + '?UniqueId=<uuid>&embed=<11 chars>&referrer=<6 chars>&nav=true',
    );
    expect(shape).not.toMatch(/contoso|jane|doe/i);
  });

  it('describes the odd addresses without reading them', () => {
    expect(redactUrl('')).toBe('(none)');
    expect(redactUrl(null)).toBe('(none)');
    expect(redactUrl('about:blank')).toBe('about:blank');
    expect(redactUrl('blob:https://engage.cloud.microsoft/123')).toBe('blob:<redacted>');
    expect(redactUrl('data:video/mp4;base64,AAAA')).toBe('data:video/mp4');
  });

  it('keeps public product hosts and reduces tenant hosts', () => {
    expect(redactHost('engage.cloud.microsoft')).toBe('engage.cloud.microsoft');
    expect(redactHost('contoso.sharepoint.com')).toBe('*.sharepoint.com (3 labels)');
    expect(redactHost('contoso-files.svc.ms')).toBe('*.svc.ms (3 labels)');
    expect(redactHost('example.org')).toBe('example.org');
  });
});

describe('the report', () => {
  function mountPlayer() {
    const post = createPost({ author: 'Jane Doe', body: 'Watch this one, it is about the Contoso merger.' });
    const wrapper = document.createElement('div');
    wrapper.className = 'focus-catcher-wrapper';
    const frame = document.createElement('iframe');
    frame.setAttribute('src', TENANT_URL);
    frame.setAttribute('allow', 'autoplay *; fullscreen *');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('title', 'Contoso merger town hall recording');
    frame.setAttribute('name', 'frame-jane-doe');
    wrapper.append(frame);
    post.append(wrapper);
    document.body.append(post);
    return { post, frame };
  }

  it('contains the structure of a player and none of its content', () => {
    mountPlayer();
    recorder = createVideoRecorder();
    recorder.start();
    const report = recorder.report({ header: ['Threadcalm test'], setting: 'engage' });

    expect(report).toContain('frames: 1');
    expect(report).toContain('autoplay-allowed frames: 1');
    expect(report).toContain('allow="autoplay *; fullscreen *"');
    expect(report).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(report).toContain('title=<34 chars>');
    expect(report).toContain('name=<14 chars>');
    expect(report).toContain('.focus-catcher-wrapper');
    expect(report).toContain('[post]');
    expect(report).toContain('frame-added');

    expect(report).not.toMatch(/contoso|jane|doe|merger|town hall|watch this/i);
  });

  it('records what happens to a frame over time', async () => {
    const { frame } = mountPlayer();
    recorder = createVideoRecorder();
    recorder.start();
    frame.setAttribute('src', 'about:blank');
    await Promise.resolve();
    frame.remove();
    recorder.onDomChanged();
    const report = recorder.report();
    expect(report).toContain('frame-attr     #1 src -> about:blank');
    expect(report).toContain('frame-removed  #1');
  });

  it('folds a fact repeated over and over into one line with a count', () => {
    recorder = createVideoRecorder();
    recorder.start();
    for (let i = 0; i < 40; i += 1) recorder.note('frame-message', '#3 page -> frame');
    recorder.note('frame-form-held', '#3 via submit()');
    const report = recorder.report();
    expect(report.match(/frame-message/g)).toHaveLength(1);
    expect(report).toMatch(/frame-message {2}#3 page -> frame {3}x40, until [\d.]+s/);
    expect(report).toContain('frame-form-held #3 via submit()');
  });

  it('records videos and their events', () => {
    const video = document.createElement('video');
    video.muted = true;
    video.setAttribute('autoplay', '');
    video.setAttribute('src', 'https://contoso.sharepoint.com/sites/Finance/video.mp4');
    document.body.append(video);
    recorder = createVideoRecorder();
    recorder.start();
    video.dispatchEvent(new Event('play'));
    const report = recorder.report();
    expect(report).toContain('videos: 1');
    expect(report).toContain('video-added    #1 muted=true autoplay-attr=true');
    expect(report).toContain('video-play     #1');
    expect(report).toContain('/sites/~/~');
    expect(report).not.toMatch(/contoso|finance/i);
  });

  it('finds a video inside a shadow root, open or closed', () => {
    recorder = createVideoRecorder();
    recorder.start();
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'closed' });
    root.append(document.createElement('video'));
    recorder.onDomChanged();
    const report = recorder.report();
    expect(report).toContain('shadow roots tracked: 1');
    expect(report).toContain('videos: 1');
    expect(report).toContain('in-shadow');
    expect(report).toContain('-- shadow root boundary --');
    expect(report).toContain('[shadow host]');
  });

  it('includes what the guard decided', () => {
    settings.update({ 'video.autoplay': 'manual' });
    mountPlayer();
    recorder = createVideoRecorder();
    recorder.start();
    const guard = createVideoGuard({ recorder });
    guard.start();
    const report = recorder.report({ setting: 'manual', guard: guard.inspect() });
    expect(report).toContain('mode: manual   listening: true');
    expect(report).toContain('frame #1: held (address blanked) [allow:autoplay path:player host:sharepoint in-post]');
    expect(report).toContain('frame-held     #1');
    guard.stop();
  });
});
